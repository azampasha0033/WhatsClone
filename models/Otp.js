// models/Otp.js
import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  code: { type: String, required: true },        // store hashed for security
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto-delete expired

export const Otp = mongoose.model('Otp', otpSchema);
