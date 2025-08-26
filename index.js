// index.js (fixed and complete with QR & status JSON + ngrok fallback check)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { connectDB } from './db/mongo.js';
import { ClientModel } from './db/clients.js';




import fs from 'fs';


// Route imports
import qrRoute from './routes/qrCode.js';
import sendMessageRoute from './routes/sendMessage.js';
import sendConfirmationRoute from './routes/sendConfirmation.js';
import registerClientRoute from './routes/registerClient.js';
import sendPollMessageRoute from './routes/sendPollMessage.js';
import authRoute from './routes/auth.js';
import labelRoute from './routes/labels.js';
import { jwtAuth } from './middleware/jwtAuth.js';
import subscribeRoutes  from './routes/subscribe.js';
import subscriptionsStatusRoute from './routes/subscriptionsStatus.js';
import { requireActivePlanForClient } from './middleware/requireActivePlanForClient.js';
import getApiKeyRoute from './routes/getApiKey.js';
import uploadRouter from "./routes/upload.js";
import otpRoute from './routes/otp.js';
import path from 'path';
// index.js
import { getClient, getQRCode, isClientReady, sessionStatus } from './clients/getClient.js';
import contactsImportRoute from './routes/contacts-import.js';  
import { startScheduledMessageSender } from './scheduler/scheduledMessageSender.js';
import scheduleMessageRoute from './routes/scheduleMessage.js';



// import usersList from './routes/users-list.js';

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

startScheduledMessageSender();

app.use('/schedule', scheduleMessageRoute);

app.use('/labels', labelRoute);
app.use("/uploads", express.static(process.env.BASE_DIR || path.join(process.cwd(), "uploads")));
app.use('/import-contacts', contactsImportRoute);  // Register the route
// API routes
app.use("/upload", uploadRouter);

app.use('/api', subscribeRoutes);
app.use('/subscriptions', subscriptionsStatusRoute);
app.use('/auth', authRoute);
app.use(getApiKeyRoute);

// API routes
app.use('/qr', qrRoute);
app.use('/send-message', requireActivePlanForClient, sendMessageRoute);
app.use('/send-confirmation', sendConfirmationRoute);
app.use('/register-client', registerClientRoute);
app.use('/send-poll-message', sendPollMessageRoute);
app.use('/api/otp', otpRoute);
const sessionsPath = process.env.SESSIONS_DIR || './wa-sessions';

if (!fs.existsSync(sessionsPath)) {
  console.log('⚠️ Session folder missing → Railway wiped storage');
} else {
  console.log('✅ Session folder exists →', sessionsPath);
}

/* -------------------------------------------------------------------------- */
/*                            SAFE CLIENT WRAPPER                             */
/* -------------------------------------------------------------------------- */
async function safeGetClient(clientId) {
  const client = getClient(clientId);
  if (!client) return null;

  if (!client.pupPage || client.pupPage.isClosed()) {
    console.warn(`⚠️ Client ${clientId}: Puppeteer page is closed. Recycling...`);
    try { await client.destroy(); } catch {}
    await getClient(clientId); // restart
    return null;
  }

  if (!isClientReady(clientId)) {
    console.warn(`⚠️ Client ${clientId} not ready yet.`);
    return null;
  }

  return client;
}

/* -------------------------------------------------------------------------- */
/*                                 ROUTES                                     */
/* -------------------------------------------------------------------------- */

// ✅ Chats
app.get('/chats/:clientId', async (req, res) => {
  try {
    let { clientId } = req.params;

    // 🔑 If we receive a Mongo ObjectId, resolve it to real clientId
    if (mongoose.Types.ObjectId.isValid(clientId)) {
      const record = await ClientModel.findById(clientId);
      if (record && record.clientId) {
        console.log(`Resolved clientId: ${record.clientId} using field: _id`);
        clientId = record.clientId;
      }
    }

    const client = await safeGetClient(clientId);
    if (!client) {
      return res.status(503).json({ error: `Client ${clientId} restarting or not ready. Try again shortly.` });
    }

    let chats;
    try {
      chats = await client.getChats();
    } catch (err) {
      console.error(`⚠️ getChats failed for ${clientId}:`, err.message);
      try { await client.destroy(); } catch {}
      return res.status(500).json({ error: `Client ${clientId} needs restart` });
    }

    const formatted = chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage ? chat.lastMessage.body : null,
      timestamp: chat.timestamp
    }));

    global.io?.to(clientId).emit('chats-list', formatted);
    return res.json({ clientId, chats: formatted });

  } catch (err) {
    console.error(`❌ Error fetching chats:`, err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ Messages
app.get('/messages/:clientId/:chatId', async (req, res) => {
  try {
    const { clientId, chatId } = req.params;
    const order = (req.query.order || 'desc').toLowerCase(); // 'asc' | 'desc'
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);

    const client = await safeGetClient(clientId);
    if (!client) {
      return res.status(503).json({ error: `Client ${clientId} restarting or not ready. Try again shortly.` });
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

    const processedMessages = await Promise.all(rawMessages.map(async (message) => {
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
      clientId,
      chatId,
      order,
      count: processedMessages.length,
      messages: processedMessages
    });

  } catch (err) {
    console.error(`❌ Error fetching messages for client ${req.params.clientId}, chat ${req.params.chatId}:`, err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ Status Endpoint
app.get('/status/:clientId', (req, res) => {
  try {
    const clientId = req.params.clientId;
    const qr = getQRCode(clientId);
    const isReady = isClientReady(clientId);

    res.setHeader('Content-Type', 'application/json');
    return res.json({
      clientId,
      ready: isReady,
      qrAvailable: !!qr
    });
  } catch (err) {
    console.error('❌ Error in /status route:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Base route
app.get('/', (req, res) => res.send('👋 Hello from WhatsApp Web API!'));

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  await connectDB();

  try {
    const activeClients = await ClientModel.find({ sessionStatus: 'connected' }, 'clientId');
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

io.on('connection', (socket) => {
//  console.log('🔌 Socket.io client connected');

  socket.on('join-client-room', (clientId) => {
    if (!clientId) return;
    console.log('📡 join-client-room received:', clientId);

    // prevent duplicate joins
    if (socket.rooms.has(clientId)) {
      console.log(`⚠️ Already joined room ${clientId}, ignoring duplicate`);
      return;
    }

    socket.join(clientId);

    // immediately send current session status
    const status = sessionStatus.get(clientId) || 'disconnected';
    socket.emit('session-status', { clientId, status });
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected (id=${socket.id})`);
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
