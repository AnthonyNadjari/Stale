# Stale — Payment setup

This guide explains how to configure payment for **Stale Pro** ($4.99). You can use either the **Chrome Web Store** or an **external payment** (Stripe, Lemon Squeezy, etc.).

---

## 1. Configure the checkout URL

All “Upgrade” buttons (popup + SERP banner) open the same URL. Set it in **`stale/src/shared/config.js`**:

```js
CHECKOUT_URL: 'https://stale-extension.com/upgrade',
```

Replace with:

- **Chrome Web Store**: your extension’s CWS listing page, or a landing page that links to the CWS payment.
- **Stripe**: your Stripe Checkout link (Create a Payment Link in [Stripe Dashboard](https://dashboard.stripe.com/payment-links)).
- **Lemon Squeezy**: your product checkout URL from [Lemon Squeezy](https://app.lemonsqueezy.com).
- **Paddle / Gumroad / etc.**: the product checkout URL.

---

## 2. Option A — Chrome Web Store (in-app purchase)

1. In [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), open your extension.
2. Go to **Monetization** (or **Payments** / **In-app products**).
3. Add a **one-time** in-app product (e.g. “Stale Pro — $4.99”).
4. Set **CHECKOUT_URL** in `config.js` to:
   - the extension’s store listing, or  
   - a page on your site that explains Pro and links to the CWS purchase flow.
5. **License verification**:  
   Google provides a [License API](https://developer.chrome.com/docs/webstore/one_time_payments/) so you can verify purchases. You need a small **backend** that:
   - Uses the user’s token (e.g. from Chrome Identity) to call Google’s API.
   - Returns whether the user has the “Stale Pro” entitlement.  
   Then either:
   - Use **Chrome Identity** in the extension and your backend to check the license and tell the extension to unlock Pro, or  
   - Use **LICENSE_VERIFY_URL** (see below) and have your backend call Google’s API when the user “activates” with a token/key.

---

## 3. Option B — External payment (Stripe, Lemon Squeezy, etc.)

### Step 1: Create the product and get the checkout URL

- **Stripe**: [Payment Links](https://dashboard.stripe.com/payment-links) → create a link for $4.99 (one-time). Copy the link.
- **Lemon Squeezy**: Create a product, get the checkout URL.
- **Paddle / Gumroad**: Same idea — get the one-time purchase URL.

Put that URL in **CHECKOUT_URL** in `config.js`.

### Step 2: Delivering the license

After payment, you must give the user a way to unlock Pro:

1. **License key (recommended)**  
   - After payment, send the user an email with a **license key** (or show it on a thank-you page).  
   - User opens the extension popup → “Have a license key?” → pastes key → **Activate**.  
   - The extension can validate the key with your backend (see Step 3).

2. **Account / sign-in**  
   - User signs in (e.g. Google or email) in the extension or on your site.  
   - Your backend knows this account has purchased; the extension calls your API to ask “does this user have Pro?” and you set the license in the extension accordingly (you’d add a small “Sign in” flow and use **SET_LICENSE** when your API says yes).

### Step 3: Optional — Validate license keys on your server

If you use **license keys**, set in `config.js`:

```js
LICENSE_VERIFY_URL: 'https://your-api.com/verify-license',
```

When the user clicks **Activate** with a key, the extension sends:

```http
POST /verify-license
Content-Type: application/json

{ "key": "USER_PASTED_KEY" }
```

Your server should:

- Check the key (e.g. in a database of sold keys).
- Return **200** and `{ "valid": true }` or `{ "ok": true }` if the key is valid.
- Return **4xx** or `{ "valid": false, "message": "Invalid or expired key" }` if not.

If **LICENSE_VERIFY_URL** is empty, the extension still shows “Have a license key?” but **Activate** will set Pro **locally without verification** (useful only for testing; do not use in production without verification).

---

## 4. Summary of config (config.js)

| Setting             | Purpose |
|---------------------|--------|
| **CHECKOUT_URL**    | Where “Upgrade — $4.99” and “Upgrade for unlimited” send the user (Stripe, Lemon Squeezy, CWS page, etc.). |
| **LICENSE_VERIFY_URL** | (Optional) Your API that validates a license key; extension POSTs `{ key }` and expects `{ valid: true }` or `{ ok: true }` for success. |

---

## 5. Testing

1. Set **CHECKOUT_URL** to your real checkout or a test page.
2. **Without** **LICENSE_VERIFY_URL**: open popup → “Have a license key?” → enter any text → **Activate**. Pro should unlock (for testing only).
3. **With** **LICENSE_VERIFY_URL**: your backend must return `{ valid: true }` or `{ ok: true }` for the key you test with.

---

## 6. References

- [Chrome Web Store one-time payments](https://developer.chrome.com/docs/webstore/one_time_payments/)
- [Stripe Payment Links](https://stripe.com/docs/payment-links)
- [Lemon Squeezy](https://docs.lemonsqueezy.com/)
