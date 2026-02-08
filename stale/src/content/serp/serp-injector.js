/**
 * Stale — Google SERP Injector
 * Injects freshness badges onto Google Search results.
 */
(async () => {
  try {

  // Guard: make sure shared modules loaded
  if (!window.Stale || !window.Stale.CONFIG) {
    console.error('[Stale] SERP injector: window.Stale not available');
    return;
  }

  const { CONFIG, DateUtils, Freshness, Messaging } = window.Stale;

  console.log('[Stale] SERP injector loaded');

  // Check if extension is enabled — if SW is cold/unresponsive, use defaults
  // so badges still appear (instead of silently aborting)
  let prefs = null;
  try {
    prefs = await Messaging.getPreferences();
  } catch (e) {
    console.warn('[Stale] getPreferences failed:', e);
  }
  if (!prefs || typeof prefs !== 'object' || prefs.error) {
    // SW not ready — use safe defaults so badges still show
    prefs = {
      enabled: true,
      showBadgeOnSerp: true,
      thresholds: CONFIG.THRESHOLDS
    };
  }
  if (prefs.enabled === false || prefs.showBadgeOnSerp === false) return;

  const thresholds = prefs.thresholds || CONFIG.THRESHOLDS;

  // ── Quota check ─────────────────────────────────────

  const quotaStatus = await Messaging.checkQuota();
  let quotaExhausted = quotaStatus && !quotaStatus.allowed;

  if (quotaExhausted) {
    showLimitBanner();
  }

  // ── Process current results ─────────────────────────

  await processResults();

  // Increment quota once per SERP page (not per result)
  if (!quotaExhausted) {
    await Messaging.incrementQuota();
  }

  // ── MutationObserver for dynamic loading ────────────

  const observer = new MutationObserver((mutations) => {
    let hasNewResults = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && (
          node.matches?.('.MjjYud') ||
          node.querySelector?.('.MjjYud') ||
          node.matches?.('.g') ||
          node.querySelector?.('.g') ||
          node.matches?.('[data-sokoban-container]') ||
          node.querySelector?.('[data-sokoban-container]')
        )) {
          hasNewResults = true;
          break;
        }
      }
      if (hasNewResults) break;
    }
    if (hasNewResults) processResults();
  });

  observer.observe(document.getElementById('search') || document.body, {
    childList: true,
    subtree: true
  });

  // ── Core: process all visible results ───────────────

  async function processResults() {
    const results = getOrganicResults();
    console.log('[Stale] Found', results.length, 'organic results');

    for (const result of results) {
      if (result.dataset.staleProcessed) continue;
      result.dataset.staleProcessed = 'true';

      // Find the link URL — try multiple selectors
      const link = result.querySelector('a[href]');
      if (!link) { console.debug('[Stale] No link in result'); continue; }

      const url = link.href;
      if (!url || url.startsWith('javascript:') || url.startsWith('#')) continue;

      let dateInfo = null;

      // Try to extract date from the snippet FIRST (instant, no SW needed)
      dateInfo = extractDateFromSnippet(result);

      // If no snippet date, try cache (may be slow if SW is waking up)
      if (!dateInfo) {
        try {
          const cached = await Messaging.getCache(url);
          if (cached?.entry) {
            dateInfo = {
              published:  cached.entry.published ? new Date(cached.entry.published) : null,
              modified:   cached.entry.modified ? new Date(cached.entry.modified) : null,
              confidence: cached.entry.confidence,
              source:     cached.entry.source
            };
          }
        } catch {
          // SW unavailable — skip cache
        }
      }

      // Compute freshness
      const freshness = dateInfo
        ? Freshness.getFreshnessInfo(dateInfo.published, dateInfo.modified, thresholds)
        : Freshness.getFreshnessInfo(null, null, thresholds);

      // Inject the badge
      injectBadge(result, freshness, dateInfo);
    }
  }

  /**
   * Get organic search result containers using multiple defensive selectors.
   */
  function getOrganicResults() {
    // Google 2025-2026: .g is gone, results now use .MjjYud as outer wrapper
    // and .yuRUbf for the title area. Keep .g as fallback for older layouts.
    const selectors = [
      '#rso > .MjjYud',
      '#rso .MjjYud',
      '#rso .g',
      '#search .g:not(.stale-limit-banner)',
      '#search [data-sokoban-container]',
      '#rso div[data-hveid][lang]',
      '#rso div.N54PNb'
    ];

    const seen = new Set();
    const results = [];

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (seen.has(el)) continue;
          // Accept the element if it has any title heading (h3)
          // Google uses both <a><h3> and <h3><a> patterns
          const hasTitle = el.querySelector('h3');
          if (hasTitle) {
            seen.add(el);
            results.push(el);
          }
        }
      } catch {
        // Selector failed — try next
      }
    }

    return results;
  }

  /**
   * Find the title element (h3) inside a result, regardless of DOM nesting.
   * Google uses both <a href><h3>title</h3></a> and <h3><a href>title</a></h3>
   */
  function findTitleElement(resultEl) {
    // Try both patterns
    return resultEl.querySelector('a[href] h3')       // <a><h3>
        || resultEl.querySelector('h3 a[href]')       // <h3><a>
        || resultEl.querySelector('h3.LC20lb')        // Google's named class
        || resultEl.querySelector('h3[class]')        // Any h3 with a class
        || resultEl.querySelector('h3');              // Bare h3
  }

  // ── Month name patterns (English + French for Google.fr) ──

  const EN_MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
  const FR_MONTHS = 'janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc';
  const ALL_MONTHS = EN_MONTHS + '|' + FR_MONTHS;

  // Map French abbreviated months to Date-parseable English
  const FR_TO_EN = {
    'janv': 'Jan', 'févr': 'Feb', 'mars': 'Mar', 'avr': 'Apr',
    'mai': 'May', 'juin': 'Jun', 'juil': 'Jul', 'août': 'Aug',
    'sept': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'déc': 'Dec'
  };

  /**
   * Normalize a date string: strip trailing dots from month abbreviations,
   * convert French month names to English equivalents.
   */
  function normalizeDateStr(str) {
    // Remove trailing dots from month abbreviations (e.g. "oct." → "oct")
    let s = str.replace(/(\w+)\.\s/g, '$1 ');
    // Replace French month names with English
    for (const [fr, en] of Object.entries(FR_TO_EN)) {
      const re = new RegExp('\\b' + fr + '\\b', 'gi');
      s = s.replace(re, en);
    }
    return s;
  }

  /**
   * Try to extract a date from the Google snippet text.
   * Google shows dates in various formats and positions within snippets.
   * Supports English and French date formats.
   */
  function extractDateFromSnippet(resultEl) {
    // Look for the snippet / description area using multiple selectors
    // Google changes class names frequently, so we cast a wide net
    const snippetEls = resultEl.querySelectorAll(
      '[data-sncf], .VwiC3b, .IsZvec, .lEBKkf, .LEwnzc, .Uroaid, span[class]'
    );

    for (const el of snippetEls) {
      const text = (el.textContent || '').trim();
      if (!text) continue;

      const date = tryExtractDate(text.substring(0, 300));
      if (date) return date;
    }

    // Also check the cite/breadcrumb area (some results show dates there)
    const citeEls = resultEl.querySelectorAll('cite, .TbwUpd, .byrV5b, .LEwnzc, .Uroaid');
    for (const el of citeEls) {
      const text = (el.textContent || '').trim();
      if (!text) continue;
      const date = tryExtractDate(text);
      if (date) return { ...date, confidence: 0.60 };
    }

    // Check for Google's dedicated date elements (span with specific data attributes)
    const dateEls = resultEl.querySelectorAll('span[data-sncf="2"], span.MUxGbd');
    for (const el of dateEls) {
      const text = (el.textContent || '').trim();
      if (text) {
        const normalized = normalizeDateStr(text);
        const d = DateUtils.parseDate(normalized);
        if (d) return { published: d, modified: null, confidence: 0.75, source: 'serp-date-element' };
      }
    }

    return null;
  }

  /**
   * Try all date patterns against a text string.
   */
  function tryExtractDate(text) {
    // Pattern: "Jan 15, 2024" / "January 15, 2024" / "oct. 15, 2024" (EN + FR)
    let m = text.match(new RegExp('((?:' + ALL_MONTHS + ')\\w*\\.?\\s+\\d{1,2},?\\s+\\d{4})', 'i'));
    if (m) {
      const d = DateUtils.parseDate(normalizeDateStr(m[1]));
      if (d) return { published: d, modified: null, confidence: 0.70, source: 'serp-snippet' };
    }

    // Pattern: "15 Jan 2024" / "15 oct. 2024" / "16 oct. 2021"
    m = text.match(new RegExp('(\\d{1,2}\\s+(?:' + ALL_MONTHS + ')\\w*\\.?\\s+\\d{4})', 'i'));
    if (m) {
      const d = DateUtils.parseDate(normalizeDateStr(m[1]));
      if (d) return { published: d, modified: null, confidence: 0.70, source: 'serp-snippet' };
    }

    // Pattern: "3 days ago", "2 months ago", etc. (English)
    m = text.match(/(\b\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)/i);
    if (m) {
      const d = DateUtils.parseDate(m[1]);
      if (d) return { published: d, modified: null, confidence: 0.65, source: 'serp-snippet' };
    }

    // Pattern: French relative "il y a X jours/mois/ans"
    m = text.match(/il\s+y\s+a\s+(\d+)\s+(minute|heure|jour|semaine|mois|an)s?/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      const map = { minute: 'minute', heure: 'hour', jour: 'day', semaine: 'week', mois: 'month', an: 'year' };
      const d = DateUtils.parseDate(`${n} ${map[unit] || 'day'}s ago`);
      if (d) return { published: d, modified: null, confidence: 0.65, source: 'serp-snippet' };
    }

    // Pattern: "2024-01-15"
    m = text.match(/(\b\d{4}-\d{2}-\d{2})/);
    if (m) {
      const d = DateUtils.parseDate(m[1]);
      if (d) return { published: d, modified: null, confidence: 0.70, source: 'serp-snippet' };
    }

    // Pattern: "01/15/2024" or "15/01/2024"
    m = text.match(/(\b\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})/);
    if (m) {
      const d = DateUtils.parseDate(m[1]);
      if (d) return { published: d, modified: null, confidence: 0.55, source: 'serp-snippet' };
    }

    return null;
  }

  /**
   * Inject the freshness badge next to the result title.
   */
  function injectBadge(resultEl, freshness, dateInfo) {
    // Avoid double-injection
    if (resultEl.querySelector('[data-stale-badge]')) return;

    // Find the h3 title element
    const h3 = resultEl.querySelector('h3');
    if (!h3) {
      console.debug('[Stale] No h3 found in result');
      return;
    }

    // Build badge: ● Label · age (matching promo style)
    const badge = document.createElement('div');
    badge.className = `stale-serp-badge stale-serp-badge--${freshness.colorName}`;
    badge.setAttribute('data-stale-badge', 'true');

    // Colored dot
    const dot = document.createElement('span');
    dot.className = 'stale-serp-badge__dot';

    // Label text (Fresh, Aging, Old, Stale, Unknown)
    const label = document.createElement('span');
    label.className = 'stale-serp-badge__label';
    label.textContent = freshness.label;

    // Age text
    const age = document.createElement('span');
    age.className = 'stale-serp-badge__age';
    age.textContent = `\u00b7 ${freshness.ageText}`;

    badge.appendChild(dot);
    badge.appendChild(label);
    badge.appendChild(age);

    // Tooltip (shows on hover with more details)
    const tooltip = document.createElement('div');
    tooltip.className = 'stale-serp-tooltip';

    let tooltipHTML = `
      <div class="stale-serp-tooltip__header">
        <span class="stale-serp-tooltip__dot" style="background:${freshness.color}"></span>
        <span class="stale-serp-tooltip__label" style="color:${freshness.color}">${freshness.label}</span>
        <span class="stale-serp-tooltip__age">${freshness.ageText}</span>
      </div>
    `;

    if (dateInfo?.published) {
      tooltipHTML += `<div class="stale-serp-tooltip__row"><strong>Published:</strong> ${freshness.publishedFormatted}</div>`;
    }
    if (dateInfo?.modified) {
      tooltipHTML += `<div class="stale-serp-tooltip__row"><strong>Modified:</strong> ${freshness.modifiedFormatted}</div>`;
    }
    if (dateInfo?.source) {
      tooltipHTML += `<div class="stale-serp-tooltip__source">Source: ${dateInfo.source}</div>`;
    }
    if (!dateInfo) {
      tooltipHTML += `<div class="stale-serp-tooltip__row">No date found yet. Visit the page to detect.</div>`;
    }

    tooltip.innerHTML = tooltipHTML;
    badge.appendChild(tooltip);

    // Find the best insertion point — we need a visible, non-clipped container
    // Google's DOM: MjjYud > (various wrappers) > a > h3
    // We want to insert OUTSIDE the <a> tag to avoid link styling and clipping

    // Walk up from h3 to find the link or title container
    const link = h3.closest('a');
    const titleContainer = link
      ? (link.parentElement || h3.parentElement)  // parent of the <a> tag
      : h3.parentElement;                         // parent of h3 if no link

    if (titleContainer) {
      // Insert after the link/title container as a new block
      titleContainer.insertBefore(badge, (link || h3).nextSibling);
      console.debug('[Stale] Badge injected after title container');
      return;
    }

    // Fallback: insert directly after h3
    if (h3.parentElement) {
      h3.parentElement.insertBefore(badge, h3.nextSibling);
      console.debug('[Stale] Badge injected after h3 (fallback)');
      return;
    }

    // Last resort: append inside h3
    h3.appendChild(badge);
    console.debug('[Stale] Badge appended inside h3 (last resort)');
  }

  /**
   * Show the daily limit banner at the top of results.
   */
  function showLimitBanner() {
    const searchEl = document.getElementById('search') || document.getElementById('rso');
    if (!searchEl) return;

    const banner = document.createElement('div');
    banner.className = 'stale-limit-banner';
    banner.innerHTML = `
      <span class="stale-limit-banner__text">
        Stale daily limit reached.
      </span>
      <a class="stale-limit-banner__link" href="#" id="staleLimitUpgrade">
        Upgrade for unlimited &rarr;
      </a>
    `;

    searchEl.insertBefore(banner, searchEl.firstChild);

    const upgradeLink = banner.querySelector('#staleLimitUpgrade');
    if (upgradeLink) {
      upgradeLink.addEventListener('click', (e) => {
        e.preventDefault();
        const url = (CONFIG && CONFIG.STRIPE_PAYMENT_LINK) || 'https://buy.stripe.com/14A4gydLk4PGgAcgEdaEE00';
        window.open(url, '_blank', 'noopener');
      });
    }
  }

  } catch (err) {
    console.error('[Stale] SERP injector error:', err);
  }
})();
