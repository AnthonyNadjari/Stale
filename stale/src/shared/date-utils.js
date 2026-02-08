/**
 * Stale — Date parsing and formatting utilities
 */
window.Stale = window.Stale || {};

window.Stale.DateUtils = (() => {

  const MONTHS = {
    // English
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5,
    jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
    // French
    janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
    janv: 0, févr: 1, avr: 3, juil: 6, déc: 11
  };

  /**
   * Try to parse virtually any date string into a Date object.
   * Returns null if unparseable or obviously invalid.
   */
  function parseDate(input) {
    if (!input) return null;

    // Already a Date
    if (input instanceof Date) {
      return isValid(input) ? input : null;
    }

    // Unix timestamp (seconds or ms)
    if (typeof input === 'number') {
      const d = input > 1e12 ? new Date(input) : new Date(input * 1000);
      return isValid(d) ? d : null;
    }

    if (typeof input !== 'string') return null;

    let str = input.trim();

    // Strip trailing dots from month abbreviations (e.g. "oct." → "oct")
    str = str.replace(/(\b\w{3,5})\.\s/g, '$1 ');

    // Relative dates: "2 days ago", "3 months ago", "last week", etc.
    const relative = parseRelative(str);
    if (relative) return relative;

    // ISO 8601 — let the engine handle it first
    let d = new Date(str);
    if (isValid(d) && /\d{4}/.test(str)) return d;

    // "March 15, 2024" or "Mar 15, 2024"
    let m = str.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (m) { d = fromParts(m[3], m[1], m[2]); if (d) return d; }

    // "15 March 2024" or "15 Mar 2024"
    m = str.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/i);
    if (m) { d = fromParts(m[3], m[2], m[1]); if (d) return d; }

    // "2024-01-15" (already handled by ISO, but be safe)
    m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) { d = new Date(+m[1], +m[2] - 1, +m[3]); if (isValid(d)) return d; }

    // "01/15/2024" (US) or "15/01/2024" (EU) — ambiguous, prefer US if month <= 12
    m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      const a = +m[1], b = +m[2], y = +m[3];
      if (a <= 12) {
        d = new Date(y, a - 1, b);
        if (isValid(d)) return d;
      }
      if (b <= 12) {
        d = new Date(y, b - 1, a);
        if (isValid(d)) return d;
      }
    }

    // "March 2024" (month + year only)
    m = str.match(/^(\w+)\s+(\d{4})$/i);
    if (m) { d = fromParts(m[2], m[1], '1'); if (d) return d; }

    return null;
  }

  function parseRelative(str) {
    const lower = str.toLowerCase().trim();
    const now = new Date();

    // "X (minutes|hours|days|weeks|months|years) ago"
    const m = lower.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = m[2];
      const d = new Date(now);
      switch (unit) {
        case 'minute': d.setMinutes(d.getMinutes() - n); break;
        case 'hour':   d.setHours(d.getHours() - n); break;
        case 'day':    d.setDate(d.getDate() - n); break;
        case 'week':   d.setDate(d.getDate() - n * 7); break;
        case 'month':  d.setMonth(d.getMonth() - n); break;
        case 'year':   d.setFullYear(d.getFullYear() - n); break;
      }
      return d;
    }

    if (lower === 'yesterday') {
      const d = new Date(now); d.setDate(d.getDate() - 1); return d;
    }
    if (lower === 'last week') {
      const d = new Date(now); d.setDate(d.getDate() - 7); return d;
    }
    if (lower === 'last month') {
      const d = new Date(now); d.setMonth(d.getMonth() - 1); return d;
    }
    if (lower === 'last year') {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d;
    }

    return null;
  }

  function fromParts(yearStr, monthStr, dayStr) {
    const monthNum = MONTHS[monthStr.toLowerCase()];
    if (monthNum === undefined) return null;
    const d = new Date(+yearStr, monthNum, +dayStr);
    return isValid(d) ? d : null;
  }

  function isValid(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return false;
    const year = d.getFullYear();
    // Reject dates before 1995 or more than 1 day in the future
    if (year < 1995) return false;
    if (d.getTime() > Date.now() + 86400000) return false;
    return true;
  }

  /**
   * Format a Date into a human-readable string: "March 15, 2024"
   */
  function formatDate(date) {
    if (!date) return 'Unknown';
    try {
      return date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Get age in months from a date to now.
   */
  function getAgeInMonths(date) {
    if (!date) return Infinity;
    const now = new Date();
    return (now.getFullYear() - date.getFullYear()) * 12
         + (now.getMonth() - date.getMonth())
         + (now.getDate() < date.getDate() ? -1 : 0);
  }

  /**
   * Human-readable age: "3 months", "2 years", "5 days", etc.
   */
  function getAgeText(date) {
    if (!date) return 'Unknown age';
    const diffMs = Date.now() - date.getTime();
    const days = Math.floor(diffMs / 86400000);

    if (days < 0) return 'Just now';
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;

    const months = getAgeInMonths(date);
    if (months < 1) return `${days} days`;
    if (months === 1) return '1 month';
    if (months < 12) return `${months} months`;

    const years = Math.floor(months / 12);
    const remainMonths = months % 12;
    if (years === 1 && remainMonths === 0) return '1 year';
    if (years === 1) return `1 year ${remainMonths}mo`;
    if (remainMonths === 0) return `${years} years`;
    return `${years}yr ${remainMonths}mo`;
  }

  /**
   * Short age text for SERP badges: "3mo", "2yr", "5d"
   */
  function getShortAgeText(date) {
    if (!date) return '?';
    const diffMs = Date.now() - date.getTime();
    const days = Math.floor(diffMs / 86400000);

    if (days < 0) return 'now';
    if (days === 0) return '<1d';
    if (days < 30) return `${days}d`;

    const months = getAgeInMonths(date);
    if (months < 12) return `${months}mo`;

    const years = Math.floor(months / 12);
    return `${years}yr`;
  }

  return { parseDate, formatDate, getAgeInMonths, getAgeText, getShortAgeText, isValid };

})();
