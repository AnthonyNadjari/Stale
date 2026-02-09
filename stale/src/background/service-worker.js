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
  UNREGISTER_PAGE_SCRIPT: 'UNREGISTER_PAGE_SCRIPT',
  FETCH_DATE_FROM_URL:    'FETCH_DATE_FROM_URL'
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
    dailyLimit: 50,
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
// Use an async init to avoid top-level throws on SW cold start

async function ensureAlarms() {
  if (!chrome.alarms) return;
  try {
    const existing = await chrome.alarms.getAll();
    const names = existing.map(a => a.name);

    if (!names.includes('quota-reset')) {
      await chrome.alarms.create('quota-reset', {
        when: nextMidnightUTC(),
        periodInMinutes: 24 * 60
      });
    }
    if (!names.includes('cache-cleanup')) {
      await chrome.alarms.create('cache-cleanup', {
        delayInMinutes: 10,
        periodInMinutes: 6 * 60
      });
    }
    if (!names.includes('license-revalidation')) {
      await chrome.alarms.create('license-revalidation', {
        delayInMinutes: 5,
        periodInMinutes: 24 * 60
      });
    }
  } catch (_) {
    // Alarms API not ready yet — will be set up on next SW wake
  }
}

ensureAlarms();

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'quota-reset') resetQuota();
    if (alarm.name === 'cache-cleanup') cleanupCache();
    if (alarm.name === 'license-revalidation') revalidateLicense();
  });
}

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

// Promise-based deduplication: if setup is already running, reuse its promise
let pageAnalyzerSetupPromise = null;

async function setupPageAnalyzerAndWebRequest() {
  // If a setup is already in progress, return the existing promise
  if (pageAnalyzerSetupPromise) return pageAnalyzerSetupPromise;

  pageAnalyzerSetupPromise = (async () => {
    try {
      const hasAllUrls = await new Promise(r =>
        chrome.permissions.contains({ origins: ['<all_urls>'] }, r)
      );
      if (!hasAllUrls) return;

      const data = await getStorage(['preferences']);
      const prefs = data.preferences || DEFAULTS.preferences;
      if (!prefs.showBadgeOnPages) return;

      if (!webRequestListenerActive) {
        try {
          chrome.webRequest.onHeadersReceived.addListener(
            onHeadersReceived,
            { urls: ['<all_urls>'] },
            ['responseHeaders']
          );
          webRequestListenerActive = true;
        } catch (_) {
          // webRequest listener already registered or unavailable
        }
      }

      // Unregister first to guarantee no duplicate ID error
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
        // If it still fails with Duplicate, try again after unregister
        if (err?.message?.includes('Duplicate')) {
          try {
            await chrome.scripting.unregisterContentScripts({ ids: [PAGE_ANALYZER_SCRIPT_ID] });
            await chrome.scripting.registerContentScripts([scriptConfig]);
          } catch (_) {}
        }
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
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => {
      console.error('Stale SW handleMessage error:', err);
      sendResponse({ error: err.message || 'Internal error' });
    });
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

      if (quota.resetDate !== todayString()) {
        quota.serpAugmentations = 0;
        quota.resetDate = todayString();
        await setStorage({ quota });
      }

      // Refresh the icon badge
      updateBadgeCount(quota, license);

      return {
        used: quota.serpAugmentations,
        limit: quota.dailyLimit,
        remaining: Math.max(0, quota.dailyLimit - quota.serpAugmentations),
        isPaid: license.isPaid,
        allowed: license.isPaid || quota.serpAugmentations < quota.dailyLimit
      };
    }

    case MSG.INCREMENT_QUOTA: {
      const data = await getStorage(['quota', 'license']);
      const quota = data.quota || DEFAULTS.quota;
      const license = data.license || DEFAULTS.license;
      // Reset counter if new day
      if (quota.resetDate !== todayString()) {
        quota.serpAugmentations = 0;
        quota.resetDate = todayString();
      }
      quota.serpAugmentations += 1;
      await setStorage({ quota });
      // Update extension icon badge with count
      updateBadgeCount(quota, license);
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
      const licenseInput = msg.license || {};
      const license = {
        isPaid: !!licenseInput.isPaid,
        purchaseDate: licenseInput.purchaseDate || null,
        email: licenseInput.email || null
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

    case MSG.FETCH_DATE_FROM_URL: {
      return await fetchDateFromUrl(msg.url);
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
  const data = await getStorage(['preferences', 'quota', 'license']);
  if (!data.preferences) await setStorage({ preferences: DEFAULTS.preferences });
  if (!data.license) await setStorage({ license: DEFAULTS.license });
  if (!data.cache) await setStorage({ cache: {} });

  // Always reset/update quota on install or update to pick up new dailyLimit
  const quota = data.quota || DEFAULTS.quota;
  quota.dailyLimit = DEFAULTS.quota.dailyLimit;
  // Reset counter on fresh install, update, or new day
  if (details.reason === 'install' || details.reason === 'update' || quota.resetDate !== todayString()) {
    quota.serpAugmentations = 0;
    quota.resetDate = todayString();
  }
  await setStorage({ quota });

  // Refresh icon badge count
  const licenseInit = data.license || DEFAULTS.license;
  updateBadgeCount(quota, licenseInit);

  setupPageAnalyzerAndWebRequest().catch(() => {});
});

chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.origins && permissions.origins.includes('<all_urls>')) {
    setupPageAnalyzerAndWebRequest().catch(() => {});
  }
});

// On service worker startup, register page script if permission + prefs allow
setupPageAnalyzerAndWebRequest().catch(() => {});

