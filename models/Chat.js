// models/Chat.js
import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  chatId:   { type: String, required: true, index: true },
  name:     { type: String },
  isGroup:  { type: Boolean, default: false },
  
  agentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null }, // Assigned agent
  status:   { type: String, enum: ['pending', 'assigned', 'closed'], default: 'pending' },

  updatedAt:{ type: Date, default: Date.now },

  messages: [
    {
      sender: { type: String, enum: ['user', 'agent'], required: true },
      content: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

// prevent duplicates (unique per clientId+chatId)
chatSchema.index({ clientId: 1, chatId: 1 }, { unique: true });

export const Chat = mongoose.model('Chat', chatSchema);
