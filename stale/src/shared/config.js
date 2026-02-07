/**
 * Stale — Global configuration
 * All constants and defaults live here for easy tuning.
 */
window.Stale = window.Stale || {};

window.Stale.CONFIG = {
  // ── License server URL ────────────────────────────────
  // After deploying the backend, replace this with your server URL.
  // e.g. 'https://stale-api.yourhost.com'
  API_BASE_URL: 'https://stale-api.example.com',

  // Freshness thresholds in months
  THRESHOLDS: {
    green: 6,
    yellow: 18,
    orange: 36
  },

  // Free tier daily SERP augmentation limit
  FREE_DAILY_LIMIT: 10,

  // Cache TTL: 24 hours
  CACHE_TTL: 24 * 60 * 60 * 1000,

  // Max cached URLs before pruning
  CACHE_MAX_ENTRIES: 5000,

  // Max cache entry age before deletion (7 days)
  CACHE_MAX_AGE: 7 * 24 * 60 * 60 * 1000,

  // Badge colors
  COLORS: {
    green:  '#22c55e',
    yellow: '#eab308',
    orange: '#f97316',
    red:    '#ef4444',
    grey:   '#6b7280'
  },

  // Labels matching each color tier
  LABELS: {
    green:  'Fresh',
    yellow: 'Aging',
    orange: 'Old',
    red:    'Stale',
    grey:   'Unknown'
  },

  // Message types for SW communication
  MSG: {
    GET_HTTP_DATE:    'GET_HTTP_DATE',
    CHECK_QUOTA:      'CHECK_QUOTA',
    INCREMENT_QUOTA:  'INCREMENT_QUOTA',
    GET_CACHE:        'GET_CACHE',
    SET_CACHE:        'SET_CACHE',
    GET_LICENSE:      'GET_LICENSE',
    SET_LICENSE:      'SET_LICENSE',
    CREATE_CHECKOUT:  'CREATE_CHECKOUT',
    VERIFY_LICENSE:   'VERIFY_LICENSE',
    GET_PREFERENCES:  'GET_PREFERENCES',
    SET_PREFERENCES:  'SET_PREFERENCES',
    TOGGLE_ENABLED:   'TOGGLE_ENABLED'
  }
};
