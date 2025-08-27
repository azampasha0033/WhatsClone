// routes/subscriptionDetails.js
import express from 'express';
import { Subscription } from '../models/Subscription.js';
import { Plan } from '../models/Plan.js';

const router = express.Router();

/**
 * GET /subscriptions/details/:clientId
 * Returns full subscription details including plan and usage.
 */
router.get('/details/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    // Get latest active subscription for the client
    const subscription = await Subscription.findOne({
      clientId,
      status: 'active'
    })
      .sort({ expiresAt: -1 })
      .populate('planId'); // include plan details

    if (!subscription) {
      return res.status(404).json({
        ok: false,
        message: 'No active subscription found for this client',
        clientId
      });
    }

    const plan = subscription.planId;
    const messageLimit = plan?.messageLimit || 0;
    const usedMessages = subscription.messagesUsed || 0;
    const remainingMessages = Math.max(0, messageLimit - usedMessages);

    return res.json({
      ok: true,
      clientId,
      subscription: {
        id: subscription._id,
        status: subscription.status,
        startsAt: subscription.startsAt,
        expiresAt: subscription.expiresAt,
        messagesUsed: usedMessages,
        remainingMessages,
        plan: {
          id: plan?._id,
          code: plan?.code,
          name: plan?.name,
          months: plan?.months,
          price: plan?.price,
          currency: plan?.currency,
          features: plan?.features || [],
          messageLimit
        }
      }
    });
  } catch (err) {
    console.error('❌ Error fetching subscription details:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

export default router;
