// routes/sendConfirmation.js
import express from 'express';
import { getClient, isClientReady } from '../clients/getClient.js';
import { ClientModel } from '../db/clients.js';
import { MessageQueue } from '../db/messageQueue.js';
import { SentMessage } from '../models/SentMessage.js';
import pkg from 'whatsapp-web.js';

const { Buttons } = pkg;
const router = express.Router();

router.post('/', async (req, res) => {
  const {
    clientId,
    to,
    text = 'Do you confirm your order?',
    orderId,                 // required to build correlation
  } = req.body;

  const apiKey = req.headers['x-api-key'] || req.headers['X-API-KEY'];
  if (!clientId || !to || !orderId || !apiKey) {
    return res.status(400).json({ error: 'clientId, to, orderId, x-api-key required' });
  }

  const cleanClientId = String(clientId).trim();
  const cleanApiKey   = String(apiKey).trim();

  try {
    const clientRecord = await ClientModel.findOne({
      clientId: { $regex: `^${cleanClientId}$`, $options: 'i' },
      apiKey: cleanApiKey
    });
    if (!clientRecord) return res.status(403).json({ error: 'Invalid API Key or clientId' });

    const client = getClient(cleanClientId);
    const chatId = to.replace(/\D/g, '') + '@c.us';

    // Build buttons with embedded correlation
    const correlation = `confirm:${orderId}`;
    const buttons = new Buttons(
      text,
      [
        { body: '✅ Yes', id: `${correlation}:yes` },
        { body: '❌ No',  id: `${correlation}:no`  }
      ],
      'Confirmation',
      ''
    );

    if (!client || !isClientReady(cleanClientId)) {
      await MessageQueue.create({
        clientId: cleanClientId,
        to,
        message: JSON.stringify({ text, correlationId: correlation, kind: 'buttons' }),
        type: 'message',
        status: 'pending'
      });
      return res.status(202).json({ success: true, queued: true, message: 'Client not ready. buttons queued.' });
    }

    const sent = await client.sendMessage(chatId, buttons);

    await SentMessage.create({
      clientId: cleanClientId,
      to: chatId,
      type: 'buttons',
      messageId: sent?.id?._serialized || null,
      payload: { text, correlationId: correlation },
      correlationId: correlation
    }).catch(() => null);

    await ClientModel.updateOne({ _id: clientRecord._id }, { $inc: { messagesCount: 1 } });

    res.json({ success: true, messageId: sent?.id?._serialized || null });
  } catch (err) {
    console.error('sendConfirmation error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
