import express from 'express';
import { getClient, isClientReady } from '../clients/getClient.js';
import { ClientModel } from '../db/clients.js';
import { MessageQueue } from '../db/messageQueue.js'; // ✅ Mongoose model
import pkg from 'whatsapp-web.js';

const { Poll } = pkg;
const router = express.Router();

router.post('/', async (req, res) => {
  const { clientId, to, message, question, options, allowMultipleAnswers, introText } = req.body;
  const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];

  // Validate required fields
  if (!clientId || !to || (!message && (!question || !options)) || !apiKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cleanClientId = String(clientId).trim();
  const cleanApiKey = String(apiKey).trim();

  console.log('📥 Incoming Request');
  console.log('Client ID:', cleanClientId);
  console.log('API Key:', cleanApiKey);

  try {
    const clientRecord = await ClientModel.findOne({
      clientId: cleanClientId
    });

    if (!clientRecord) {
      return res.status(403).json({ error: 'Invalid API Key or clientId' });
    }

    const client = getClient(cleanClientId);

    // If client is not ready → Queue the message
    if (!client || !isClientReady(cleanClientId)) {
      // Create the poll message object if it's a poll, else use regular message
      const messageToQueue = message || {
        question: question || 'Do you confirm your order?',
        options: Array.isArray(options) ? options : ['✅ Yes', '❌ No'],
        introText: introText || '',
      };

      // Queue the message in the database if client is not ready
      await MessageQueue.create({
        clientId: cleanClientId,
        to,
        message: JSON.stringify(messageToQueue), // Stringify the poll message object
        type: 'poll',
        status: 'pending',
      });

      console.log(`📨 Queued poll message for client ${cleanClientId} → ${to}`);
      return res.status(202).json({
        success: true,
        queued: true,
        message: 'Client not ready. Message queued.',
      });
    }

    // ✅ Send regular message directly if the client is ready
    if (message) {
      const chatId = to.replace(/\D/g, '') + '@c.us';
      const result = await Promise.race([
        client.sendMessage(chatId, message),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout sending message')), 10000)),
      ]);

      // Increment messagesCount for client
      await ClientModel.updateOne(
        { _id: clientRecord._id },
        { $inc: { messagesCount: 1 } }
      );

      return res.status(200).json({
        success: true,
        messageId: result.id?._serialized || null,
      });
    }

    // ✅ Send poll message if the client is ready
    if (question && options) {
      const chatId = to.replace(/\D/g, '') + '@c.us';

      // Construct Poll message correctly
      const pollMessage = new Poll({
        question: question || 'Do you confirm your order?',
        options: Array.isArray(options) ? options : ['✅ Yes', '❌ No'],
        introText: introText || '',
      });

      try {
        // Sending the poll message to the chat
        const result = await client.sendMessage(chatId, pollMessage);
        
        // Increment messagesCount for client
        await ClientModel.updateOne(
          { _id: clientRecord._id },
          { $inc: { messagesCount: 1 } }
        );

        return res.status(200).json({
          success: true,
          messageId: result.id?._serialized || null,
        });
      } catch (error) {
        return res.status(500).json({ error: 'Error sending poll message', details: error });
      }
    }
  } catch (error) {
    return res.status(500).json({ error: 'Server error', details: error });
  }
});

export default router;
