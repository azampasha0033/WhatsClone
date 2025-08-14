import express from 'express';
import { ClientModel } from '../db/clients.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/', async (req, res) => {
  const { clientId, name, plan, expiresAt,user_id } = req.body;

  if (!clientId || !name) {
    return res.status(400).json({ error: 'clientId and name are required' });
  }

  const existing = await ClientModel.findOne({ clientId });
  if (existing) {
    return res.status(409).json({ error: 'Client already exists' });
  }

  const apiKey = crypto.randomBytes(16).toString('hex');

  const newClient = new ClientModel({
    clientId,
    name,
    apiKey,
    plan: plan || 'basic',
    user_id: user_id || null,
    expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    sessionStatus: 'disconnected',
  });

  await newClient.save();

  res.send({ success: true, apiKey });
});

export default router;
