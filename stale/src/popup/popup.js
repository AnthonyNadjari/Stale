/**
 * Stale — Popup controller
 * Loads preferences from storage and saves changes in real-time.
 */
(async () => {

  // ── Elements ────────────────────────────────────────

  const enabledCheckbox  = document.getElementById('enabledCheckbox');
  const statusText       = document.getElementById('statusText');
  const quotaFill        = document.getElementById('quotaFill');
  const quotaText        = document.getElementById('quotaText');
  const greenSlider      = document.getElementById('greenSlider');
  const yellowSlider     = document.getElementById('yellowSlider');
  const orangeSlider     = document.getElementById('orangeSlider');
  const greenValue       = document.getElementById('greenValue');
  const yellowValue      = document.getElementById('yellowValue');
  const orangeValue      = document.getElementById('orangeValue');
  const showPagesCheckbox = document.getElementById('showPagesCheckbox');
  const showSerpCheckbox  = document.getElementById('showSerpCheckbox');
  const positionSelect    = document.getElementById('positionSelect');
  const upgradeSection    = document.getElementById('upgradeSection');
  const proSection        = document.getElementById('proSection');
  const upgradeBtn        = document.getElementById('upgradeBtn');

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

  // License
  if (license.isPaid) {
    upgradeSection.style.display = 'none';
    proSection.style.display = 'flex';
  }

  // ── Event listeners ─────────────────────────────────

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

  showPagesCheckbox.addEventListener('change', () => {
    savePrefs({ showBadgeOnPages: showPagesCheckbox.checked });
  });
  showSerpCheckbox.addEventListener('change', () => {
    savePrefs({ showBadgeOnSerp: showSerpCheckbox.checked });
  });
  positionSelect.addEventListener('change', () => {
    savePrefs({ badgePosition: positionSelect.value });
  });

  upgradeBtn.addEventListener('click', () => {
    const url = (window.Stale && window.Stale.CONFIG && window.Stale.CONFIG.CHECKOUT_URL) || 'https://buy.stripe.com/14A4gydLk4PGgAcgEdaEE00';
    chrome.tabs.create({ url });
  });

  const licenseKeyToggle = document.getElementById('licenseKeyToggle');
  const licenseKeyForm = document.getElementById('licenseKeyForm');
  const licenseKeyInput = document.getElementById('licenseKeyInput');
  const licenseKeyActivate = document.getElementById('licenseKeyActivate');
  const licenseKeyError = document.getElementById('licenseKeyError');

  licenseKeyToggle?.addEventListener('click', () => {
    const hidden = licenseKeyForm.style.display === 'none';
    licenseKeyForm.style.display = hidden ? 'flex' : 'none';
    if (hidden) licenseKeyInput.focus();
    licenseKeyError.textContent = '';
  });

  licenseKeyActivate?.addEventListener('click', async () => {
    const key = (licenseKeyInput?.value || '').trim();
    licenseKeyError.textContent = '';
    if (!key) {
      licenseKeyError.textContent = 'Enter your license key';
      return;
    }
    const verifyUrl = (window.Stale && window.Stale.CONFIG && window.Stale.CONFIG.LICENSE_VERIFY_URL) || '';
    if (verifyUrl) {
      try {
        const res = await fetch(verifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !(data.valid === true || data.ok === true)) {
          licenseKeyError.textContent = data.message || 'Invalid or expired key';
          return;
        }
      } catch (e) {
        licenseKeyError.textContent = 'Could not verify key. Try again.';
        return;
      }
    }
    await sendMessage('SET_LICENSE', { isPaid: true });
    upgradeSection.style.display = 'none';
    proSection.style.display = 'flex';
    updateQuota(await sendMessage('CHECK_QUOTA'), { isPaid: true });
    licenseKeyForm.style.display = 'none';
    licenseKeyInput.value = '';
  });

  document.querySelector('.popup__footer-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://stale-extension.com/privacy' });
  });

  // ── Helpers ─────────────────────────────────────────

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
