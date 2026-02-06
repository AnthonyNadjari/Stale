/**
 * Stale — Global configuration
 * All constants and defaults live here for easy tuning.
 */
window.Stale = window.Stale || {};

window.Stale.CONFIG = {
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

  // Payment: Stripe Checkout for Stale Pro
  CHECKOUT_URL: 'https://buy.stripe.com/14A4gydLk4PGgAcgEdaEE00',
  // Optional: backend URL to validate license keys (POST { key } → { valid: true } or 4xx)
  LICENSE_VERIFY_URL: '',

  // Message types for SW communication
  MSG: {
    GET_HTTP_DATE:    'GET_HTTP_DATE',
    CHECK_QUOTA:      'CHECK_QUOTA',
    INCREMENT_QUOTA:  'INCREMENT_QUOTA',
    GET_CACHE:        'GET_CACHE',
    SET_CACHE:        'SET_CACHE',
    GET_LICENSE:      'GET_LICENSE',
    SET_LICENSE:      'SET_LICENSE',
    GET_PREFERENCES:  'GET_PREFERENCES',
    SET_PREFERENCES:  'SET_PREFERENCES',
    TOGGLE_ENABLED:   'TOGGLE_ENABLED'
  }
};
