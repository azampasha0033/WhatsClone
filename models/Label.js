import mongoose from 'mongoose';

const labelSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  name: { type: String, required: true },
  color: { type: String, default: '#000000' }
}, { timestamps: true });

export const Label = mongoose.model('Label', labelSchema);
