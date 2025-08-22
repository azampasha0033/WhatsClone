// routes/auth.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserModel } from '../db/users.js';
import { ClientModel } from '../db/clients.js';
import { getClient, sessionStatus, isClientReady } from '../clients/getClient.js'; // Ensure you're using the correct imports
import { MessageQueue } from '../db/messageQueue.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const JWT_EXPIRES = '7d';
const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 10);

/* ---------------- helpers ---------------- */
function onlyDigits(s = '') { return String(s).replace(/\D/g, ''); }
function normalizePhoneToPkE164(raw) {
  const d = onlyDigits(raw);
  if (!d) return null;
  if (d.startsWith('0') && d.length === 11) return '92' + d.slice(1); // 03XXXXXXXXX → 923XXXXXXXXX
  if (d.startsWith('92')) return d;
  if (d.length === 10) return '92' + d; // e.g., 3XXXXXXXXX
  return d;
}
function maskPhone(phoneE164) {
  const s = String(phoneE164 || '');
  if (s.length <= 4) return '****';
  return s.slice(0, 2) + '******' + s.slice(-4);
}

/* ---------------- Helper to Send OTP ---------------- */
async function sendOtpViaWhatsApp({ clientId, phoneE164, otp }) {
  let client = getClient(clientId);

  if (!client) {
    throw new Error('WhatsApp client not found');
  }

  // If client is not yet connected → wait for it
  if (sessionStatus.get(clientId) !== 'connected') {
    console.log(`⚠️ Client ${clientId} not connected, trying to re-authenticate...`);

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

  const chatId = `${phoneE164}@c.us`;
  const msg = `🔐 Your verification code is: *${otp}*\nThis code will expire in ${OTP_TTL_MIN} minutes.`;

  if (!client || !isClientReady(clientId)) {
    // If the client is not ready, queue the message
    await MessageQueue.create({
      clientId,
      to: phoneE164,
      message: JSON.stringify({ message: msg }),
      type: 'message',
      status: 'pending'
    }).catch(() => null);
    return { queued: true, sent: false };
  }

  // If the client is connected and ready, send the OTP message
  const sent = await client.sendMessage(chatId, msg);
  return { queued: false, sent: !!sent?.id?._serialized, messageId: sent?.id?._serialized || null };
}

/* ---------------- Routes ----------------- */

// POST /auth/signup (phone-based OTP)
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, phone, clientId } = req.body;
    if (!email || !password || !phone) {
      return res.status(400).json({ error: 'name, email, password and phone are required' });
    }

    // Choose WA sender: request clientId OR DEFAULT_WA_CLIENT_ID
    let otpSenderClientId = clientId || process.env.DEFAULT_WA_CLIENT_ID || null;
    if (!otpSenderClientId) {
      return res.status(400).json({ error: 'clientId required (no default sender configured)' });
    }

    // Validate sender client exists (optional but helpful)
    const clientDoc = await ClientModel.findOne({ clientId: otpSenderClientId });
    if (!clientDoc) return res.status(400).json({ error: 'Invalid clientId for OTP sender' });

    const phoneE164 = normalizePhoneToPkE164(phone);
    if (!phoneE164) return res.status(400).json({ error: 'Invalid phone format' });

    const exists = await UserModel.findOne({ $or: [{ email }, { phoneE164 }] });
    if (exists) return res.status(409).json({ error: 'Email or phone already in use' });

    const passwordHash = await bcrypt.hash(password, 12);

    // Generate OTP
    const otp = (Math.floor(100000 + Math.random() * 900000)).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

    const user = await UserModel.create({
      name: name || '',
      email,
      passwordHash,
      phoneRaw: phone,
      phoneE164,
      phoneVerified: false,
      otpHash,
      otpExpiresAt,
      otpAttemptCount: 0,
      clientId: otpSenderClientId
    });

    const sendResult = await sendOtpViaWhatsApp({ clientId: otpSenderClientId, phoneE164, otp });

    return res.status(201).json({
      ok: true,
      status: 'otp_required',
      message: `OTP sent to WhatsApp ${maskPhone(phoneE164)}${sendResult.queued ? ' (queued)' : ''}.`,
      userId: user._id
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Other routes remain the same...

// POST /auth/forgot-password  { identifier }   // identifier can be email OR phone
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'identifier is required (email or phone)' });

    const looksLikeEmail = typeof identifier === 'string' && identifier.includes('@');
    let user = null;

    if (looksLikeEmail) {
      user = await UserModel.findOne({ email: String(identifier).trim().toLowerCase() })
        .select('+phoneVerified +phoneE164');
    } else {
      const phoneE164 = normalizePhoneToPkE164(String(identifier).trim());
      if (!phoneE164) return res.status(400).json({ error: 'Invalid phone format' });
      user = await UserModel.findOne({ phoneE164 }).select('+phoneVerified +phoneE164');
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    // We send reset OTP via WhatsApp; ensure we have a phone
    if (!user.phoneE164) {
      return res.status(400).json({ error: 'No WhatsApp phone on file for this account' });
    }

    // Generate reset OTP
    const otp = (Math.floor(100000 + Math.random() * 900000)).toString();
    const resetOtpHash = await bcrypt.hash(otp, 10);
    const resetOtpExpiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

    user.resetOtpHash = resetOtpHash;
    user.resetOtpExpiresAt = resetOtpExpiresAt;
    user.resetOtpAttemptCount = 0;
    await user.save();

    // Send via WhatsApp (use user.clientId as sender)
    const clientId = user.clientId || process.env.DEFAULT_WA_CLIENT_ID;
    if (!clientId) return res.status(400).json({ error: 'No sender client configured for OTP' });

    const { queued } = await sendOtpViaWhatsApp({
      clientId,
      phoneE164: user.phoneE164,
      otp
    });

    return res.json({
      ok: true,
      status: 'reset_otp_sent',
      message: `Password reset code sent to WhatsApp ${maskPhone(user.phoneE164)}${queued ? ' (queued)' : ''}.`
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /auth/reset-password  { identifier, code, newPassword }
router.post('/reset-password', async (req, res) => {
  try {
    const { identifier, code, newPassword } = req.body;

    if (!identifier || !code || !newPassword) {
      return res.status(400).json({ error: 'identifier, code and newPassword are required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
    }

    const looksLikeEmail = typeof identifier === 'string' && identifier.includes('@');
    let query = null;

    if (looksLikeEmail) {
      query = { email: String(identifier).trim().toLowerCase() };
    } else {
      const phoneE164 = normalizePhoneToPkE164(String(identifier).trim());
      if (!phoneE164) return res.status(400).json({ error: 'Invalid phone format' });
      query = { phoneE164 };
    }

    const user = await UserModel.findOne(query).select('+resetOtpHash +resetOtpAttemptCount +resetOtpExpiresAt +passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.resetOtpHash || !user.resetOtpExpiresAt) {
      return res.status(400).json({ error: 'No reset OTP pending for this user' });
    }
    if (new Date() > new Date(user.resetOtpExpiresAt)) {
      return res.status(400).json({ error: 'Reset OTP expired' });
    }
    if (user.resetOtpAttemptCount >= 5) {
      return res.status(429).json({ error: 'Too many attempts. Request a new reset code.' });
    }

    const ok = await bcrypt.compare(String(code), user.resetOtpHash);
    if (!ok) {
      await UserModel.updateOne({ _id: user._id }, { $inc: { resetOtpAttemptCount: 1 } });
      return res.status(401).json({ error: 'Invalid code' });
    }

    // Set new password
    user.passwordHash = await bcrypt.hash(String(newPassword), 12);

    // Clear reset fields
    user.resetOtpHash = null;
    user.resetOtpExpiresAt = null;
    user.resetOtpAttemptCount = 0;

    await user.save();

    return res.json({ ok: true, message: 'Password has been reset successfully.' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /auth/verify-phone  { phone, code }
router.post('/verify-phone', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'phone and code are required' });

    const phoneE164 = normalizePhoneToPkE164(phone);
    if (!phoneE164) return res.status(400).json({ error: 'Invalid phone format' });

    // ✅ Select hidden fields needed for verification
    const user = await UserModel.findOne({ phoneE164 })
      .select('+otpHash +otpAttemptCount +otpExpiresAt');

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.otpHash || !user.otpExpiresAt) return res.status(400).json({ error: 'No OTP pending for this user' });
    if (new Date() > new Date(user.otpExpiresAt)) return res.status(400).json({ error: 'OTP expired' });
    if (user.otpAttemptCount >= 5) return res.status(429).json({ error: 'Too many attempts. Please request a new OTP.' });

    const ok = await bcrypt.compare(String(code), user.otpHash);
    if (!ok) {
      await UserModel.updateOne({ _id: user._id }, { $inc: { otpAttemptCount: 1 } });
      return res.status(401).json({ error: 'Invalid code' });
    }

    user.phoneVerified = true;
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttemptCount = 0;
    await user.save();

    const token = jwt.sign(
      { _id: user._id.toString(), email: user.email, clientId: user.clientId, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    return res.json({
      ok: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        clientId: user.clientId,
        role: user.role,
        phoneVerified: true
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /auth/resend-otp  { phone }
router.post('/resend-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const phoneE164 = normalizePhoneToPkE164(phone);
    if (!phoneE164) return res.status(400).json({ error: 'Invalid phone format' });

    const user = await UserModel.findOne({ phoneE164 })
      .select('+otpHash +otpAttemptCount +otpExpiresAt');

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.clientId) return res.status(400).json({ error: 'No clientId available for sending OTP' });

    const otp = (Math.floor(100000 + Math.random() * 900000)).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

    user.otpHash = otpHash;
    user.otpExpiresAt = otpExpiresAt;
    user.otpAttemptCount = 0;
    await user.save();

    const sendResult = await sendOtpViaWhatsApp({ clientId: user.clientId, phoneE164, otp });

    return res.json({
      ok: true,
      status: 'otp_required',
      message: `OTP re-sent to WhatsApp ${maskPhone(user.phoneE164)}${sendResult.queued ? ' (queued)' : ''}.`
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


export default router;
