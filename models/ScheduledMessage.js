import mongoose from 'mongoose';

const scheduledMessageSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  chatId: { type: String, required: true },
  message: { type: String, required: true },
  sendAt: { type: Date, required: true },
  isSent: { type: Boolean, default: false },
  scheduleName: { type: String }, 
   failureReason: { type: String, default: null }
}, { timestamps: true });

export const ScheduledMessage = mongoose.model('ScheduledMessage', scheduledMessageSchema);
