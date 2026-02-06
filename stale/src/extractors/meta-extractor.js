/**
 * Stale — Meta tag date extractor (confidence: 0.95)
 * Reads <meta> tags commonly used for article dates.
 */
window.Stale = window.Stale || {};
window.Stale.Extractors = window.Stale.Extractors || {};

window.Stale.Extractors.meta = (() => {

  const { parseDate } = window.Stale.DateUtils;

  // Meta names/properties for published date (priority order)
  const PUBLISHED_ATTRS = [
    'article:published_time',
    'datePublished',
    'pubdate',
    'publishdate',
    'date',
    'DC.date.created',
    'DC.date',
    'sailthru.date',
    'og:article:published_time'
  ];

  // Meta names/properties for modified date
  const MODIFIED_ATTRS = [
    'article:modified_time',
    'dateModified',
    'og:updated_time',
    'DC.date.modified',
    'last-modified',
    'revised'
  ];

  function getMetaContent(doc, attr) {
    // Try both name and property attributes
    const el = doc.querySelector(
      `meta[name="${attr}" i], meta[property="${attr}" i], meta[itemprop="${attr}" i]`
    );
    return el ? el.getAttribute('content') : null;
  }

  function extract(doc) {
    let published = null;
    let modified = null;

    for (const attr of PUBLISHED_ATTRS) {
      const val = getMetaContent(doc, attr);
      if (val) {
        published = parseDate(val);
        if (published) break;
      }
    }

    for (const attr of MODIFIED_ATTRS) {
      const val = getMetaContent(doc, attr);
      if (val) {
        modified = parseDate(val);
        if (modified) break;
      }
    }

    if (!published && !modified) return null;

    return {
      published,
      modified,
      confidence: 0.95,
      source: 'meta'
    };
  }

  return { extract };

})();
