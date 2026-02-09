/**
 * Stale — Google SERP Injector
 * Injects freshness badges onto Google Search results.
 * Uses Shadow DOM to isolate badge styles from Google's stylesheets.
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

  // Month names: only used inside tryExtractDate (no top-level EN_MONTHS/FR_MONTHS to avoid duplicate declaration)
  const FR_TO_EN = {
    'janv': 'Jan', 'févr': 'Feb', 'mars': 'Mar', 'avr': 'Apr',
    'mai': 'May', 'juin': 'Jun', 'juil': 'Jul', 'août': 'Aug',
    'sept': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'déc': 'Dec'
  };
  const DE_MONTHS = { jan: 'Jan', feb: 'Feb', mär: 'Mar', mar: 'Mar', apr: 'Apr', mai: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug', sep: 'Sep', okt: 'Oct', nov: 'Nov', dez: 'Dec' };
  const ES_MONTHS = { ene: 'Jan', feb: 'Feb', mar: 'Mar', abr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dic: 'Dec' };
  function normalizeDateStr(str) {
    let s = str.replace(/(\w+)\.\s/g, '$1 ');
    for (const [fr, en] of Object.entries(FR_TO_EN)) {
      const re = new RegExp('\\b' + fr + '\\b', 'gi');
      s = s.replace(re, en);
    }
    for (const [de, en] of Object.entries(DE_MONTHS)) { s = s.replace(new RegExp('\\b' + de + '\\b', 'gi'), en); }
    for (const [es, en] of Object.entries(ES_MONTHS)) { s = s.replace(new RegExp('\\b' + es + '\\b', 'gi'), en); }
    return s;
  }
  function tryExtractDate(text) {
    if (!text) return null;
    const t = text.substring(0, 1000);
    const monthsPat = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|jan|feb|mär|mar|abr|may|ago|dic|ene|dez|okt';
    // Month name + day + year (e.g. "Jan 15, 2021", "30 janv. 2018")
    let m = t.match(new RegExp('((?:' + monthsPat + ')\\w*\\.?\\s+\\d{1,2},?\\s+\\d{4})', 'i'));
    if (m) {
      const d = DateUtils.parseDate(normalizeDateStr(m[1]));
      if (d) return { published: d, modified: null, confidence: 0.72, source: 'serp-snippet' };
    }
    m = t.match(new RegExp('(\\d{1,2}\\s+(?:' + monthsPat + ')\\w*\\.?\\s+\\d{4})', 'i'));
    if (m) {
      const d = DateUtils.parseDate(normalizeDateStr(m[1]));
      if (d) return { published: d, modified: null, confidence: 0.72, source: 'serp-snippet' };
    }
    // "— 30 janv. 2018" or "· 30 janv. 2018" or " - Jan 15, 2021" (common in snippets)
    m = t.match(new RegExp('[—·\\-]\\s*(\\d{1,2}\\s+(?:' + monthsPat + ')\\w*\\.?\\s+\\d{4}|(?:' + monthsPat + ')\\w*\\.?\\s+\\d{1,2},?\\s+\\d{4})', 'i'));
    if (m) {
      const d = DateUtils.parseDate(normalizeDateStr(m[1].trim()));
      if (d) return { published: d, modified: null, confidence: 0.75, source: 'serp-snippet' };
    }
    // "Published Mar 15, 2021" / "Publié le 15 mars 2021" / "Updated ..." / "Modified ..."
    m = t.match(new RegExp('(?:published|publié|paru|updated|modified|modifié|mise à jour)\\s*(?:le?|on)?\\s*((?:' + monthsPat + ')\\w*\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+(?:' + monthsPat + ')\\w*\\.?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})', 'i'));
    if (m) {
      const d = DateUtils.parseDate(normalizeDateStr(m[1]));
      if (d) return { published: d, modified: null, confidence: 0.78, source: 'serp-snippet' };
    }
    m = t.match(/(\b\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)/i);
    if (m) {
      const d = DateUtils.parseDate(m[1]);
      if (d) return { published: d, modified: null, confidence: 0.65, source: 'serp-snippet' };
    }
    m = t.match(/il\s+y\s+a\s+(\d+)\s+(minute|heure|jour|semaine|mois|an)s?/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      const map = { minute: 'minute', heure: 'hour', jour: 'day', semaine: 'week', mois: 'month', an: 'year' };
      const d = DateUtils.parseDate(`${n} ${map[unit] || 'day'}s ago`);
      if (d) return { published: d, modified: null, confidence: 0.65, source: 'serp-snippet' };
    }
    // "8 years" / "8 ans" / "2 months" (snippet often shows "X years" without "ago")
    m = t.match(/\b(\d+)\s+(years?|ans?)\b/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const d = DateUtils.parseDate(`${n} years ago`);
      if (d) return { published: d, modified: null, confidence: 0.68, source: 'serp-snippet' };
    }
    m = t.match(/\b(\d+)\s+(months?|mois)\b/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const d = DateUtils.parseDate(`${n} months ago`);
      if (d) return { published: d, modified: null, confidence: 0.66, source: 'serp-snippet' };
    }
    m = t.match(/\b(\d+)\s+(days?|jours?|weeks?|semaines?)\b/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const u = (m[2] || '').toLowerCase();
      const unit = /day|jour/.test(u) ? 'days' : 'weeks';
      const d = DateUtils.parseDate(`${n} ${unit} ago`);
      if (d) return { published: d, modified: null, confidence: 0.64, source: 'serp-snippet' };
    }
    // "last week" / "last month" / "cette semaine" / "ce mois"
    m = t.match(/(?:last|past)\s+(week|month|year)/i);
    if (m) {
      const d = DateUtils.parseDate('1 ' + (m[1] || 'week') + ' ago');
      if (d) return { published: d, modified: null, confidence: 0.60, source: 'serp-snippet' };
    }
    m = t.match(/(\b\d{4}-\d{2}-\d{2})/);
    if (m) {
      const d = DateUtils.parseDate(m[1]);
      if (d) return { published: d, modified: null, confidence: 0.70, source: 'serp-snippet' };
    }
    m = t.match(/(\b\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})/);
    if (m) {
      const d = DateUtils.parseDate(m[1]);
      if (d) return { published: d, modified: null, confidence: 0.55, source: 'serp-snippet' };
    }
    return null;
  }
  function extractDateFromSnippet(resultEl) {
    // 1) Short explicit date elements first (Google date spans, high confidence)
    const dateSelectors = 'span[data-sncf="2"], span.MUxGbd, [data-sncf], span[class*="date"], span[class*="Date"], .f, .LEwnzc.Sqrs3e';
    const dateEls = resultEl.querySelectorAll(dateSelectors);
    for (const el of dateEls) {
      const text = (el.textContent || '').trim();
      if (text && text.length < 120) {
        const normalized = normalizeDateStr(text);
        const d = DateUtils.parseDate(normalized);
        if (d) return { published: d, modified: null, confidence: 0.78, source: 'serp-date-element' };
      }
    }
    // 2) Snippet / description blocks (priority: short blocks then longer)
    const snippetSelectors = '[data-sncf], .VwiC3b, .IsZvec, .lEBKkf, .LEwnzc, .Uroaid, .VuuXrf, .yXK7lf, .s3v9rd, .st, div[data-content-feature="1"], [data-content-feature]';
    const snippetEls = resultEl.querySelectorAll(snippetSelectors);
    const byLength = Array.from(snippetEls)
      .map(el => ({ el, text: (el.textContent || '').trim() }))
      .filter(({ text }) => text.length >= 10)
      .sort((a, b) => a.text.length - b.text.length);
    for (const { text } of byLength) {
      const date = tryExtractDate(text);
      if (date) return date;
    }
    // 3) Cite / URL line (sometimes has date)
    const citeEls = resultEl.querySelectorAll('cite, .TbwUpd, .byrV5b, .Uroaid, .qzEoUe');
    for (const el of citeEls) {
      const text = (el.textContent || '').trim();
      if (!text) continue;
      const date = tryExtractDate(text);
      if (date) return { ...date, confidence: 0.60 };
    }
    // 4) Full result text (catch dates anywhere in the card)
    const fullText = (resultEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (fullText.length > 50) {
      const date = tryExtractDate(fullText);
      if (date) return { ...date, confidence: Math.min(0.65, date.confidence) };
    }
    return null;
  }

  // ── Shadow DOM CSS (declared early to avoid TDZ) ────────────────

  const BADGE_SHADOW_CSS = `
    :host { display: inline-flex !important; vertical-align: middle !important; margin-left: 6px !important; }
    .b {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 2px 8px 2px 6px; border-radius: 6px;
      font: 500 12px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
      white-space: nowrap; color: #fff; cursor: default;
      border: 1px solid rgba(255,255,255,0.35);
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
      position: relative; direction: ltr;
    }
    .b.checking { animation: stale-pulse 1.2s ease-in-out infinite; }
    @keyframes stale-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .d { display: inline-block; width: 7px; height: 7px; border-radius: 50%;
         background: rgba(255,255,255,0.9); flex-shrink: 0; }
    .l { font-weight: 600; }
    .a { color: rgba(255,255,255,0.9); }
    .t { display: none; position: absolute; top: calc(100% + 6px); left: 0;
         background: #1a1a1a; color: #d4d4d4; border-radius: 8px;
         padding: 10px 14px; width: 220px; z-index: 999999;
         box-shadow: 0 4px 16px rgba(0,0,0,0.25);
         font: 400 12px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
         white-space: normal; pointer-events: none; direction: ltr; }
    .b:hover .t { display: block; }
    .th { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .td { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .tl { font-weight: 600; font-size: 13px; }
    .ta { margin-left: auto; color: #888; font-size: 11px; }
    .tr { color: #aaa; margin: 3px 0; }
    .tr strong { color: #ccc; font-weight: 500; }
    .ts { color: #666; margin-top: 6px; padding-top: 6px;
          border-top: 1px solid #333; font-size: 11px; }
  `;

  // ── Deep fetch queue: fetch URLs in background to detect dates ──

  const deepFetchQueue = [];
  const DEEP_FETCH_CONCURRENCY = 5;
  let deepFetchRunning = false;

  async function processDeepFetchQueue() {
    if (deepFetchRunning) return;
    deepFetchRunning = true;
    console.log('[Stale] Deep fetch: processing', deepFetchQueue.length, 'URLs');

    while (deepFetchQueue.length > 0) {
      const batch = deepFetchQueue.splice(0, DEEP_FETCH_CONCURRENCY);
      await Promise.all(batch.map(async ({ result, url }) => {
        try {
          const resp = await Messaging.fetchDateFromUrl(url);
          if (!resp?.entry) {
            // No date found — update badge to static Unknown (stop pulsing)
            const noDateFreshness = Freshness.getFreshnessInfo(null, null, thresholds);
            injectBadge(result, noDateFreshness, null);
            return;
          }

          const dateInfo = {
            published: resp.entry.published ? new Date(resp.entry.published) : null,
            modified:  resp.entry.modified ? new Date(resp.entry.modified) : null,
            confidence: resp.entry.confidence,
            source:     resp.entry.source
          };

          // Recompute freshness and update the badge
          const freshness = Freshness.getFreshnessInfo(dateInfo.published, dateInfo.modified, thresholds);
          injectBadge(result, freshness, dateInfo);
          console.debug('[Stale] Deep fetch updated badge:', freshness.label, url);
        } catch (err) {
          console.debug('[Stale] Deep fetch failed for', url, err);
        }
      }));
    }

    deepFetchRunning = false;
  }

  // ── Quota check ─────────────────────────────────────

  const quotaStatus = await Messaging.checkQuota();
  let quotaExhausted = quotaStatus && !quotaStatus.allowed;

  if (quotaExhausted) {
    showLimitBanner();
  }

  // ── Process current results ─────────────────────────

  await processResults();

  // Trigger deep fetch for results that had no date from snippet
  processDeepFetchQueue();

  // Increment quota once per SERP page; retries + deferred increment if SW was cold
  if (!quotaExhausted) {
    let inc = await Messaging.incrementQuota();
    if (inc == null) {
      await new Promise(r => setTimeout(r, 500));
      inc = await Messaging.incrementQuota();
    }
    if (inc == null) {
      await new Promise(r => setTimeout(r, 1000));
      inc = await Messaging.incrementQuota();
    }
    if (inc == null) {
      setTimeout(async () => {
        const ret = await Messaging.incrementQuota();
        if (ret != null) console.log('[Stale] Quota incremented (deferred)');
      }, 2000);
    }
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
    if (hasNewResults) {
      processResults().then(() => processDeepFetchQueue());
    }
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

      if (dateInfo) {
        // We have a date — show the real badge
        const freshness = Freshness.getFreshnessInfo(dateInfo.published, dateInfo.modified, thresholds);
        injectBadge(result, freshness, dateInfo);
      } else {
        // No date from snippet/cache — show pulsing "Checking…" and queue deep fetch
        injectBadge(result, null, 'checking');
        deepFetchQueue.push({ result, url });
      }
    }
  }

  /**
   * Get organic search result containers. Deduplicates by main link URL
   * so we show exactly one badge per result (avoids duplicates from multiple selectors).
   */
  function getOrganicResults() {
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
    const byUrl = new Map(); // first result element per normalized URL

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (seen.has(el)) continue;
          const hasTitle = el.querySelector('h3');
          if (!hasTitle) continue;
          seen.add(el);
          const link = el.querySelector('a[href]');
          const url = link?.href;
          if (!url || url.startsWith('javascript:') || url.startsWith('#')) continue;
          const norm = url.replace(/\/$/, '').split('?')[0];
          if (byUrl.has(norm)) continue; // one badge per URL
          byUrl.set(norm, el);
        }
      } catch {
        // Selector failed — try next
      }
    }

    return Array.from(byUrl.values());
  }

  /**
   * Inject the freshness badge next to the result title.
   * Uses Shadow DOM to fully isolate from Google's stylesheets.
   * Pass dateInfo='checking' for the pulsing "Checking…" state.
   */
  function injectBadge(resultEl, freshness, dateInfo) {
    try {
      resultEl.querySelectorAll('[data-stale-badge]').forEach(el => el.remove());

      const h3 = resultEl.querySelector('h3');
      if (!h3) return;

      const isChecking = dateInfo === 'checking';
      const bg = isChecking ? '#9ca3af' : (freshness.color || '#6b7280');
      const label = isChecking ? 'Checking\u2026' : freshness.label;
      const ageText = isChecking ? '' : ('\u00b7 ' + freshness.ageText);
      const badgeClass = isChecking ? 'b checking' : 'b';

      // Shadow DOM host — appended inside h3 to stay on the same line as title text
      const host = document.createElement('span');
      host.setAttribute('data-stale-badge', 'true');
      const shadow = host.attachShadow({ mode: 'open' });

      // Build tooltip HTML
      let tipRows = '';
      if (isChecking) {
        tipRows = '<div class="tr">Fetching page to detect publication date\u2026</div>';
      } else if (dateInfo?.published) {
        tipRows += `<div class="tr"><strong>Published:</strong> ${freshness.publishedFormatted}</div>`;
        if (dateInfo.modified) tipRows += `<div class="tr"><strong>Modified:</strong> ${freshness.modifiedFormatted}</div>`;
        if (dateInfo.source) tipRows += `<div class="ts">Source: ${dateInfo.source}</div>`;
      } else if (!dateInfo) {
        tipRows = '<div class="tr">No date detected on this page.</div>';
      }

      shadow.innerHTML = `
        <style>${BADGE_SHADOW_CSS}</style>
        <span class="${badgeClass}" style="background:${bg}">
          <span class="d"></span>
          <span class="l">${label}</span>
          ${ageText ? `<span class="a">${ageText}</span>` : ''}
          <span class="t">
            <div class="th">
              <span class="td" style="background:${bg}"></span>
              <span class="tl" style="color:${bg}">${label}</span>
              ${!isChecking ? `<span class="ta">${freshness.ageText}</span>` : ''}
            </div>
            ${tipRows}
          </span>
        </span>
      `;

      h3.appendChild(host);
    } catch (e) {
      console.warn('[Stale] injectBadge failed:', e);
    }
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
