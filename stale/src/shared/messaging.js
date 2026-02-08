/**
 * Stale — Messaging wrapper for chrome.runtime communication
 * Includes retry logic for service worker cold-start delays.
 */
window.Stale = window.Stale || {};

window.Stale.Messaging = (() => {

  const { MSG } = window.Stale.CONFIG;

  /**
   * Send a message to the service worker with automatic retry.
   * Retries up to 2 times with progressive delays (300ms, 600ms)
   * to handle SW cold starts reliably.
   */
  function send(type, data = {}) {
    return new Promise((resolve) => {
      function attempt(retries, delay) {
        try {
          chrome.runtime.sendMessage({ type, ...data }, (response) => {
            if (chrome.runtime.lastError) {
              if (retries > 0) {
                setTimeout(() => attempt(retries - 1, delay + 300), delay);
              } else {
                resolve(null);
              }
            } else {
              resolve(response);
            }
          });
        } catch {
          if (retries > 0) {
            setTimeout(() => attempt(retries - 1, delay + 300), delay);
          } else {
            resolve(null);
          }
        }
      }
      attempt(2, 300); // 2 retries = 3 total attempts (300ms, 600ms delays)
    });
  }

  function getHttpDate(url) {
    return send(MSG.GET_HTTP_DATE, { url });
  }

  function checkQuota() {
    return send(MSG.CHECK_QUOTA);
  }

  function incrementQuota() {
    return send(MSG.INCREMENT_QUOTA);
  }

  function getCache(url) {
    return send(MSG.GET_CACHE, { url });
  }

  function setCache(url, entry) {
    return send(MSG.SET_CACHE, { url, entry });
  }

  function getLicense() {
    return send(MSG.GET_LICENSE);
  }

  function setLicense(license) {
    return send(MSG.SET_LICENSE, { license });
  }

  function verifyLicense(email) {
    return send(MSG.VERIFY_LICENSE, { email });
  }

  function getPreferences() {
    return send(MSG.GET_PREFERENCES);
  }

  function setPreferences(prefs) {
    return send(MSG.SET_PREFERENCES, { prefs });
  }

  function toggleEnabled(enabled) {
    return send(MSG.TOGGLE_ENABLED, { enabled });
  }

  return {
    send, getHttpDate, checkQuota, incrementQuota,
    getCache, setCache, getLicense, setLicense,
    verifyLicense,
    getPreferences, setPreferences, toggleEnabled
  };

})();
