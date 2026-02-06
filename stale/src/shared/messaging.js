/**
 * Stale — Messaging wrapper for chrome.runtime communication
 */
window.Stale = window.Stale || {};

window.Stale.Messaging = (() => {

  const { MSG } = window.Stale.CONFIG;

  function send(type, data = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...data }, (response) => {
          if (chrome.runtime.lastError) {
            // SW may be inactive — return a safe default
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch {
        resolve(null);
      }
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

  function setLicense(payload) {
    return send(MSG.SET_LICENSE, payload);
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
    getPreferences, setPreferences, toggleEnabled
  };

})();
