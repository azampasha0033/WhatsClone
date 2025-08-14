import mongoose from 'mongoose';

const messageQueueSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  to: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export const MessageQueue = mongoose.model('MessageQueue', messageQueueSchema);
