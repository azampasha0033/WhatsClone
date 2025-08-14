// index.js (QR + session stable)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { connectDB } from './db/mongo.js';
import { ClientModel } from './db/clients.js';
import { getClient, getQRCode, isClientReady } from './clients/getClient.js';
      
// Route imports
import qrRoute from './routes/qrCode.js';
import sendMessageRoute from './routes/sendMessage.js';
import sendConfirmationRoute from './routes/sendConfirmation.js';
import registerClientRoute from './routes/registerClient.js';
import sendPollMessageRoute from './routes/sendPollMessage.js';
import authRoute from './routes/auth.js';
import { jwtAuth } from './middleware/jwtAuth.js';
import subscribeRoutes  from './routes/subscribe.js';
import subscriptionsStatusRoute from './routes/subscriptionsStatus.js';
import { requireActivePlanForClient } from './middleware/requireActivePlanForClient.js';
import getApiKeyRoute from './routes/getApiKey.js';

if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', true);
}

const app = express();
const server = http.createServer(app);

// ⚠️ adjust origins as needed (add your ngrok if you use one)
const io = new Server(server, {
  cors: {
    origin: ['http://localhost', 'http://127.0.0.1'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});
global.io = io;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', subscribeRoutes);
app.use('/subscriptions', subscriptionsStatusRoute);
app.use('/auth', authRoute);
app.use(getApiKeyRoute);
app.use('/qr', qrRoute);
app.use('/send-message', requireActivePlanForClient, sendMessageRoute);
app.use('/send-confirmation', sendConfirmationRoute);
app.use('/register-client', registerClientRoute);
app.use('/send-poll-message', sendPollMessageRoute);

// --- Chats & Messages demo endpoints (unchanged) ---
app.get('/chats/:clientId', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = getClient(clientId);
    if (!client) return res.status(404).json({ error: `Client ${clientId} not found.` });

    const chats = await client.getChats();
    return res.json({
      clientId,
      chats: chats.map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        lastMessage: chat.lastMessage ? chat.lastMessage.body : null,
        timestamp: chat.lastMessage ? chat.lastMessage.timestamp : null
      }))
    });
  } catch (err) {
    console.error(`❌ Error fetching chats for ${req.params.clientId}:`, err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/messages/:clientId/:chatId', async (req, res) => {
  try {
    const { clientId, chatId } = req.params;
    const order = (req.query.order || 'desc').toLowerCase();
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const client = getClient(clientId);
    if (!client) return res.status(404).json({ error: `Client ${clientId} not found.` });

    const chat = await client.getChatById(chatId);
    if (!chat) return res.status(404).json({ error: `Chat ${chatId} not found.` });

    const rawMessages = await chat.fetchMessages({ limit });
    rawMessages.sort((a, b) => {
      const ta = a.timestamp || 0;
      const tb = b.timestamp || 0;
      return order === 'desc' ? (tb - ta) : (ta - tb);
    });

    const processedMessages = await Promise.all(rawMessages.map(async (message) => {
      let quotedMessage = null;
      try {
        if (message.hasQuotedMsg && typeof message.getQuotedMessage === 'function') {
          const qm = await message.getQuotedMessage();
          quotedMessage = qm?.body ?? null;
        }
      } catch {}

      const messageData = {
        id: message.id._serialized,
        from: message.from,
        to: message.to,
        timestamp: message.timestamp,
        body: message.body,
        type: message.type,
        isQuoted: message.hasQuotedMsg,
        quotedMessage,
        mediaUrl: null,
        mediaInfo: null,
      };

      if (message.hasMedia) {
        try {
          const media = await message.downloadMedia();
          if (media) {
            const base64Url = `data:${media.mimetype};base64,${media.data}`;
            if (media.mimetype.startsWith('image/')) {
              messageData.mediaUrl = base64Url;
              messageData.mediaInfo = { type: 'image', mimetype: media.mimetype, filename: media.filename || 'Unnamed file' };
            } else if (media.mimetype.startsWith('video/')) {
              messageData.mediaUrl = base64Url;
              messageData.mediaInfo = { type: 'video', mimetype: media.mimetype, filename: media.filename || 'Unnamed file' };
            } else if (media.mimetype.startsWith('application/')) {
              messageData.mediaUrl = base64Url;
              messageData.mediaInfo = { type: 'document', mimetype: media.mimetype, filename: media.filename || 'Unnamed file' };
            } else if (media.mimetype.startsWith('audio/')) {
              messageData.mediaUrl = base64Url;
              messageData.mediaInfo = { type: 'audio', mimetype: media.mimetype, filename: media.filename || 'Unnamed audio file' };
            }
          }
        } catch (error) {
          console.error('Error processing media:', error);
        }
      }

      return messageData;
    }));

    return res.json({
      clientId, chatId, order,
      count: processedMessages.length,
      messages: processedMessages
    });
  } catch (err) {
    console.error(`❌ Error fetching messages for client ${req.params.clientId}, chat ${req.params.chatId}:`, err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Status Endpoint
app.get('/status/:clientId', (req, res) => {
  try {
    const clientId = req.params.clientId;
    const qr = getQRCode(clientId);
    const isReady = isClientReady(clientId);
    res.json({ clientId, ready: isReady, qrAvailable: !!qr });
  } catch (err) {
    console.error('❌ Error in /status route:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/', (_req, res) => res.send('👋 Hello from WhatsApp Web API!'));

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  await connectDB();

  // Auto-init active sessions
  try {
    const activeClients = await ClientModel.find({ sessionStatus: 'connected' }, 'clientId');
    console.log(`🔁 Found ${activeClients.length} active client(s) to initialize...`);

    await Promise.all(
      activeClients.map(async ({ clientId }) => {
        try {
          await getClient(clientId);
          console.log(`✅ Initialized WhatsApp client for: ${clientId}`);
        } catch (err) {
          console.error(`❌ Failed to initialize client ${clientId}:`, err.message);
        }
      })
    );
  } catch (err) {
    console.error('❌ Error fetching clients on startup:', err.message);
  }

  // --- Socket.IO: send latest QR on join, or 'ready' ---
  io.on('connection', (socket) => {
    console.log('🔌 Socket.io client connected');

    socket.on('join-client-room', async (clientId) => {
      if (!clientId) {
        console.warn('⚠️ join-client-room received empty clientId. Ignoring.');
        return;
      }
      console.log(`📡 join-client-room received: ${clientId}`);

      // Ensure client is initialized (will load LocalAuth session if present)
      getClient(clientId);

      socket.join(clientId);
      socket.clientId = clientId;

      const ready = isClientReady(clientId);
      const qr = getQRCode(clientId);

      if (ready) {
        socket.emit('ready', { message: '✅ Already connected to WhatsApp' });
      } else if (qr) {
        socket.emit('qr', { qr });
      } else {
        socket.emit('waiting', { message: '⏳ Waiting for QR...' });
      }
    });

    // Broadcast test/demo messages to room if you use it
    socket.on('send-message', (messageData) => {
      if (messageData?.clientId) socket.to(messageData.clientId).emit('new-message', messageData);
    });

    socket.on('disconnect', async () => {
      const clientId = socket.clientId;
      console.log(`❌ Socket disconnected for clientId: ${clientId || 'unknown'}`);

      if (clientId && !isClientReady(clientId)) {
        await ClientModel.updateOne(
          { clientId },
          { $set: { sessionStatus: 'disconnected' } }
        );
        console.log(`🔴 sessionStatus → 'disconnected' for ${clientId}`);
      } else {
        console.log(`ℹ️ Ignoring socket disconnect; client is still ready.`);
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      process.exit(1);
    } else {
      throw err;
    }
  });
};

startServer();
