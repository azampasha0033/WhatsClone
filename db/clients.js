import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  clientId: { type: String, unique: true, required: true },
  name: String,
  user_id: String,
  apiKey: { type: String, required: true },
  plan: String,
  expiresAt: Date,
  sessionStatus: { type: String, default: 'disconnected' },
  messagesCount: { type: Number, default: 0 },
  lastConnectedAt: { type: Date, default: null }
});

export const ClientModel = mongoose.model('Client', clientSchema);
