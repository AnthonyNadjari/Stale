/**
 * Stale — Service Worker
 * Orchestrates caching, quotas, HTTP header capture, licensing, and messaging.
 */

// ── License server URL ──────────────────────────────────
// After deploying the backend, replace this with your server URL.
const API_BASE_URL = 'https://backend-iota-one-85.vercel.app';

const MSG = {
  GET_HTTP_DATE:        'GET_HTTP_DATE',
  CHECK_QUOTA:          'CHECK_QUOTA',
  INCREMENT_QUOTA:      'INCREMENT_QUOTA',
  GET_CACHE:            'GET_CACHE',
  SET_CACHE:            'SET_CACHE',
  GET_LICENSE:          'GET_LICENSE',
  SET_LICENSE:          'SET_LICENSE',
  VERIFY_LICENSE:       'VERIFY_LICENSE',
  GET_PREFERENCES:      'GET_PREFERENCES',
  SET_PREFERENCES:      'SET_PREFERENCES',
  TOGGLE_ENABLED:       'TOGGLE_ENABLED',
  UNREGISTER_PAGE_SCRIPT: 'UNREGISTER_PAGE_SCRIPT'
};

const PAGE_ANALYZER_SCRIPT_ID = 'stale-page-analyzer';
const GOOGLE_SERP_PATTERNS = [
  '*://www.google.com/search*', '*://www.google.co.uk/search*', '*://www.google.fr/search*',
  '*://www.google.de/search*', '*://www.google.es/search*', '*://www.google.it/search*',
  '*://www.google.ca/search*', '*://www.google.com.au/search*', '*://www.google.com.br/search*'
];

const DEFAULTS = {
  cache: {},
  quota: {
    serpAugmentations: 0,
    dailyLimit: 10,
    resetDate: todayString()
  },
  license: {
    isPaid: false,
    purchaseDate: null,
    email: null
  },
  preferences: {
    enabled: true,
    showBadgeOnPages: true,
    showBadgeOnSerp: true,
    thresholds: { green: 6, yellow: 18, orange: 36 },
    badgePosition: 'top-right',
    badgeOpacity: 0.85
  }
};

// Temporary in-memory store for Last-Modified headers (URL → date string)
const httpDateStore = new Map();

// ── Alarms ──────────────────────────────────────────────

chrome.alarms.create('quota-reset', {
  when: nextMidnightUTC(),
  periodInMinutes: 24 * 60
});

chrome.alarms.create('cache-cleanup', {
  delayInMinutes: 10,
  periodInMinutes: 6 * 60
});

chrome.alarms.create('license-revalidation', {
  delayInMinutes: 5,
  periodInMinutes: 24 * 60
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'quota-reset') resetQuota();
  if (alarm.name === 'cache-cleanup') cleanupCache();
  if (alarm.name === 'license-revalidation') revalidateLicense();
});

// ── HTTP Header Capture (only when optional <all_urls> is granted) ───────

function onHeadersReceived(details) {
  if (details.type !== 'main_frame') return;
  const lastMod = details.responseHeaders?.find(
    h => h.name.toLowerCase() === 'last-modified'
  );
  if (lastMod?.value) {
    httpDateStore.set(details.url, lastMod.value);
    setTimeout(() => httpDateStore.delete(details.url), 5 * 60 * 1000);
  }
}

let webRequestListenerActive = false;
let pageAnalyzerSetupPromise = null;

