// models/Subscription.js
import mongoose from 'mongoose';

const SubscriptionSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  startsAt: { type: Date, default: () => new Date() },
  expiresAt: { type: Date, required: true },
  messagesUsed: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active','expired','cancelled'], default: 'active' }
}, { timestamps: true });

// Optional: TTL index will auto-remove expired subs after some time (if you want deletion)
// SubscriptionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Subscription = mongoose.model('Subscription', SubscriptionSchema);
