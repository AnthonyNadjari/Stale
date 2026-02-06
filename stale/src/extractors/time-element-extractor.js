/**
 * Stale — <time> element date extractor (confidence: 0.85)
 * Looks for <time datetime="..."> tags in the page.
 */
window.Stale = window.Stale || {};
window.Stale.Extractors = window.Stale.Extractors || {};

window.Stale.Extractors.timeElement = (() => {

  const { parseDate } = window.Stale.DateUtils;

  // Selectors ordered by likelihood of being the article date
  const PRIORITY_SELECTORS = [
    'article time[datetime]',
    'header time[datetime]',
    '.post-meta time[datetime]',
    '.entry-date time[datetime]',
    '.byline time[datetime]',
    '[class*="publish"] time[datetime]',
    '[class*="date"] time[datetime]',
    '[class*="time"] time[datetime]',
    'main time[datetime]',
    'time[datetime]'
  ];

  function extract(doc) {
    const found = [];

    // Collect unique <time> elements in priority order
    const seen = new Set();
    for (const selector of PRIORITY_SELECTORS) {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        if (seen.has(el)) continue;
        seen.add(el);

        const dt = el.getAttribute('datetime');
        const parsed = parseDate(dt);
        if (parsed) {
          found.push({
            date: parsed,
            // Check context for "updated"/"modified" hints
            isModified: isModifiedContext(el)
          });
        }
      }
    }

    if (!found.length) return null;

    let published = null;
    let modified  = null;

    // First non-modified time is published
    for (const entry of found) {
      if (!entry.isModified) {
        published = entry.date;
        break;
      }
    }

    // First modified time, or second time if later than published
    for (const entry of found) {
      if (entry.isModified) {
        modified = entry.date;
        break;
      }
    }

    // If we have 2+ dates and no explicit modified, use a later one as modified
    if (!modified && found.length >= 2 && published) {
      for (const entry of found) {
        if (entry.date > published) {
          modified = entry.date;
          break;
        }
      }
    }

    // If only modified dates found, treat first as published
    if (!published && modified) {
      published = modified;
      modified = null;
    }

    return {
      published,
      modified,
      confidence: 0.85,
      source: 'time-element'
    };
  }

  /**
   * Check if a <time> element sits in an "updated/modified" context.
   */
  function isModifiedContext(el) {
    const parent = el.parentElement;
    if (!parent) return false;

    const text = (parent.textContent || '').toLowerCase();
    const cls  = (parent.className || '').toLowerCase();

    return /\b(updated|modified|edited|revised)\b/.test(text)
        || /\b(updated|modified|edited|revised)\b/.test(cls);
  }

  return { extract };

})();
