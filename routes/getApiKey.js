// routes/getApiKey.js
import express from 'express';
import { ClientModel } from '../db/clients.js';

const router = express.Router();

router.get('/get-api-key/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await ClientModel.findOne(
      { clientId },
      { apiKey: 1, _id: 0 } // only return apiKey
    ).lean();

    if (!client) {
      return res.status(404).json({ ok: false, error: 'Client not found' });
    }

    res.json({ ok: true, apiKey: client.apiKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

export default router;