// ── Fetch Date from URL (deep detection) ─────────────────

// In-flight fetches to avoid duplicate requests for the same URL
const fetchInFlight = new Map();

async function fetchDateFromUrl(url) {
  if (!url) return { entry: null };

  // Check cache first
  const data = await getStorage(['cache']);
  const cache = data.cache || {};
  const cached = cache[url];
  if (cached && (Date.now() - cached.cachedAt) < 24 * 60 * 60 * 1000) {
    return { entry: cached };
  }

  // Deduplicate in-flight requests
  if (fetchInFlight.has(url)) {
    return fetchInFlight.get(url);
  }

  const promise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; Stale/1.0)'
        },
        redirect: 'follow'
      });
      clearTimeout(timeout);

      if (!res.ok) return { entry: null };

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return { entry: null };

      // Read only first 50KB to avoid large downloads
      const reader = res.body.getReader();
      const chunks = [];
      let totalSize = 0;
      const maxSize = 50 * 1024;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalSize += value.length;
        if (totalSize >= maxSize) break;
      }
      reader.cancel().catch(() => {});

      const html = new TextDecoder().decode(
        chunks.reduce((acc, chunk) => {
          const merged = new Uint8Array(acc.length + chunk.length);
          merged.set(acc);
          merged.set(chunk, acc.length);
          return merged;
        }, new Uint8Array())
      );

      const dateInfo = extractDateFromHtml(html);

      if (dateInfo) {
        // Cache the result
        const entry = {
          published: dateInfo.published,
          modified: dateInfo.modified,
          confidence: dateInfo.confidence,
          source: dateInfo.source,
          cachedAt: Date.now()
        };
        const freshCache = (await getStorage(['cache'])).cache || {};
        freshCache[url] = entry;
        await setStorage({ cache: freshCache });
        return { entry };
      }

      return { entry: null };
    } catch (_) {
      return { entry: null };
    } finally {
      fetchInFlight.delete(url);
    }
  })();

  fetchInFlight.set(url, promise);
  return promise;
}

/**
 * Extract dates from raw HTML string using meta tags, JSON-LD, and time elements.
 */
function extractDateFromHtml(html) {
  // 1) Open Graph / meta tags
  const metaPatterns = [
    /< *meta[^>]+(?:property|name)\s*=\s*["'](?:article:published_time|datePublished|date|DC\.date\.issued|sailthru\.date|publish[_-]?date|og:updated_time|article:modified_time)["'][^>]+content\s*=\s*["']([^"']+)["']/gi,
    /< *meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["'](?:article:published_time|datePublished|date|DC\.date\.issued|sailthru\.date|publish[_-]?date|og:updated_time|article:modified_time)["']/gi
  ];

  let published = null;
  let modified = null;

  for (const re of metaPatterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const val = m[1].trim();
      const d = tryParseISO(val);
      if (d) {
        const prop = m[0].toLowerCase();
        if (prop.includes('modified') || prop.includes('updated')) {
          if (!modified) modified = d.toISOString();
        } else {
          if (!published) published = d.toISOString();
        }
      }
    }
  }

  // 2) JSON-LD datePublished / dateModified
  const jsonLdRe = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jm;
  while ((jm = jsonLdRe.exec(html)) !== null) {
    try {
      const obj = JSON.parse(jm[1]);
      const items = Array.isArray(obj) ? obj : [obj];
      for (const item of items) {
        if (item.datePublished && !published) {
          const d = tryParseISO(item.datePublished);
          if (d) published = d.toISOString();
        }
        if (item.dateModified && !modified) {
          const d = tryParseISO(item.dateModified);
          if (d) modified = d.toISOString();
        }
        // Check @graph
        if (item['@graph'] && Array.isArray(item['@graph'])) {
          for (const node of item['@graph']) {
            if (node.datePublished && !published) {
              const d = tryParseISO(node.datePublished);
              if (d) published = d.toISOString();
            }
            if (node.dateModified && !modified) {
              const d = tryParseISO(node.dateModified);
              if (d) modified = d.toISOString();
            }
          }
        }
      }
    } catch (_) {
      // Invalid JSON-LD
    }
  }

  // 3) <time datetime="..."> elements
  if (!published) {
    const timeRe = /<time[^>]+datetime\s*=\s*["']([^"']+)["']/gi;
    let tm;
    while ((tm = timeRe.exec(html)) !== null) {
      const d = tryParseISO(tm[1]);
      if (d) {
        published = d.toISOString();
        break;
      }
    }
  }

  if (published || modified) {
    return {
      published,
      modified,
      confidence: published ? 0.85 : 0.75,
      source: 'url-fetch'
    };
  }

  return null;
}

function tryParseISO(str) {
  if (!str || typeof str !== 'string') return null;
  const d = new Date(str.trim());
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 1995 || d.getTime() > Date.now() + 86400000) return null;
  return d;
}

// ── Badge Count on Extension Icon ────────────────────────

function updateBadgeCount(quota, license) {
  try {
    const used = quota.serpAugmentations || 0;
    const limit = quota.dailyLimit || 50;
    const isPaid = license?.isPaid || false;

    if (isPaid) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const text = used > 0 ? String(used) : '';
    chrome.action.setBadgeText({ text });

    // Color: green if under 70%, orange 70-99%, red at limit
    const pct = (used / limit) * 100;
    let color;
    if (pct >= 100) color = '#ef4444';
    else if (pct >= 70) color = '#f97316';
    else color = '#22c55e';
    chrome.action.setBadgeBackgroundColor({ color });
  } catch (_) {
    // action API may not be available
  }
}

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
