/**
 * Stale — Extraction pipeline orchestrator
 * Runs all extractors and picks the best result.
 */
window.Stale = window.Stale || {};
window.Stale.Extractors = window.Stale.Extractors || {};

window.Stale.Extractors.pipeline = (() => {

  const { meta, jsonld, timeElement, heuristic } = window.Stale.Extractors;

  /**
   * Run all extractors on the document and return the best result.
   * Optionally incorporate a Last-Modified header date.
   * @param {Document} doc
   * @param {Date|null} lastModifiedHeader — from HTTP headers via SW
   * @returns {{ published, modified, confidence, source } | null}
   */
  function run(doc, lastModifiedHeader = null) {
    const results = [];

    // Run each extractor in a try-catch so one failure doesn't break the chain
    const extractors = [
      { name: 'meta',         fn: meta.extract },
      { name: 'json-ld',      fn: jsonld.extract },
      { name: 'time-element', fn: timeElement.extract },
      { name: 'heuristic',    fn: heuristic.extract }
    ];

    for (const { name, fn } of extractors) {
      try {
        const result = fn(doc);
        if (result) results.push(result);
      } catch (err) {
        // Silent fail — never crash the page
        console.debug(`[Stale] Extractor "${name}" failed:`, err.message);
      }
    }

    // Add Last-Modified header as a low-confidence source
    if (lastModifiedHeader) {
      results.push({
        published: null,
        modified: lastModifiedHeader,
        confidence: 0.40,
        source: 'http-header'
      });
    }

    if (!results.length) return null;

    // Sort by confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence);

    const best = results[0];

    // Boost confidence if multiple extractors agree (within 48h)
    if (results.length >= 2 && best.published) {
      const agreeing = results.filter(r =>
        r !== best && r.published &&
        Math.abs(r.published.getTime() - best.published.getTime()) < 48 * 3600000
      );
      if (agreeing.length > 0) {
        best.confidence = Math.min(1.0, best.confidence + 0.05 * agreeing.length);
      }
    }

    // Merge: if best has no modified but another extractor does, borrow it
    if (!best.modified) {
      for (const r of results) {
        if (r.modified && r !== best) {
          best.modified = r.modified;
          break;
        }
      }
    }

    return best;
  }

  return { run };

})();
