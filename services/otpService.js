import bcrypt from 'bcryptjs';
import { Otp } from '../models/Otp.js';
import { getClient, sessionStatus } from '../clients/getClient.js';
import { incrementUsage } from './quota.js';

/* ----------------------- Helper: Generate OTP ----------------------- */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
}

/* ----------------------- Helper: Apply Template --------------------- */
function applyOtpTemplate(templateText, otp, expiryMinutes = 5) {
  return templateText
    .replace('{{otp_code}}', otp)
    .replace('{{expiry_minutes}}', expiryMinutes.toString());
}

/* ----------------------- SEND OTP ----------------------- */
export async function sendOtp(clientId, phone, templateText) {
  // Check if client is connected
  if (sessionStatus.get(clientId) !== 'connected') {
    throw new Error('Client not connected to WhatsApp');
  }

  // Get client
  const client = getClient(clientId);
  if (!client) throw new Error('WhatsApp client not found');

  // Generate OTP
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiryMinutes = 5;
  const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Save OTP in DB
  await Otp.findOneAndUpdate(
    { clientId, phone },
    {
      otpHash,
      otpExpiresAt: expiry,
      attempts: 0,
      verified: false
    },
    { upsert: true }
  );

  // Replace placeholder in template
  const messageText = applyOtpTemplate(templateText, otp, expiryMinutes);

  // Send OTP via WhatsApp
  const chatId = phone.replace(/\D/g, '') + '@c.us';
  await client.sendMessage(chatId, messageText);

  // Increment usage (quota)
  await incrementUsage(clientId, 'messages');

  return {
    success: true,
    phone,
    clientId,
    otpSent: true
  };
}

/* ----------------------- VERIFY OTP ----------------------- */
export async function verifyOtp(clientId, phone, otp) {
  const record = await Otp.findOne({ clientId, phone });

  if (!record) throw new Error('No OTP generated for this phone');
  if (record.verified) return { success: true, message: 'Already verified' };
  if (record.otpExpiresAt < new Date()) throw new Error('OTP expired');

  const match = await bcrypt.compare(otp, record.otpHash);
  if (!match) {
    await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    throw new Error('Invalid OTP');
  }

  await Otp.updateOne(
    { _id: record._id },
    { $set: { verified: true, otpHash: null } }
  );

  return { success: true, message: 'OTP verified successfully' };
}

/* ----------------------- RESEND OTP ----------------------- */
export async function resendOtp(clientId, phone, templateText) {
  return sendOtp(clientId, phone, templateText);
}
