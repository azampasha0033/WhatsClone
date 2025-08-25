// routes/getApiKey.js
import express from 'express';
import { ClientModel } from '../db/clients.js';

const router = express.Router();

router.get('/get-api-key/:clientId', async (req, res) => {
  try {
    const id = (req.params.clientId || '').trim();

    let query = { clientId: id };
    if (mongoose.isValidObjectId(id)) {
      query = { $or: [{ clientId: id }, { _id: new mongoose.Types.ObjectId(id) }] };
    }

    const client = await ClientModel.findOne(query).select('apiKey').lean();
    if (!client) return res.status(404).json({ ok: false, error: 'Client not found' });

    res.json({ ok: true, apiKey: client.apiKey });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Make sure you are exporting the router as default
export default router;
