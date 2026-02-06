/**
 * Stale — Freshness calculation
 * Determines color, label, and age text from a date.
 */
window.Stale = window.Stale || {};

window.Stale.Freshness = (() => {

  const { CONFIG }    = window.Stale;
  const { DateUtils } = window.Stale;

  /**
   * Compute freshness info from published/modified dates.
   * @param {Date|null} published
   * @param {Date|null} modified
   * @param {Object}    [thresholds] — override CONFIG.THRESHOLDS
   * @returns {{ color, label, ageText, shortAge, publishedFormatted, modifiedFormatted }}
   */
  function getFreshnessInfo(published, modified, thresholds) {
    const t = thresholds || CONFIG.THRESHOLDS;

    // Use the most recent meaningful date for color calculation
    const referenceDate = modified || published;

    if (!referenceDate) {
      return {
        color: CONFIG.COLORS.grey,
        colorName: 'grey',
        label: CONFIG.LABELS.grey,
        ageText: 'Unknown age',
        shortAge: '?',
        publishedFormatted: DateUtils.formatDate(published),
        modifiedFormatted: DateUtils.formatDate(modified)
      };
    }

    const ageMonths = DateUtils.getAgeInMonths(referenceDate);
    let colorName;

    if (ageMonths <= t.green)       colorName = 'green';
    else if (ageMonths <= t.yellow) colorName = 'yellow';
    else if (ageMonths <= t.orange) colorName = 'orange';
    else                            colorName = 'red';

    return {
      color: CONFIG.COLORS[colorName],
      colorName,
      label: CONFIG.LABELS[colorName],
      ageText: DateUtils.getAgeText(referenceDate),
      shortAge: DateUtils.getShortAgeText(referenceDate),
      publishedFormatted: DateUtils.formatDate(published),
      modifiedFormatted: DateUtils.formatDate(modified)
    };
  }

  return { getFreshnessInfo };

})();
