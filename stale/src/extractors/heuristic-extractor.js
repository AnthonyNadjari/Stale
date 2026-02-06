/**
 * Stale — Heuristic date extractor (confidence: 0.50)
 * Pattern-matches dates in visible page text as a last resort.
 */
window.Stale = window.Stale || {};
window.Stale.Extractors = window.Stale.Extractors || {};

window.Stale.Extractors.heuristic = (() => {

  const { parseDate } = window.Stale.DateUtils;

  // Where to look for dates (prioritized containers)
  const CONTAINER_SELECTORS = [
    'article header',
    '.post-meta',
    '.entry-meta',
    '.article-meta',
    '.byline',
    '[class*="date"]',
    '[class*="publish"]',
    '[class*="author"]',
    'header',
    'article',
    '.post-header',
    '.article-header',
    '#footer-info-lastmod',          // Wikipedia
    '#lastmod',                      // Wikipedia variant
    '[id*="lastmod"]',
    'footer [class*="date"]',
    'footer [class*="modified"]',
    'main'
  ];

  // Regex patterns for date strings
  const DATE_PATTERNS = [
    // "January 15, 2024" / "Jan 15, 2024"
    /\b(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/g,
    // "15 January 2024" / "15 Jan 2024"
    /\b(\d{1,2})\s+(\w{3,9})\s+(\d{4})\b/g,
    // "2024-01-15"
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    // "01/15/2024" or "15/01/2024"
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    // Relative: "3 days ago", "2 months ago"
    /\b(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago\b/gi,
    // "yesterday"
    /\byesterday\b/gi
  ];

  // Context keywords that indicate published vs modified
  const PUBLISHED_CONTEXT = /\b(published|posted|written|created|date)\b/i;
  const MODIFIED_CONTEXT  = /\b(updated|modified|edited|revised|last\s+modified)\b/i;

  function extract(doc) {
    const candidates = [];

    // Scan prioritized containers
    for (const selector of CONTAINER_SELECTORS) {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent || '';
        // Don't process huge blocks of text — only metadata-like areas
        if (text.length > 2000) continue;

        const found = extractFromText(text);
        candidates.push(...found);
      }

      // Stop early if we found something — but keep scanning specific selectors
      if (candidates.length > 0 && !selector.startsWith('#') && !selector.startsWith('footer')) break;
    }

    if (!candidates.length) return null;

    let published = null;
    let modified  = null;

    // Separate into published/modified based on surrounding context
    for (const c of candidates) {
      if (c.isModified && !modified) {
        modified = c.date;
      } else if (!c.isModified && !published) {
        published = c.date;
      }
      if (published && modified) break;
    }

    // Fallback: if only one date found, treat as published
    if (!published && !modified && candidates.length > 0) {
      published = candidates[0].date;
    }

    if (!published && !modified) return null;

    return {
      published,
      modified,
      confidence: 0.50,
      source: 'heuristic'
    };
  }

  /**
   * Extract date candidates from a text string.
   */
  function extractFromText(text) {
    const results = [];

    for (const pattern of DATE_PATTERNS) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(text)) !== null) {
        const dateStr = match[0];
        const parsed = parseDate(dateStr);
        if (!parsed) continue;

        // Check the surrounding context (50 chars before the match)
        const start = Math.max(0, match.index - 50);
        const context = text.substring(start, match.index + dateStr.length + 20);
        const isModified = MODIFIED_CONTEXT.test(context) && !PUBLISHED_CONTEXT.test(context);

        results.push({ date: parsed, isModified, raw: dateStr });
      }
    }

    // Deduplicate by date value (within 1 day)
    const unique = [];
    for (const r of results) {
      const isDupe = unique.some(u =>
        Math.abs(u.date.getTime() - r.date.getTime()) < 86400000
      );
      if (!isDupe) unique.push(r);
    }

    return unique;
  }

  return { extract };

})();
