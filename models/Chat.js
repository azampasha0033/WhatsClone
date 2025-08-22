// models/Chat.js
import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  chatId:   { type: String, required: true, index: true },
  name:     { type: String },
  isGroup:  { type: Boolean, default: false },
  updatedAt:{ type: Date, default: Date.now },
}, { timestamps: true });

// prevent duplicates (unique per clientId+chatId)
chatSchema.index({ clientId: 1, chatId: 1 }, { unique: true });

export const Chat = mongoose.model('Chat', chatSchema);
