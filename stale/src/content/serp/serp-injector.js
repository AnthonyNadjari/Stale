/**
 * Stale — Google SERP Injector
 * Injects freshness badges onto Google Search results.
 */
(async () => {

  const { CONFIG, DateUtils, Freshness, Messaging } = window.Stale;

  // Check if extension is enabled
  const prefs = await Messaging.getPreferences();
  if (!prefs || !prefs.enabled || !prefs.showBadgeOnSerp) return;

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
    // Multiple defensive selectors for Google result containers
    const results = getOrganicResults();

    for (const result of results) {
      if (result.dataset.staleProcessed) continue;
      result.dataset.staleProcessed = 'true';

      const link = result.querySelector('a[href]');
      if (!link) continue;

      const url = link.href;
      if (!url || url.startsWith('javascript:') || url.startsWith('#')) continue;

      // Try cache first
      let dateInfo = null;
      const cached = await Messaging.getCache(url);

      if (cached?.entry) {
        dateInfo = {
          published:  cached.entry.published ? new Date(cached.entry.published) : null,
          modified:   cached.entry.modified ? new Date(cached.entry.modified) : null,
          confidence: cached.entry.confidence,
          source:     cached.entry.source
        };
      }

      // If not cached, extract from the snippet text
      if (!dateInfo) {
        dateInfo = extractDateFromSnippet(result);
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
    // Primary: div.g is the classic Google result container
    const selectors = [
      '#search .g:not(.stale-limit-banner)',
      '#search [data-sokoban-container]',
      '#rso .g',
      '#rso > div > div.g'
    ];

    const seen = new Set();
    const results = [];

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (!seen.has(el) && el.querySelector('a[href] h3')) {
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
   * Try to extract a date from the Google snippet text.
   * Google often shows dates like "Jan 15, 2024 — " or "3 days ago — "
   */
  function extractDateFromSnippet(resultEl) {
    // Look for the snippet / description area
    const snippetEls = resultEl.querySelectorAll(
      '[data-sncf], .VwiC3b, .IsZvec, .lEBKkf, span[class]'
    );

    for (const el of snippetEls) {
      const text = el.textContent || '';
      // Google typically puts dates at the start of snippets
      const first200 = text.substring(0, 200);

      // Pattern: "Jan 15, 2024" / "January 15, 2024"
      let m = first200.match(/^(\w{3,9}\s+\d{1,2},\s+\d{4})/);
      if (m) {
        const d = DateUtils.parseDate(m[1]);
        if (d) return { published: d, modified: null, confidence: 0.70, source: 'serp-snippet' };
      }

      // Pattern: "15 Jan 2024"
      m = first200.match(/^(\d{1,2}\s+\w{3,9}\s+\d{4})/);
      if (m) {
        const d = DateUtils.parseDate(m[1]);
        if (d) return { published: d, modified: null, confidence: 0.70, source: 'serp-snippet' };
      }

      // Pattern: "3 days ago", "2 months ago", etc.
      m = first200.match(/^(\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)/i);
      if (m) {
        const d = DateUtils.parseDate(m[1]);
        if (d) return { published: d, modified: null, confidence: 0.65, source: 'serp-snippet' };
      }

      // Pattern: "2024-01-15"
      m = first200.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) {
        const d = DateUtils.parseDate(m[1]);
        if (d) return { published: d, modified: null, confidence: 0.70, source: 'serp-snippet' };
      }
    }

    // Also check the cite/breadcrumb area (some results show dates there)
    const citeEls = resultEl.querySelectorAll('cite, .TbwUpd, .byrV5b');
    for (const el of citeEls) {
      const text = el.textContent || '';
      const m = text.match(/(\w{3,9}\s+\d{1,2},\s+\d{4})/);
      if (m) {
        const d = DateUtils.parseDate(m[1]);
        if (d) return { published: d, modified: null, confidence: 0.60, source: 'serp-snippet' };
      }
    }

    return null;
  }

  /**
   * Inject the freshness badge next to the result title.
   */
  function injectBadge(resultEl, freshness, dateInfo) {
    const titleLink = resultEl.querySelector('a[href] h3');
    if (!titleLink) return;

    const badge = document.createElement('span');
    badge.className = `stale-serp-badge stale-serp-badge--${freshness.colorName}`;
    badge.textContent = freshness.shortAge;
    badge.setAttribute('data-stale-badge', 'true');

    // Tooltip
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

    // Insert after the h3 title
    titleLink.parentElement.insertBefore(badge, titleLink.nextSibling);
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

})();
