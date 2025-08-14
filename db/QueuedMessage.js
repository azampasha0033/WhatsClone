import mongoose from 'mongoose';

const queuedMessageSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  to: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
 
export const QueuedMessage = mongoose.model('QueuedMessage', queuedMessageSchema);
