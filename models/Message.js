import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  chatId: { type: String, required: true },
  messageId: { type: String, required: true },
  from: String,
  to: String,
  type: String,
  body: String,
  timestamp: Number,
  mediaUrl: String
}, { timestamps: true });

export const Message = mongoose.model('Message', messageSchema);
