import { Subscription } from '../models/Subscription.js';
import { Plan } from '../models/Plan.js';

export async function requireActivePlan(req, res, next) {
  try {
    const userId = req.user?.sub;     // needs jwtAuth before this
    if (!userId) {
      return res.status(401).json({ ok: false, code: 401, error: 'Unauthorized' });
    }

    const now = new Date();
    const sub = await Subscription.findOne({
      userId,
      status: { $in: ['active', 'canceled'] },
      startsAt: { $lte: now },
      endsAt: { $gt: now }
    }).sort({ endsAt: -1 });

    if (!sub) {
      return res.status(402).json({ ok: false, code: 402, error: 'No active subscription' });
    }

    const plan = await Plan.findOne({ code: sub.planCode });
    const limit = plan?.messageLimit ?? 0;
    const used = sub.usage?.messagesSentThisPeriod ?? 0;

    if (limit && used >= limit) {
      return res.status(402).json({ ok: false, code: 402, error: 'Message limit exceeded' });
    }

    // attach for downstream usage (e.g., incrementing usage)
    req.subscription = sub;
    req.plan = plan;
    next();
  } catch (e) {
    console.error('requireActivePlan error:', e);
    res.status(500).json({ ok: false, code: 500, error: 'Server error' });
  }
}
