import mongoose from 'mongoose';

const LabelSchema = new mongoose.Schema({
  clientId:  { type: String, required: true, index: true },
  name:      { type: String, required: true },
  color:     { type: String, default: '#777777' }, // UI-only
  waLabelId: { type: String, index: true }         // WhatsApp label id
}, { timestamps: true });

LabelSchema.index({ clientId: 1, name: 1 }, { unique: true });

export const Label = mongoose.model('Label', LabelSchema);
