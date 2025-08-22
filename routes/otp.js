import express from 'express';
import { sendOtp, verifyOtp, resendOtp } from '../services/otpService.js';

const router = express.Router();

router.post('/send', async (req, res) => {
  try {
    const { clientId, phone, templateText } = req.body;
    if (!clientId || !phone) return res.status(400).json({ error: 'clientId and phone required' });

    const result = await sendOtp(clientId, phone, templateText);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { clientId, phone, otp } = req.body;
    if (!clientId || !phone || !otp) return res.status(400).json({ error: 'clientId, phone, otp required' });

    const result = await verifyOtp(clientId, phone, otp);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/resend', async (req, res) => {
  try {
    const { clientId, phone, templateText } = req.body;
    if (!clientId || !phone) return res.status(400).json({ error: 'clientId and phone required' });

    const result = await resendOtp(clientId, phone, templateText);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
