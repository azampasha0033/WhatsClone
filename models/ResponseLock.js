import mongoose from 'mongoose';

const ResponseLockSchema = new mongoose.Schema({
  clientId: { type: String, index: true },
  user: { type: String, index: true },          // "923xxx@c.us"
  correlationId: { type: String, index: true }, // e.g. confirm:12345
  value: String,                                 // 'yes' | 'no' | rowId | etc.
  lockedAt: Date
}, { timestamps: true });

ResponseLockSchema.index({ clientId: 1, user: 1, correlationId: 1 }, { unique: true });

export const ResponseLock = mongoose.model('ResponseLock', ResponseLockSchema);
