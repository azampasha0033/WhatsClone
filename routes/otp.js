import express from 'express';
import { sendOtp, verifyOtp, resendOtp, regenerateApiKey } from '../services/otpService.js';

const router = express.Router();

// Route to send OTP
router.post('/send', async (req, res) => {
  try {
    const { clientId, phone, templateText, apiKey } = req.body;
    if (!clientId || !phone || !apiKey) return res.status(400).json({ error: 'clientId, phone, and apiKey required' });

    const result = await sendOtp(clientId, phone, apiKey, templateText);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route to verify OTP
router.post('/verify', async (req, res) => {
  try {
    const { clientId, phone, otp, apiKey } = req.body;
    if (!clientId || !phone || !otp || !apiKey) return res.status(400).json({ error: 'clientId, phone, otp, and apiKey required' });

    const result = await verifyOtp(clientId, phone, otp, apiKey);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route to resend OTP
router.post('/resend', async (req, res) => {
  try {
    const { clientId, phone, templateText, apiKey } = req.body;
    if (!clientId || !phone || !apiKey) return res.status(400).json({ error: 'clientId, phone, and apiKey required' });

    const result = await resendOtp(clientId, phone, apiKey, templateText);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route to regenerate API key
router.post('/regenerate-api-key', async (req, res) => {
  try {
    const { clientId, apiKey } = req.body;
    if (!clientId || !apiKey) return res.status(400).json({ error: 'clientId and apiKey required' });

    const result = await regenerateApiKey(clientId, apiKey);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
