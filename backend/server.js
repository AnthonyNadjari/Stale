/**
 * Stale Pro — License Verification Server
 * Single endpoint that checks Stripe for completed payments.
 *
 * Deploy: `cd backend && vercel`
 * Env var needed: STRIPE_SECRET_KEY
 */

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// ── POST /api/verify-license ────────────────────────────
// Checks Stripe for a completed payment by email.
// Body: { email: string }
// Returns: { isPaid: boolean, purchaseDate: string|null }
app.post('/api/verify-license', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const sessions = await stripe.checkout.sessions.list({
      customer_email: email,
      status: 'complete',
      limit: 5
    });

    const validSession = sessions.data.find(s => s.payment_status === 'paid');

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Stale license server on port ${PORT}`);
});

module.exports = app;
