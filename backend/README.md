# Stale Pro — Backend Setup (5 minutes)

## Why this backend exists

Stripe secret keys **cannot** go in a Chrome extension — anyone could extract
them from the `.crx` file. This tiny server (3 endpoints) sits between
your extension and Stripe.

---

## Step 1 — Stripe Dashboard (2 min)

1. Go to https://dashboard.stripe.com/products and click **+ Add product**
2. Name: `Stale Pro` — Price: `$4.99` — One time
3. Click **Save**. Copy the **Price ID** (starts with `price_`)
4. Go to https://dashboard.stripe.com/apikeys — copy **Secret key** (`sk_live_...`)

## Step 2 — Deploy to Vercel (1 min)

1. Install Vercel CLI: `npm i -g vercel`
2. From this folder:

```
cd backend
vercel
```

3. Follow the prompts. Vercel gives you a URL like `https://stale-backend-xxx.vercel.app`

4. Set environment variables in Vercel Dashboard → Settings → Environment Variables:

| Variable               | Value                          |
|------------------------|--------------------------------|
| `STRIPE_SECRET_KEY`    | `sk_live_...` from Step 1      |
| `STRIPE_PRICE_ID`      | `price_...` from Step 1        |
| `STRIPE_WEBHOOK_SECRET`| (set in Step 3 below)          |
| `SUCCESS_URL`          | `https://stale-extension.com/success?session_id={CHECKOUT_SESSION_ID}` |
| `CANCEL_URL`           | `https://stale-extension.com`  |

## Step 3 — Stripe Webhook (1 min)

1. Go to https://dashboard.stripe.com/webhooks → **Add endpoint**
2. URL: `https://YOUR-VERCEL-URL.vercel.app/api/webhook`
3. Events: select `checkout.session.completed`
4. Click **Add endpoint**. Copy the **Signing secret** (`whsec_...`)
5. Paste it as `STRIPE_WEBHOOK_SECRET` in Vercel env vars (Step 2.4)

## Step 4 — Update extension (30 sec)

Replace the placeholder URL in **two files**:

- `stale/src/shared/config.js` line 11 → your Vercel URL
- `stale/src/background/service-worker.js` line 8 → your Vercel URL

Example: change `https://stale-api.example.com` to `https://stale-backend-xxx.vercel.app`

## Done

Rebuild and upload the extension to Chrome Web Store. When users pay,
their license activates automatically.
