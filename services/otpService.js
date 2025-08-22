import bcrypt from 'bcryptjs';
import { Otp } from '../models/Otp.js';
import { getClient, sessionStatus } from '../clients/getClient.js';
import { assertCanSendMessage, incrementUsage } from './quota.js';
import { ClientModel } from '../db/clients.js';
import crypto from 'crypto';

// Helper to generate a random API key
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex'); // 64 character API key
}

/* ----------------------- Helper: Generate OTP ----------------------- */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
}

/* ----------------------- Helper: Apply Template --------------------- */
function applyOtpTemplate(templateText, otp, expiryMinutes = 5) {
  if (!templateText) {
    templateText = 'Your OTP is {{otp_code}} (expires in {{expiry_minutes}} minutes).';
  }

  return templateText
    .replace('{{otp_code}}', otp)
    .replace('{{expiry_minutes}}', expiryMinutes.toString());
}

/* ----------------------- SEND OTP ----------------------- */
export async function sendOtp(clientId, phone, apiKey, templateText) {
  // Validate API key
  await validateApiKey(clientId, apiKey);

  let client = getClient(clientId);
  if (!client) throw new Error('WhatsApp client not found');

  // If client is not yet connected → wait for it
  if (sessionStatus.get(clientId) !== 'connected') {
    console.log(`⚠️ Client ${clientId} not connected, waiting for re-authentication...`);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Client reconnection timeout')), 20000);

      client.once('ready', () => {
        clearTimeout(timeout);
        sessionStatus.set(clientId, 'connected');
        console.log(`✅ Client ${clientId} reconnected & ready`);
        resolve();
      });
    });
  }

  // Check subscription & quota before sending
  const { sub } = await assertCanSendMessage(clientId);

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

  // Prepare template message
  const messageText = applyOtpTemplate(templateText, otp, expiryMinutes);

  // Send OTP via WhatsApp
  const chatId = phone.replace(/\D/g, '') + '@c.us';
  await client.sendMessage(chatId, messageText);

  // Increment usage for subscription
  await incrementUsage(sub._id, 1);

  // Increment message count in client's table
  await ClientModel.updateOne(
    { clientId },
    { $inc: { messagesCount: 1 } }
  ).catch((err) => {
    console.error('Error updating message count:', err.message);
  });

  return {
    success: true,
    phone,
    clientId,
    otpSent: true
  };
}

/* ----------------------- VERIFY OTP ----------------------- */
export async function verifyOtp(clientId, phone, otp, apiKey) {
  // Validate API key
  await validateApiKey(clientId, apiKey);

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
export async function resendOtp(clientId, phone, apiKey, templateText) {
  // Validate API key
  await validateApiKey(clientId, apiKey);

  return sendOtp(clientId, phone, apiKey, templateText);
}

/* ----------------------- Validate API Key ----------------------- */
async function validateApiKey(clientId, apiKey) {
  const client = await ClientModel.findOne({ clientId });
  if (!client || client.apiKey !== apiKey) {
    throw new Error('Invalid API key');
  }
}

/* ----------------------- Regenerate API Key ----------------------- */
export async function regenerateApiKey(clientId, apiKey) {
  // Validate the API key
  await validateApiKey(clientId, apiKey);

  // Generate new API key
  const newApiKey = generateApiKey();

  // Update the client with the new API key
  await ClientModel.updateOne(
    { clientId },
    { $set: { apiKey: newApiKey } }
  );

  return { success: true, newApiKey };
}
