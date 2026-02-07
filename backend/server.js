/**
 * Stale Pro — License Server
 * Handles Stripe Checkout, webhooks, and license verification.
 *
 * Deploy to: Vercel, Railway, Render, Fly.io, or any Node.js host.
 *
 * Required environment variables:
 *   STRIPE_SECRET_KEY      — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET  — whsec_...
 *   STRIPE_PRICE_ID        — price_... (Stale Pro $4.99 one-time)
 *   SUCCESS_URL            — redirect after payment
 *   CANCEL_URL             — redirect if user cancels
 */

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// ── CORS ────────────────────────────────────────────────
// Chrome extensions send requests from chrome-extension:// origins.
// In production you can restrict this to your extension ID.
app.use(cors({
  origin: true,
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// ── Stripe Webhook (needs raw body) ────────────────────
app.post('/api/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log(`[Stale] Payment completed for ${session.customer_email}`);
    }

    res.json({ received: true });
  }
);

// ── JSON body parser for all other routes ───────────────
app.use(express.json());

// ── POST /api/create-checkout ───────────────────────────
// Creates a Stripe Checkout session.
// Body: { email: string }
// Returns: { url: string }
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      mode: 'payment',
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1
      }],
      success_url: process.env.SUCCESS_URL ||
        'https://stale-extension.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.CANCEL_URL ||
        'https://stale-extension.com',
      metadata: {
        product: 'stale-pro'
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout creation error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── POST /api/verify-license ────────────────────────────
// Checks Stripe for a completed Stale Pro purchase by email.
// Body: { email: string }
// Returns: { isPaid: boolean, purchaseDate: string|null }
app.post('/api/verify-license', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Query Stripe for completed checkout sessions with this email
    const sessions = await stripe.checkout.sessions.list({
      customer_email: email,
      status: 'complete',
      limit: 10
    });

    const validSession = sessions.data.find(s =>
      s.payment_status === 'paid' &&
      s.metadata?.product === 'stale-pro'
    );

    if (validSession) {
      return res.json({
        isPaid: true,
        purchaseDate: new Date(validSession.created * 1000).toISOString()
      });
    }

    res.json({ isPaid: false, purchaseDate: null });
  } catch (err) {
    console.error('License verification error:', err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── Health check ────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'stale-license-server' });
});

// ── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Stale license server running on port ${PORT}`);
});

module.exports = app;
