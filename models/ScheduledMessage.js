// models/ScheduledMessage.js
import mongoose from 'mongoose';

const scheduledMessageSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  chatId: { type: String, required: true },
  message: { type: String, required: true },
  sendAt: { type: Date, required: true },  // Scheduled send time
  isSent: { type: Boolean, default: false }, // Track whether the message has been sent
}, { timestamps: true });

export const ScheduledMessage = mongoose.model('ScheduledMessage', scheduledMessageSchema);
