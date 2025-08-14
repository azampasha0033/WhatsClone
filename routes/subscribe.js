// routes/subscribe.js
import express from 'express';
import {
  listPlans,
  getPlanByCode,
  createSubscription,
  getActiveSubscription,
  verifyPayment,
  cancelSubscription
} from '../services/subscriptions.js';

const router = express.Router();

router.get('/plans', async (_req, res) => {
  try {
    const plans = await listPlans();
    res.json({ ok: true, plans });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    const { userId, clientId, planCode, provider, txnId, verified, overridePrice } = req.body;
    if (!planCode) return res.status(400).json({ ok: false, error: 'planCode is required' });
    if (!userId && !clientId)
      return res.status(400).json({ ok: false, error: 'userId or clientId is required' });

    const sub = await createSubscription({
      userId,
      clientId,
      planCode,
      provider,
      txnId,
      verified: Boolean(verified),
      overridePrice
    });

    res.json({ ok: true, subscription: sub });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
