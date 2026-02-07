/**
 * Stale — Service Worker
 * Orchestrates caching, quotas, HTTP header capture, licensing, and messaging.
 */

// ── License server URL ──────────────────────────────────
// After deploying the backend, replace this with your server URL.
const API_BASE_URL = 'https://stale-api.example.com';

const MSG = {
  GET_HTTP_DATE:   'GET_HTTP_DATE',
  CHECK_QUOTA:     'CHECK_QUOTA',
  INCREMENT_QUOTA: 'INCREMENT_QUOTA',
  GET_CACHE:       'GET_CACHE',
  SET_CACHE:       'SET_CACHE',
  GET_LICENSE:     'GET_LICENSE',
  SET_LICENSE:     'SET_LICENSE',
  CREATE_CHECKOUT: 'CREATE_CHECKOUT',
  VERIFY_LICENSE:  'VERIFY_LICENSE',
  GET_PREFERENCES: 'GET_PREFERENCES',
  SET_PREFERENCES: 'SET_PREFERENCES',
  TOGGLE_ENABLED:  'TOGGLE_ENABLED'
};

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
  // Fire at next midnight UTC, then every 24h
  when: nextMidnightUTC(),
  periodInMinutes: 24 * 60
});

chrome.alarms.create('cache-cleanup', {
  delayInMinutes: 10,
  periodInMinutes: 6 * 60 // every 6h
});

chrome.alarms.create('license-revalidation', {
  delayInMinutes: 5,
  periodInMinutes: 24 * 60 // every 24h
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'quota-reset') resetQuota();
  if (alarm.name === 'cache-cleanup') cleanupCache();
  if (alarm.name === 'license-revalidation') revalidateLicense();
});

// ── HTTP Header Capture ─────────────────────────────────

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type !== 'main_frame') return;

    const lastMod = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'last-modified'
    );
    if (lastMod?.value) {
      httpDateStore.set(details.url, lastMod.value);
      // Auto-purge after 5 minutes to avoid unbounded growth
      setTimeout(() => httpDateStore.delete(details.url), 5 * 60 * 1000);
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ── Message Handler ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg).then(sendResponse);
  return true; // keep the channel open for async response
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

      // Reset if date changed
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

      // Check TTL (24h)
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

    case MSG.CREATE_CHECKOUT: {
      return await createCheckoutSession(msg.email);
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

// ── Stripe Checkout ─────────────────────────────────────

async function createCheckoutSession(email) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || 'Server error' };
    }

    const data = await res.json();
    return { url: data.url };
  } catch (err) {
    return { error: 'Network error — check your connection' };
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

    // Update local license storage
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

  // Only revalidate if there is an email stored (user attempted purchase or has Pro)
  if (!license.email) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/verify-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: license.email })
    });

    if (!res.ok) return; // Keep current state on server error

    const result = await res.json();

    // Update license — handles both activation and revocation (refunds)
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
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  const maxEntries = 5000;
  const now = Date.now();

  // Remove expired entries
  const urls = Object.keys(cache);
  for (const url of urls) {
    if ((now - cache[url].cachedAt) > maxAge) {
      delete cache[url];
    }
  }

  // If still too many, remove oldest
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
    // Set defaults on first install
    const data = await getStorage(['preferences', 'quota', 'license']);
    if (!data.preferences) await setStorage({ preferences: DEFAULTS.preferences });
    if (!data.quota) await setStorage({ quota: DEFAULTS.quota });
    if (!data.license) await setStorage({ license: DEFAULTS.license });
    if (!data.cache) await setStorage({ cache: {} });
  }
});

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
