import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  chatId: { type: String, required: true },
  name: String,
  isGroup: Boolean,
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export const Chat = mongoose.model('Chat', chatSchema);
