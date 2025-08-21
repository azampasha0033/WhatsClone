// index.js (fixed and complete with QR & status JSON + ngrok fallback check)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { connectDB } from './db/mongo.js';
import { ClientModel } from './db/clients.js';
import { Chat } from './models/Chat.js';
import { Message } from './models/Message.js';

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
import path from 'path';
// index.js
import { getClient, getQRCode, isClientReady, sessionStatus } from './clients/getClient.js';


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
app.use('/labels', labelRoute);
app.use("/uploads", express.static(process.env.BASE_DIR || path.join(process.cwd(), "uploads")));

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
// index.js
import { Chat } from './models/Chat.js';

app.get('/chats/:clientId', async (req, res) => {
  try {
    let { clientId } = req.params;

    // Support Mongo ObjectId → resolve to clientId
    if (mongoose.Types.ObjectId.isValid(clientId)) {
      const record = await ClientModel.findById(clientId);
      if (record && record.clientId) {
        clientId = record.clientId;
      }
    }

    // ✅ Load from DB (no WhatsApp delay)
    const chats = await Chat.find({ clientId })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({ clientId, chats });
  } catch (err) {
    console.error(`❌ Error fetching chats:`, err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

//Messages 
app.get('/messages/:clientId/:chatId', async (req, res) => {
  try {
    const { clientId, chatId } = req.params;
    const order = (req.query.order || 'desc').toLowerCase();
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);

    // ✅ Load from DB
    const messages = await Message.find({ clientId, chatId })
      .sort({ timestamp: order === 'desc' ? -1 : 1 })
      .limit(limit)
      .lean();

    return res.json({
      clientId,
      chatId,
      order,
      count: messages.length,
      messages
    });
  } catch (err) {
    console.error(`❌ Error fetching messages:`, err.message);
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
  console.log('🔌 Socket.io client connected');

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
