/**
 * Stale — JSON-LD / Schema.org date extractor (confidence: 0.95)
 * Parses <script type="application/ld+json"> blocks.
 */
window.Stale = window.Stale || {};
window.Stale.Extractors = window.Stale.Extractors || {};

window.Stale.Extractors.jsonld = (() => {

  const { parseDate } = window.Stale.DateUtils;

  const PUBLISHED_KEYS = ['datePublished', 'dateCreated', 'uploadDate'];
  const MODIFIED_KEYS  = ['dateModified', 'lastReviewed'];

  /**
   * Recursively search an object (or array) for date keys.
   */
  function findDates(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 8) return { published: null, modified: null };

    let published = null;
    let modified = null;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const result = findDates(item, depth + 1);
        published = published || result.published;
        modified  = modified  || result.modified;
        if (published && modified) break;
      }
      return { published, modified };
    }

    // Check this level
    for (const key of PUBLISHED_KEYS) {
      if (obj[key]) {
        const d = parseDate(obj[key]);
        if (d) { published = d; break; }
      }
    }
    for (const key of MODIFIED_KEYS) {
      if (obj[key]) {
        const d = parseDate(obj[key]);
        if (d) { modified = d; break; }
      }
    }

    if (published && modified) return { published, modified };

    // Recurse into nested objects (e.g. @graph)
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        const result = findDates(val, depth + 1);
        published = published || result.published;
        modified  = modified  || result.modified;
        if (published && modified) break;
      }
    }

    return { published, modified };
  }

  function extract(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    if (!scripts.length) return null;

    let bestPublished = null;
    let bestModified  = null;

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const { published, modified } = findDates(data);
        bestPublished = bestPublished || published;
        bestModified  = bestModified  || modified;
        if (bestPublished && bestModified) break;
      } catch {
        // Malformed JSON — skip
      }
    }

    if (!bestPublished && !bestModified) return null;

    return {
      published: bestPublished,
      modified: bestModified,
      confidence: 0.95,
      source: 'json-ld'
    };
  }

  return { extract };

})();
