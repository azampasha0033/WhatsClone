// services/subscriptions.js
import mongoose from 'mongoose';
import { Plan } from '../models/Plan.js'; // <-- make sure this exists

const SubscriptionSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    clientId: { type: String, index: true },

    // REQUIRED by your runtime validator:
    planId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
    planCode: { type: String, required: true, index: true },

    price:    { type: Number, required: true },
    currency: { type: String, default: 'USD' },

    startAt:  { type: Date, required: true },
    endAt:    { type: Date, required: true },
    expiresAt:{ type: Date, required: true }, // mirror endAt

    status: {
      type: String,
      enum: ['active', 'canceled', 'expired', 'pending'],
      default: 'pending',
      index: true
    },

    payment: {
      provider: { type: String },
      txnId:    { type: String, index: true },
      verified: { type: Boolean, default: false },
      raw:      {}
    },

    meta: {}
  },
  { timestamps: true }
);

// ⚠️ Avoid stale model during dev:
if (mongoose.models.Subscription) {
  delete mongoose.models.Subscription;
  delete mongoose.connection.models.Subscription;
}
export const Subscription = mongoose.model('Subscription', SubscriptionSchema);

/* ----------------------------- helpers ----------------------------- */
function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

/* ----------------------------- plan lookups ----------------------------- */
export async function listPlans() {
  return Plan.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
}
export async function getPlanByCode(code) {
  if (!code) return null;
  return Plan.findOne({ code, isActive: true }).lean();
}

/* --------------------------- create subscription -------------------------- */
export async function createSubscription({
  userId,
  clientId,
  planCode,
  provider = 'manual',
  txnId = null,
  verified = false,
  startAt = new Date(),
  overridePrice
}) {
  const plan = await getPlanByCode(planCode);
  if (!plan) throw new Error(`Invalid or inactive planCode: ${planCode}`);

  const endAt     = addMonths(startAt, plan.months);
  const expiresAt = endAt; // mirror
  const status    = verified ? 'active' : 'pending';

  const sub = await Subscription.create({
    userId:   userId   || undefined,
    clientId: clientId || undefined,

    planId:   plan._id,          // <-- REQUIRED
    planCode,                    // keep for readability

    price:    overridePrice ?? plan.price,
    currency: plan.currency || 'USD',

    startAt,
    endAt,
    expiresAt,                   // <-- REQUIRED

    status,
    payment: { provider, txnId, verified, raw: null },

    // keep a snapshot for UI/reporting (optional)
    meta: {
      planName: plan.name,
      planMonths: plan.months,
      messageLimit: plan.messageLimit ?? undefined,
      features: plan.features ?? undefined
    }
  });

  return sub;
}

export async function verifyPayment({ subscriptionId, rawPayload = null }) {
  const sub = await Subscription.findById(subscriptionId);
  if (!sub) throw new Error('Subscription not found');
  sub.payment.verified = true;
  if (rawPayload) sub.payment.raw = rawPayload;
  if (sub.status === 'pending') sub.status = 'active';
  await sub.save();
  return sub;
}

export async function getActiveSubscription({ userId, clientId }) {
  const now = new Date();
  const q = { status: 'active', startAt: { $lte: now }, endAt: { $gt: now } };
  if (userId) q.userId   = userId;
  if (clientId) q.clientId = clientId;
  return Subscription.findOne(q).sort({ endAt: -1 });
}

export async function cancelSubscription({ subscriptionId, cancelNow = true }) {
  const sub = await Subscription.findById(subscriptionId);
  if (!sub) throw new Error('Subscription not found');
  sub.status = 'canceled';
  if (cancelNow) sub.endAt = new Date(), sub.expiresAt = sub.endAt;
  await sub.save();
  return sub;
}
