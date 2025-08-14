// routes/subscriptionsStatus.js
import express from 'express';
import mongoose from 'mongoose';
import { ClientModel } from '../db/clients.js';
import { Subscription } from '../models/Subscription.js';
import { Plan } from '../models/Plan.js';

const router = express.Router();

/**
 * GET /subscriptions/status/by-client/:clientId
 * Check active subscription bound to a WA client (by _id or clientId string).
 */
router.get('/status/by-client/:clientId', async (req, res) => {
  try {
    const { clientId: rawClientId } = req.params;

    // 1) Resolve client by _id or by clientId
    let client = null;
    if (mongoose.Types.ObjectId.isValid(rawClientId)) {
      client = await ClientModel.findById(rawClientId);
    }
    if (!client) {
      client = await ClientModel.findOne({ clientId: rawClientId });
    }
    if (!client) {
      return res.status(404).json({ ok: false, code: 404, error: 'Client not found' });
    }

    // 2) Build possible subscription keys (support both storage styles)
    const clientIdCandidates = [
      String(client._id),
      client.clientId
    ].filter(Boolean);

    const now = new Date();

    // 3) Find active subscription by clientId (support startAt/endAt and startsAt/endsAt)
    const sub = await Subscription.findOne({
      clientId: { $in: clientIdCandidates },
      status: { $in: ['active', 'canceled'] },
      $or: [
        { startAt:  { $lte: now }, endAt:  { $gt: now } },
        { startsAt: { $lte: now }, endsAt: { $gt: now } }
      ]
    }).sort({ endAt: -1, endsAt: -1 });

    if (!sub) {
      return res.json({
        ok: true,
        hasActivePlan: false,
        clientId: rawClientId
      });
    }

    // 4) Compute plan info & usage
    const plan = await Plan.findOne({ code: sub.planCode });
    const limitFromPlan = plan?.messageLimit ?? 0;
    const limitFromMeta = sub?.meta?.messageLimit ?? 0;
    const messageLimit = limitFromMeta || limitFromPlan || 0;

    const used = sub.usage?.messagesSentThisPeriod ?? 0;
    const remaining = Math.max(0, messageLimit ? messageLimit - used : 0);

    // pick correct dates for response
    const starts = sub.startAt || sub.startsAt;
    const ends   = sub.endAt   || sub.endsAt;

    const daysLeft = ends
      ? Math.max(0, Math.ceil((new Date(ends) - now) / (1000 * 60 * 60 * 24)))
      : null;

    return res.json({
      ok: true,
      hasActivePlan: true,
      clientId: rawClientId,
      subscription: {
        id: String(sub._id),
        planCode: sub.planCode,
        planName: sub?.meta?.planName || plan?.name || null,
        startsAt: starts,
        endsAt: ends,
        daysLeft,
        status: sub.status,
        messageLimit,
        usedMessages: used,
        remainingMessages: remaining
      }
    });
  } catch (e) {
    console.error('status by client error:', e);
    return res.status(500).json({ ok: false, code: 500, error: 'Server error' });
  }
});

export default router;
