import express from 'express';
import { generateOtp, verifyOtp } from '../services/otpService.js';
import { getClient } from '../clients/getClient.js';

const router = express.Router();

// Send OTP
router.post('/send', async (req, res) => {
  try {
    const { phone, clientId } = req.body;
    if (!phone || !clientId) {
      return res.status(400).json({ error: 'Phone and clientId are required' });
    }

    // ✅ generate + quota check
    const code = await generateOtp(phone, clientId);

    // ✅ get WA client to actually send message
    const client = getClient(clientId);
    if (!client) {
      return res.status(400).json({ error: `Client ${clientId} not initialized` });
    }

    const chatId = phone.replace(/\D/g, '') + '@c.us';
    await client.sendMessage(chatId, `🔑 Your OTP is: ${code}`);

    res.json({ ok: true, phone });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
