// services/quota.js
import { Subscription } from '../models/Subscription.js';
import { Plan } from '../models/Plan.js';

export async function assertCanSendMessage(clientId) {
  const now = new Date();

  const sub = await Subscription
    .findOne({ clientId, status: 'active', expiresAt: { $gt: now } })
    .populate('planId');

  if (!sub) throw new Error('No active subscription. Please purchase a plan.');

  const limit = sub.planId?.messageLimit ?? 0;
  if (sub.messagesUsed >= limit) throw new Error('Message limit reached for your plan.');

  return { sub, limit, remaining: limit - sub.messagesUsed };
}

// Call this after a message is successfully sent:
export async function incrementUsage(subId, count = 1) {
  await Subscription.updateOne(
    { _id: subId },
    { $inc: { messagesUsed: count } }
  );
}
