/**
 * Stale — Page Analyzer
 * Extracts dates from any web page and displays a floating freshness badge.
 */
(async () => {
  try {

    const Stale = window.Stale;
    if (!Stale || !Stale.CONFIG) {
      console.warn('[Stale] Shared modules not loaded');
      return;
    }

    const { CONFIG, DateUtils, Freshness, Messaging, Extractors } = Stale;

    if (!document.body) return;

    // Check if extension is enabled (default to enabled if SW not ready)
    let prefs = null;
    try {
      prefs = await Messaging.getPreferences();
    } catch {
      // SW not ready
    }
    if (!prefs) {
      prefs = {
        enabled: true,
        showBadgeOnPages: true,
        showBadgeOnSerp: true,
        thresholds: CONFIG.THRESHOLDS,
        badgePosition: 'top-right',
        badgeOpacity: 0.85
      };
    }
    if (prefs.enabled === false || prefs.showBadgeOnPages === false) return;

    const url = window.location.href;

    // ── Try cache first ─────────────────────────────────

    let dateInfo = null;
    try {
      const cached = await Messaging.getCache(url);
      if (cached && cached.entry) {
        dateInfo = {
          published:  cached.entry.published ? new Date(cached.entry.published) : null,
          modified:   cached.entry.modified ? new Date(cached.entry.modified) : null,
          confidence: cached.entry.confidence,
          source:     cached.entry.source
        };
      }
    } catch {
      // Cache unavailable
    }

    // ── Extract if not cached ───────────────────────────

    if (!dateInfo) {
      let result = null;
      try {
        result = Extractors.pipeline.run(document);
      } catch (e) {
        console.debug('[Stale] Extraction pipeline error:', e.message);
      }

      // Also check HTTP Last-Modified header from SW
      let lastModHeader = null;
      try {
        const httpRes = await Messaging.getHttpDate(url);
        if (httpRes && httpRes.date) {
          lastModHeader = DateUtils.parseDate(httpRes.date);
        }
      } catch {
        // Header not available
      }

      if (result) {
        dateInfo = result;
        if (!dateInfo.modified && lastModHeader) {
          dateInfo.modified = lastModHeader;
        }
      } else if (lastModHeader) {
        dateInfo = {
          published: null,
          modified: lastModHeader,
          confidence: 0.40,
          source: 'http-header'
        };
      }

      // Cache the result
      if (dateInfo) {
        try {
          await Messaging.setCache(url, {
            published:  dateInfo.published ? dateInfo.published.toISOString() : null,
            modified:   dateInfo.modified ? dateInfo.modified.toISOString() : null,
            confidence: dateInfo.confidence,
            source:     dateInfo.source
          });
        } catch {
          // Cache write failed
        }
      }
    }

    // Show grey badge even when no date found, so user knows Stale is active
    if (!dateInfo) {
      dateInfo = { published: null, modified: null, confidence: 0, source: 'none' };
    }

    // ── Compute freshness ───────────────────────────────

    const thresholds = prefs.thresholds || CONFIG.THRESHOLDS;
    const freshness = Freshness.getFreshnessInfo(
      dateInfo.published, dateInfo.modified, thresholds
    );

    // ── Create the floating badge (Shadow DOM) ──────────

    createStaleBadge(freshness, dateInfo, prefs);

  } catch (err) {
    console.error('[Stale] Page analyzer error:', err);
  }
})();


