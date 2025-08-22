import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  clientId:   { type: String, required: true, index: true },
  phone:      { type: String, required: true, index: true },
  otpHash:    { type: String, required: true },
  otpExpiresAt:{ type: Date, required: true },
  attempts:   { type: Number, default: 0 },
  verified:   { type: Boolean, default: false },
}, { timestamps: true });

otpSchema.index({ clientId: 1, phone: 1 });

export const Otp = mongoose.model('Otp', otpSchema);
