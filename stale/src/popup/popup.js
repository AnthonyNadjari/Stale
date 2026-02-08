/**
 * Stale — Popup controller
 * Loads preferences from storage, handles Stripe checkout, and saves changes in real-time.
 */
(async () => {

  // ── Elements ────────────────────────────────────────

  const enabledCheckbox   = document.getElementById('enabledCheckbox');
  const statusText        = document.getElementById('statusText');
  const quotaFill         = document.getElementById('quotaFill');
  const quotaText         = document.getElementById('quotaText');
  const greenSlider       = document.getElementById('greenSlider');
  const yellowSlider      = document.getElementById('yellowSlider');
  const orangeSlider      = document.getElementById('orangeSlider');
  const greenValue        = document.getElementById('greenValue');
  const yellowValue       = document.getElementById('yellowValue');
  const orangeValue       = document.getElementById('orangeValue');
  const showPagesCheckbox = document.getElementById('showPagesCheckbox');
  const showSerpCheckbox  = document.getElementById('showSerpCheckbox');
  const positionSelect    = document.getElementById('positionSelect');
  const upgradeSection    = document.getElementById('upgradeSection');
  const upgradeBtn        = document.getElementById('upgradeBtn');
  const restoreLink       = document.getElementById('restoreLink');
  const checkoutSection   = document.getElementById('checkoutSection');
  const checkoutTitle     = document.getElementById('checkoutTitle');
  const checkoutSubtitle  = document.getElementById('checkoutSubtitle');
  const checkoutEmail     = document.getElementById('checkoutEmail');
  const checkoutError     = document.getElementById('checkoutError');
  const checkoutBtn       = document.getElementById('checkoutBtn');
  const checkoutBack      = document.getElementById('checkoutBack');
  const verifyingSection  = document.getElementById('verifyingSection');
  const proSection        = document.getElementById('proSection');

  // Track whether we're in "restore" or "upgrade" mode
  let isRestoreMode = false;

  // ── Load state ──────────────────────────────────────

  const [prefsData, quotaData, licenseData] = await Promise.all([
    sendMessage('GET_PREFERENCES'),
    sendMessage('CHECK_QUOTA'),
    sendMessage('GET_LICENSE')
  ]);

  const prefs   = prefsData   || {};
  const quota   = quotaData   || {};
  const license = licenseData || {};

  // Enabled
  enabledCheckbox.checked = prefs.enabled !== false;
  updateStatus();

  // Quota
  updateQuota(quota, license);

  // Thresholds
  const t = prefs.thresholds || { green: 6, yellow: 18, orange: 36 };
  greenSlider.value  = t.green;
  yellowSlider.value = t.yellow;
  orangeSlider.value = t.orange;
  greenValue.textContent  = t.green;
  yellowValue.textContent = t.yellow;
  orangeValue.textContent = t.orange;

  // Display toggles
  showPagesCheckbox.checked = prefs.showBadgeOnPages !== false;
  showSerpCheckbox.checked  = prefs.showBadgeOnSerp !== false;
  positionSelect.value      = prefs.badgePosition || 'top-right';

  // If "Badge on pages" is on but optional permission not yet granted, request it once
  if (showPagesCheckbox.checked) {
    const hasAllUrls = await new Promise(r =>
      chrome.permissions.contains({ origins: ['<all_urls>'] }, r)
    );
    if (!hasAllUrls) {
      const granted = await new Promise(r =>
        chrome.permissions.request({ origins: ['<all_urls>'] }, r)
      );
      if (!granted) showPagesCheckbox.checked = false;
      else savePrefs({ showBadgeOnPages: true });
    }
  }

  // License — if already paid, show Pro badge
  if (license.isPaid) {
    showProState();
  } else if (license.email) {
    // User started checkout before but may not have completed it.
    autoVerify(license.email);
  }

  // ── Event listeners: Preferences ────────────────────

  enabledCheckbox.addEventListener('change', () => {
    updateStatus();
    savePrefs({ enabled: enabledCheckbox.checked });
  });

  greenSlider.addEventListener('input', () => {
    greenValue.textContent = greenSlider.value;
    saveThresholds();
  });
  yellowSlider.addEventListener('input', () => {
    yellowValue.textContent = yellowSlider.value;
    saveThresholds();
  });
  orangeSlider.addEventListener('input', () => {
    orangeValue.textContent = orangeSlider.value;
    saveThresholds();
  });

  showPagesCheckbox.addEventListener('change', async () => {
    const enabled = showPagesCheckbox.checked;
    if (enabled) {
      const hasAllUrls = await new Promise(r =>
        chrome.permissions.contains({ origins: ['<all_urls>'] }, r)
      );
      if (!hasAllUrls) {
        const granted = await new Promise(r =>
          chrome.permissions.request({ origins: ['<all_urls>'] }, r)
        );
        if (!granted) {
          showPagesCheckbox.checked = false;
          return;
        }
      }
    }
    savePrefs({ showBadgeOnPages: showPagesCheckbox.checked });
  });
  showSerpCheckbox.addEventListener('change', () => {
    savePrefs({ showBadgeOnSerp: showSerpCheckbox.checked });
  });
  positionSelect.addEventListener('change', () => {
    savePrefs({ badgePosition: positionSelect.value });
  });

  // ── Event listeners: Upgrade flow ───────────────────

  // Step 1 → Step 2 (upgrade)
  upgradeBtn.addEventListener('click', () => {
    isRestoreMode = false;
    checkoutTitle.textContent = 'Enter your email';
    checkoutSubtitle.textContent = "We'll send your receipt here";
    checkoutBtn.textContent = 'Continue to payment';
    checkoutError.textContent = '';
    checkoutEmail.value = '';
    upgradeSection.style.display = 'none';
    checkoutSection.style.display = 'block';
    checkoutEmail.focus();
  });

  // Step 1 → Step 2 (restore)
  restoreLink.addEventListener('click', (e) => {
    e.preventDefault();
    isRestoreMode = true;
    checkoutTitle.textContent = 'Restore your purchase';
    checkoutSubtitle.textContent = 'Enter the email you used to pay';
    checkoutBtn.textContent = 'Verify purchase';
    checkoutError.textContent = '';
    checkoutEmail.value = '';
    upgradeSection.style.display = 'none';
    checkoutSection.style.display = 'block';
    checkoutEmail.focus();
  });

  // Step 2: Back → Step 1
  checkoutBack.addEventListener('click', (e) => {
    e.preventDefault();
    checkoutSection.style.display = 'none';
    upgradeSection.style.display = 'block';
  });

  // Step 2: Submit email
  checkoutBtn.addEventListener('click', async () => {
    const email = checkoutEmail.value.trim();
    checkoutError.textContent = '';

    if (!email || !email.includes('@') || !email.includes('.')) {
      checkoutError.textContent = 'Please enter a valid email address.';
      return;
    }

    checkoutBtn.disabled = true;
    checkoutBtn.textContent = isRestoreMode ? 'Verifying...' : 'Loading...';

    if (isRestoreMode) {
      const result = await sendMessage('VERIFY_LICENSE', { email });

      if (result && result.error) {
        checkoutError.textContent = result.error;
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Verify purchase';
        return;
      }

      if (result && result.isPaid) {
        showProState();
        updateQuota(quota, result);
      } else {
        checkoutError.textContent = 'No purchase found for this email.';
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Verify purchase';
      }
    } else {
      // Save email, open Stripe Payment Link with email prefilled
      await sendMessage('SET_LICENSE', {
        license: { isPaid: false, purchaseDate: null, email }
      });

      const paymentLink = 'https://buy.stripe.com/14A4gydLk4PGgAcgEdaEE00'
        + '?prefilled_email=' + encodeURIComponent(email);
      chrome.tabs.create({ url: paymentLink });

      // Show verifying state
      checkoutSection.style.display = 'none';
      verifyingSection.style.display = 'block';

      // Poll until payment completes
      pollForPayment(email);
    }
  });

  // Allow Enter key to submit
  checkoutEmail.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkoutBtn.click();
  });

  document.querySelector('.popup__footer-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://stale-extension.com/privacy' });
  });

  // ── Auto-verify (background check on popup open) ────

  async function autoVerify(email) {
    const result = await sendMessage('VERIFY_LICENSE', { email });
    if (result && result.isPaid) {
      showProState();
      updateQuota(quota, result);
    }
  }

  // ── Poll for payment completion ─────────────────────

  async function pollForPayment(email) {
    const maxAttempts = 100;
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        verifyingSection.style.display = 'none';
        upgradeSection.style.display = 'block';
        return;
      }

      const result = await sendMessage('VERIFY_LICENSE', { email });
      if (result && result.isPaid) {
        clearInterval(interval);
        showProState();
        updateQuota(quota, result);
      }
    }, 3000);
  }

  // ── UI Helpers ──────────────────────────────────────

  function showProState() {
    upgradeSection.style.display = 'none';
    checkoutSection.style.display = 'none';
    verifyingSection.style.display = 'none';
    proSection.style.display = 'flex';
  }

  function updateStatus() {
    statusText.textContent = enabledCheckbox.checked ? 'Active' : 'Paused';
    statusText.className = 'popup__status' + (enabledCheckbox.checked ? '' : ' popup__status--paused');
  }

  function updateQuota(q, lic) {
    const used  = q.used || 0;
    const limit = q.limit || 10;
    const isPaid = lic.isPaid || false;

    if (isPaid) {
      quotaText.textContent = 'Unlimited (Pro)';
      quotaText.style.color = '#22c55e';
      quotaFill.style.width = '100%';
      quotaFill.style.background = '#22c55e';
    } else {
      const pct = Math.min(100, (used / limit) * 100);
      quotaFill.style.width = pct + '%';
      quotaText.textContent = `${used} / ${limit} used`;

      if (pct >= 100) {
        quotaFill.style.background = '#ef4444';
        quotaText.style.color = '#ef4444';
      } else if (pct >= 70) {
        quotaFill.style.background = '#f97316';
      } else {
        quotaFill.style.background = '#D4820C';
      }
    }
  }

  function saveThresholds() {
    savePrefs({
      thresholds: {
        green:  parseInt(greenSlider.value, 10),
        yellow: parseInt(yellowSlider.value, 10),
        orange: parseInt(orangeSlider.value, 10)
      }
    });
  }

  function savePrefs(partial) {
    sendMessage('SET_PREFERENCES', { prefs: partial });
  }

  function sendMessage(type, data = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, ...data }, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    });
  }

})();
