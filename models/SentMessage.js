import mongoose from 'mongoose';

const SentMessageSchema = new mongoose.Schema({
  clientId: { type: String, index: true },
  to: String,                     // "923xxx@c.us"
  type: String,                   // 'message' | 'poll' | 'image' | 'buttons' | 'list' ...
  messageId: { type: String, unique: true, sparse: true }, // result.id?._serialized
  payload: mongoose.Schema.Types.Mixed, // the JSON you sent
  correlationId: { type: String, index: true }, // (optional) e.g. confirm:<orderId>
  answered: { type: Boolean, default: false },
  answeredAt: Date
}, { timestamps: true });

export const SentMessage = mongoose.model('SentMessage', SentMessageSchema);