async function setupPageAnalyzerAndWebRequest() {
  const hasAllUrls = await new Promise(r =>
    chrome.permissions.contains({ origins: ['<all_urls>'] }, r)
  );
  if (!hasAllUrls) return;

  const data = await getStorage(['preferences']);
  const prefs = data.preferences || DEFAULTS.preferences;
  if (!prefs.showBadgeOnPages) return;

  if (!webRequestListenerActive) {
    chrome.webRequest.onHeadersReceived.addListener(
      onHeadersReceived,
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    );
    webRequestListenerActive = true;
  }

  if (pageAnalyzerSetupPromise) return pageAnalyzerSetupPromise;
  pageAnalyzerSetupPromise = (async () => {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [PAGE_ANALYZER_SCRIPT_ID] });
    } catch (_) {}

    const scriptConfig = {
      id: PAGE_ANALYZER_SCRIPT_ID,
      matches: ['<all_urls>'],
      excludeMatches: GOOGLE_SERP_PATTERNS,
      js: [
        'src/shared/config.js', 'src/shared/date-utils.js', 'src/shared/freshness.js', 'src/shared/messaging.js',
        'src/extractors/meta-extractor.js', 'src/extractors/jsonld-extractor.js', 'src/extractors/time-element-extractor.js',
        'src/extractors/heuristic-extractor.js', 'src/extractors/index.js', 'src/content/page/page-analyzer.js'
      ],
      css: ['src/content/page/badge-overlay.css'],
      runAt: 'document_idle'
    };

    try {
      await chrome.scripting.registerContentScripts([scriptConfig]);
    } catch (err) {
      if (err?.message?.includes('Duplicate')) {
        try {
          await chrome.scripting.unregisterContentScripts({ ids: [PAGE_ANALYZER_SCRIPT_ID] });
          await chrome.scripting.registerContentScripts([scriptConfig]);
        } catch (_) {}
      }
    } finally {
      pageAnalyzerSetupPromise = null;
    }
  })();
  return pageAnalyzerSetupPromise;
}

async function unregisterPageAnalyzer() {
  if (webRequestListenerActive) {
    try {
      chrome.webRequest.onHeadersReceived.removeListener(onHeadersReceived);
    } catch (_) {}
    webRequestListenerActive = false;
  }
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (scripts.some(s => s.id === PAGE_ANALYZER_SCRIPT_ID)) {
      await chrome.scripting.unregisterContentScripts({ ids: [PAGE_ANALYZER_SCRIPT_ID] });
    }
  } catch (_) {}
}

// ── Message Handler ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg).then(sendResponse);
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {

    case MSG.GET_HTTP_DATE: {
      const dateStr = httpDateStore.get(msg.url) || null;
      return { date: dateStr };
    }

    case MSG.CHECK_QUOTA: {
      const data = await getStorage(['quota', 'license']);
      const quota = data.quota || DEFAULTS.quota;
      const license = data.license || DEFAULTS.license;

      if (quota.resetDate !== todayString()) {
        quota.serpAugmentations = 0;
        quota.resetDate = todayString();
        await setStorage({ quota });
      }

      return {
        used: quota.serpAugmentations,
        limit: quota.dailyLimit,
        remaining: Math.max(0, quota.dailyLimit - quota.serpAugmentations),
        isPaid: license.isPaid,
        allowed: license.isPaid || quota.serpAugmentations < quota.dailyLimit
      };
    }

    case MSG.INCREMENT_QUOTA: {
      const data = await getStorage(['quota']);
      const quota = data.quota || DEFAULTS.quota;
      quota.serpAugmentations += 1;
      await setStorage({ quota });
      return { used: quota.serpAugmentations };
    }

    case MSG.GET_CACHE: {
      const data = await getStorage(['cache']);
      const cache = data.cache || {};
      const entry = cache[msg.url] || null;

      if (entry && (Date.now() - entry.cachedAt) > 24 * 60 * 60 * 1000) {
        delete cache[msg.url];
        await setStorage({ cache });
        return { entry: null };
      }

      return { entry };
    }

    case MSG.SET_CACHE: {
      const data = await getStorage(['cache']);
      const cache = data.cache || {};

      cache[msg.url] = {
        ...msg.entry,
        cachedAt: Date.now()
      };

      await setStorage({ cache });
      return { ok: true };
    }

    case MSG.GET_LICENSE: {
      const data = await getStorage(['license']);
      return data.license || DEFAULTS.license;
    }

    case MSG.SET_LICENSE: {
      const license = {
        isPaid: !!msg.license.isPaid,
        purchaseDate: msg.license.purchaseDate || null,
        email: msg.license.email || null
      };
      await setStorage({ license });
      return { ok: true };
    }

    case MSG.VERIFY_LICENSE: {
      return await verifyLicenseWithServer(msg.email);
    }

    case MSG.GET_PREFERENCES: {
      const data = await getStorage(['preferences']);
      return data.preferences || DEFAULTS.preferences;
    }

    case MSG.SET_PREFERENCES: {
      const data = await getStorage(['preferences']);
      const current = data.preferences || DEFAULTS.preferences;
      const merged = { ...current, ...msg.prefs };
      await setStorage({ preferences: merged });
      if (merged.showBadgeOnPages === false) {
        await unregisterPageAnalyzer();
      } else if (merged.showBadgeOnPages) {
        await setupPageAnalyzerAndWebRequest();
      }
      return { ok: true };
    }

    case MSG.UNREGISTER_PAGE_SCRIPT: {
      await unregisterPageAnalyzer();
      return { ok: true };
    }

    case MSG.TOGGLE_ENABLED: {
      const data = await getStorage(['preferences']);
      const prefs = data.preferences || DEFAULTS.preferences;
      prefs.enabled = msg.enabled;
      await setStorage({ preferences: prefs });
      return { enabled: prefs.enabled };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ── License Verification ────────────────────────────────

async function verifyLicenseWithServer(email) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/verify-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!res.ok) {
      return { error: 'Verification server error' };
    }

    const result = await res.json();

    const license = {
      isPaid: !!result.isPaid,
      purchaseDate: result.purchaseDate || null,
      email: email
    };
    await setStorage({ license });

    return license;
  } catch (err) {
    return { error: 'Network error — check your connection' };
  }
}

