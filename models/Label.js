// models/Label.js
import mongoose from 'mongoose';

const labelSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true }, // which client this label belongs to
  name: { type: String, required: true }, // label text
  color: { type: String, default: '#000000' }, // optional color for UI
}, { timestamps: true });

export const Label = mongoose.model('Label', labelSchema);
