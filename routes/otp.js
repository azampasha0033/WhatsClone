import express from 'express';
import { generateOtp, verifyOtp } from '../services/otpService.js';
import { getClient, isClientReady, getQRCode } from '../clients/getClient.js';

const router = express.Router();

// Send OTP
router.post('/send', async (req, res) => {
  try {
    const { phone, clientId, template } = req.body; // ✅ accept template from payload
    if (!phone || !clientId) {
      return res.status(400).json({ error: 'Phone and clientId are required' });
    }

    const client = getClient(clientId);

    // check WhatsApp session status
    if (!isClientReady(clientId)) {
      const qr = getQRCode(clientId);
      if (qr) {
        return res.status(400).json({
          error: `Client ${clientId} not authenticated. Please scan QR.`,
          qr
        });
      }
      return res.status(400).json({
        error: `Client ${clientId} not ready. Authentication required.`
      });
    }

    // ✅ generate OTP
    const code = await generateOtp(phone, clientId);
    const chatId = phone.replace(/\D/g, '') + '@c.us';

    // ✅ pick template if provided, else fallback
    const msgTemplate = template || "🔑 Your OTP is: {{otp}}";

    // ✅ replace placeholder with actual OTP
    const messageText = msgTemplate.replace("{{otp}}", code);

    await client.sendMessage(chatId, messageText);

    res.json({ ok: true, phone, message: messageText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Verify OTP
router.post('/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone & code required' });
    }

    const result = await verifyOtp(phone, code);
    if (!result.ok) return res.status(400).json(result);

    res.json({ ok: true, message: 'OTP verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
