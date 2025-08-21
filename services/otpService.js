import crypto from 'crypto';
import { Otp } from '../models/Otp.js';
import { assertCanSendMessage, incrementUsage } from './quota.js';  // ✅ reuse quota logic

export async function generateOtp(phone, clientId) {
  // ✅ check user quota first
  await assertCanSendMessage(clientId);

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
  const hash = crypto.createHash('sha256').update(code).digest('hex');

  const otp = new Otp({
    phone,
    code: hash,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // valid 5 mins
  });
  await otp.save();

  // ✅ increment usage (counts as "message sent")
  await incrementUsage(clientId);

  // TODO: actually send via SMS/WhatsApp here
  return code;
}

export async function verifyOtp(phone, code) {
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  const otp = await Otp.findOne({ phone, code: hash, verified: false });

  if (!otp) return { ok: false, error: 'Invalid or expired OTP' };
  if (otp.expiresAt < new Date()) return { ok: false, error: 'OTP expired' };

  otp.verified = true;
  await otp.save();

  return { ok: true };
}
