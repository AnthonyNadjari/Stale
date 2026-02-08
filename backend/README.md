# Stale Pro — Backend Setup

This tiny server has **1 endpoint** that checks Stripe to verify if a user paid.
Your Stripe secret key can't go in the extension (anyone could steal it), so this server keeps it safe.

## Deploy (2 steps)

### 1. Deploy to Vercel

```bash
cd backend
npm i -g vercel   # if you don't have it
vercel
```

Vercel gives you a URL like `https://stale-xxx.vercel.app`

### 2. Set your Stripe secret key

In the Vercel dashboard → your project → **Settings** → **Environment Variables**:

| Variable             | Value                                               |
|----------------------|-----------------------------------------------------|
| `STRIPE_SECRET_KEY`  | Your secret key from https://dashboard.stripe.com/apikeys |

Redeploy: `vercel --prod`

### 3. Update the extension (if your URL changed)

The extension currently points to `https://backend-iota-one-85.vercel.app`.
If your Vercel URL is different, update it in:
- `stale/src/shared/config.js` → `API_BASE_URL`
- `stale/src/background/service-worker.js` → `API_BASE_URL`

Done. The extension opens your Stripe Payment Link directly for checkout.
The server only handles verification.