// ── Periodic License Revalidation ───────────────────────

async function revalidateLicense() {
  const data = await getStorage(['license']);
  const license = data.license || DEFAULTS.license;

  if (!license.email) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/verify-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: license.email })
    });

    if (!res.ok) return;

    const result = await res.json();

    await setStorage({
      license: {
        isPaid: !!result.isPaid,
        purchaseDate: result.purchaseDate || null,
        email: license.email
      }
    });
  } catch {
    // Network error — keep current license state
  }
}

// ── Quota Reset ─────────────────────────────────────────

async function resetQuota() {
  const data = await getStorage(['quota']);
  const quota = data.quota || DEFAULTS.quota;
  quota.serpAugmentations = 0;
  quota.resetDate = todayString();
  await setStorage({ quota });
}

// ── Cache Cleanup ───────────────────────────────────────

async function cleanupCache() {
  const data = await getStorage(['cache']);
  const cache = data.cache || {};
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  const maxEntries = 5000;
  const now = Date.now();

  const urls = Object.keys(cache);
  for (const url of urls) {
    if ((now - cache[url].cachedAt) > maxAge) {
      delete cache[url];
    }
  }

  const remaining = Object.entries(cache);
  if (remaining.length > maxEntries) {
    remaining.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = remaining.length - maxEntries;
    for (let i = 0; i < toRemove; i++) {
      delete cache[remaining[i][0]];
    }
  }

  await setStorage({ cache });
}

// ── Install / Init ──────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const data = await getStorage(['preferences', 'quota', 'license']);
    if (!data.preferences) await setStorage({ preferences: DEFAULTS.preferences });
    if (!data.quota) await setStorage({ quota: DEFAULTS.quota });
    if (!data.license) await setStorage({ license: DEFAULTS.license });
    if (!data.cache) await setStorage({ cache: {} });
  }
  setupPageAnalyzerAndWebRequest().catch(() => {});
});

chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.origins && permissions.origins.includes('<all_urls>')) {
    setupPageAnalyzerAndWebRequest().catch(() => {});
  }
});

// On service worker startup, register page script if permission + prefs allow
setupPageAnalyzerAndWebRequest().catch(() => {});

// ── Helpers ─────────────────────────────────────────────

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function nextMidnightUTC() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
  ));
  return tomorrow.getTime();
}
