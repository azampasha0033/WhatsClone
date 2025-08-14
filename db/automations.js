import mongoose from 'mongoose';

const automationSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  trigger: String,
  response: String,
  matchType: { type: String, enum: ['exact', 'contains'], default: 'contains' },
  active: { type: Boolean, default: true },
});

export const AutomationModel = mongoose.model('Automation', automationSchema);
