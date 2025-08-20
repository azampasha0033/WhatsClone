// index.js (final with real-time chats & messages)
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
import subscribeRoutes from './routes/subscribe.js';
import subscriptionsStatusRoute from './routes/subscriptionsStatus.js';
import { requireActivePlanForClient } from './middleware/requireActivePlanForClient.js';
import getApiKeyRoute from './routes/getApiKey.js';

// Debug logs for Mongo
if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', true);
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // allow all domains
    methods: ["GET", "POST"],
    credentials: true
  }
});


global.io = io;

app.use(cors());
app.use(express.json());

// ---- ROUTES ----
app.use('/api', subscribeRoutes);
app.use('/subscriptions', subscriptionsStatusRoute);
app.use('/auth', authRoute);
app.use(getApiKeyRoute);
app.use('/qr', qrRoute);
app.use('/send-message', requireActivePlanForClient, sendMessageRoute);
app.use('/send-confirmation', sendConfirmationRoute);
app.use('/register-client', registerClientRoute);
app.use('/send-poll-message', sendPollMessageRoute);

// ----------------------------
// Chats REST (fallback, non-realtime)
// ----------------------------
app.get('/chats/:clientId', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const client = getClient(clientId);
    if (!client) {
      return res.status(404).json({ error: `Client with ID ${clientId} not found.` });
    }

    const chats = await client.getChats();
    return res.json({
      clientId,
      chats: chats.map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        lastMessage: chat.lastMessage ? chat.lastMessage.body : null,
        timestamp: chat.timestamp,
      })),
    });
  } catch (err) {
    console.error(`❌ Error fetching chats for client ${req.params.clientId}:`, err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ----------------------------
// Messages REST (fallback, non-realtime)
// ----------------------------
app.get('/messages/:clientId/:chatId', async (req, res) => {
  try {
    const { clientId, chatId } = req.params;
    const order = (req.query.order || 'desc').toLowerCase();
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);

    const client = getClient(clientId);
    if (!client) {
      return res.status(404).json({ error: `Client with ID ${clientId} not found.` });
    }

    const chat = await client.getChatById(chatId);
    if (!chat) {
      return res.status(404).json({ error: `Chat with ID ${chatId} not found.` });
    }

    const rawMessages = await chat.fetchMessages({ limit });
    rawMessages.sort((a, b) => {
      const ta = a.timestamp || 0;
      const tb = b.timestamp || 0;
      return order === 'desc' ? (tb - ta) : (ta - tb);
    });

    const processedMessages = await Promise.all(
      rawMessages.map(async (message) => {
        const messageData = {
          id: message.id._serialized,
          from: message.from,
          to: message.to,
          timestamp: message.timestamp,
          body: message.body,
          type: message.type,
          isQuoted: message.hasQuotedMsg,
          quotedMessage: message.quotedMsg ? message.quotedMsg.body : null,
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
                messageData.mediaInfo = { type: 'image', mimetype: media.mimetype, filename: media.filename || 'Unnamed' };
              } else if (media.mimetype.startsWith('video/')) {
                messageData.mediaUrl = base64Url;
                messageData.mediaInfo = { type: 'video', mimetype: media.mimetype, filename: media.filename || 'Unnamed' };
              } else if (media.mimetype.startsWith('application/')) {
                messageData.mediaUrl = base64Url;
                messageData.mediaInfo = { type: 'document', mimetype: media.mimetype, filename: media.filename || 'Unnamed' };
              } else if (media.mimetype.startsWith('audio/')) {
                messageData.mediaUrl = base64Url;
                messageData.mediaInfo = { type: 'audio', mimetype: media.mimetype, filename: media.filename || 'Unnamed' };
              }
            }
          } catch (error) {
            console.error('Error processing media:', error);
          }
        }
        return messageData;
      })
    );

    return res.json({ clientId, chatId, order, count: processedMessages.length, messages: processedMessages });
  } catch (err) {
    console.error(`❌ Error fetching messages for client ${req.params.clientId}, chat ${req.params.chatId}:`, err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ----------------------------
// Status Route
// ----------------------------
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

// Base route
app.get('/', (req, res) => res.send('👋 Hello from WhatsApp Web API!'));

// ----------------------------
// SOCKET.IO HANDLERS
// ----------------------------
io.on('connection', (socket) => {
  console.log('🔌 Socket.io client connected');

socket.on('join-client-room', async (clientId) => {
  if (!clientId) return;
  console.log(`📡 join-client-room received: ${clientId}`);
  socket.join(clientId);
  socket.clientId = clientId;

  const isReady = isClientReady(clientId);
  socket.emit(isReady ? 'ready' : 'waiting', {
    message: isReady ? '✅ Already connected to WhatsApp' : '⏳ Waiting for QR...'
  });

  const client = getClient(clientId);

  // 🔹 Only send chats if client is already ready
  if (isReady && client) {
    try {
      const chats = await client.getChats();
      socket.emit('chats-list', chats.map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        lastMessage: chat.lastMessage ? chat.lastMessage.body : null,
        timestamp: chat.timestamp
      })));
    } catch (err) {
      console.error(`⚠️ Could not fetch chats for ${clientId}:`, err.message);
    }
  }
});


  // Frontend can request specific chat messages
  socket.on('load-messages', async ({ clientId, chatId }) => {
    const client = getClient(clientId);
    if (!client) return;

    const chat = await client.getChatById(chatId);
    if (!chat) return;

    const msgs = await chat.fetchMessages({ limit: 50 });
    socket.emit('messages-list', {
      chatId,
      messages: msgs.map(m => ({
        id: m.id._serialized,
        from: m.from,
        to: m.to,
        body: m.body,
        type: m.type,
        timestamp: m.timestamp,
      })),
    });
  });

  socket.on('disconnect', async () => {
    const clientId = socket.clientId;
    console.log(`❌ Socket disconnected for clientId: ${clientId || 'unknown'}`);
    if (clientId && !isClientReady(clientId)) {
      await ClientModel.updateOne(
        { clientId },
        { $set: { sessionStatus: 'disconnected' } }
      );
      console.log(`🔴 sessionStatus set to 'disconnected' for ${clientId}`);
    }
  });
});

// ----------------------------
// START SERVER
// ----------------------------
const PORT = process.env.PORT || 8080;
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
