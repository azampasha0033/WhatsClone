import express from 'express';
import { getClient, getQRCode, isClientReady } from '../clients/getClient.js';

const router = express.Router();

router.get('/:clientId', async (req, res) => {
  const { clientId } = req.params;

  try {
    const client = getClient(clientId); // Ensures client initializes
    const qr = getQRCode(clientId);
    const isReady = isClientReady(clientId);

    if (isReady) {
      return res.json({ status: 'ready', qr: null, message: '✅ Already connected' });
    }

    if (!qr) {
      return res.json({ status: 'pending', qr: null, message: '⏳ QR generating...' });
    }

    console.log(qr);
    // ✅ Emit QR again via Socket.IO
    global.io?.to(clientId).emit('qr', { qr });

    return res.json({ status: 'qr', qr });
  } catch (err) {
    console.error(`❌ QR Route Error for clientId ${clientId}:`, err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