function createStaleBadge(freshness, dateInfo, prefs) {
  // Remove existing badge if any
  const existing = document.getElementById('stale-badge-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'stale-badge-host';

  // Style the host element directly (Shadow DOM :host doesn't always work)
  const posMap = {
    'top-right':    { top: '16px', right: '16px', bottom: 'auto', left: 'auto' },
    'top-left':     { top: '16px', right: 'auto', bottom: 'auto', left: '16px' },
    'bottom-right': { top: 'auto', right: '16px', bottom: '16px', left: 'auto' },
    'bottom-left':  { top: 'auto', right: 'auto', bottom: '16px', left: '16px' }
  };
  const pos = posMap[prefs.badgePosition] || posMap['top-right'];
  const opacity = prefs.badgeOpacity ?? 0.85;

  host.style.cssText = `
    all: initial !important;
    position: fixed !important;
    top: ${pos.top} !important;
    right: ${pos.right} !important;
    bottom: ${pos.bottom} !important;
    left: ${pos.left} !important;
    z-index: 2147483647 !important;
    pointer-events: auto !important;
    display: block !important;
  `;

  const shadow = host.attachShadow({ mode: 'closed' });

  const sourceLabel = dateInfo.source === 'json-ld' ? 'JSON-LD'
    : dateInfo.source === 'meta' ? 'Meta tag'
    : dateInfo.source === 'time-element' ? '<time> tag'
    : dateInfo.source === 'heuristic' ? 'Text pattern'
    : dateInfo.source === 'http-header' ? 'HTTP header'
    : dateInfo.source === 'none' ? 'No date detected'
    : dateInfo.source;

  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }

      .stale-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: ${freshness.color};
        opacity: ${opacity};
        cursor: pointer;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 1px 4px rgba(0,0,0,0.18);
        position: relative;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      }

      .stale-dot:hover,
      .stale-dot.pinned {
        opacity: 1;
      }

      .stale-card {
        position: absolute;
        ${pos.right !== 'auto' ? 'right: 0' : 'left: 0'};
        top: 0;
        background: #1a1a1a;
        color: #e5e5e5;
        border-radius: 10px;
        padding: 0;
        width: 0;
        height: 0;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        white-space: nowrap;
        font-size: 13px;
        line-height: 1.4;
      }

      .stale-dot:hover .stale-card,
      .stale-dot.pinned .stale-card {
        width: 230px;
        height: auto;
        padding: 14px 16px;
        opacity: 1;
        pointer-events: auto;
        overflow: visible;
      }

      .stale-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }

      .stale-color-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${freshness.color};
        flex-shrink: 0;
      }

      .stale-label {
        font-weight: 600;
        font-size: 14px;
        color: ${freshness.color};
      }

      .stale-age {
        font-size: 12px;
        color: #999;
        margin-left: auto;
      }

      .stale-detail {
        font-size: 12px;
        color: #aaa;
        margin: 4px 0;
      }

      .stale-detail strong {
        color: #ccc;
        font-weight: 500;
      }

      .stale-source {
        font-size: 11px;
        color: #666;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #333;
      }

      .stale-close {
        position: absolute;
        top: 8px;
        right: 10px;
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 2px;
      }
      .stale-close:hover { color: #aaa; }
    </style>

    <div class="stale-dot" id="staleDot">
      <div class="stale-card">
        <button class="stale-close" id="staleClose">&times;</button>
        <div class="stale-header">
          <span class="stale-color-dot"></span>
          <span class="stale-label">${freshness.label}</span>
          <span class="stale-age">${freshness.ageText}</span>
        </div>
        ${dateInfo.published ? `<div class="stale-detail"><strong>Published:</strong> ${freshness.publishedFormatted}</div>` : ''}
        ${dateInfo.modified ? `<div class="stale-detail"><strong>Modified:</strong> ${freshness.modifiedFormatted}</div>` : ''}
        ${!dateInfo.published && !dateInfo.modified ? `<div class="stale-detail">No date detected</div>` : ''}
        <div class="stale-source">Source: ${sourceLabel}</div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(host);

  // Pin/unpin on click
  const dot = shadow.getElementById('staleDot');
  dot.addEventListener('click', (e) => {
    e.stopPropagation();
    dot.classList.toggle('pinned');
  });

  // Close button removes the badge for this session
  const closeBtn = shadow.getElementById('staleClose');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    host.remove();
  });
}
