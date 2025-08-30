import express from 'express';
import { getClient, getQRCode, isClientReady } from '../clients/getClient.js';

const router = express.Router();

router.get('/:clientId', async (req, res) => {
  const { clientId } = req.params;

  try {
    const client = getClient(clientId); // Ensure client initializes
    const qr = getQRCode(clientId);  // Retrieve QR code for this client
    const isReady = isClientReady(clientId);  // Check if the client is ready

    if (isReady) {
      return res.json({ status: 'ready', qr: null, message: '✅ Already connected' });
    }

    if (!qr) {
      return res.json({ status: 'pending', qr: null, message: '⏳ QR generating...' });
    }

    // Emit QR via Socket.IO to update the client
    global.io?.to(clientId).emit('qr', { qr });

    return res.json({ status: 'qr', qr });  // Send back QR code URL if available
  } catch (err) {
    console.error(`❌ QR Route Error for clientId ${clientId}:`, err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


export default router;
