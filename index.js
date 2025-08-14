// index.js (QR + session stable, Render-ready)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

import { connectDB } from './db/mongo.js';
import { ClientModel } from './db/clients.js';
import { getClient, getQRCode, isClientReady } from './clients/getClient.js';

// Routes
import qrRoute from './routes/qrCode.js';
import sendMessageRoute from './routes/sendMessage.js';
import sendConfirmationRoute from './routes/sendConfirmation.js';
import registerClientRoute from './routes/registerClient.js';
import sendPollMessageRoute from './routes/sendPollMessage.js';
import authRoute from './routes/auth.js';
import subscribeRoutes from './routes/subscribe.js';
import subscriptionsStatusRoute from './routes/subscriptionsStatus.js';
import { requireActivePlanForClient } from './middleware/requireActivePlanForClient.js';
import getApiKeyRoute from './routes/getApiKey.js';

// ---------- Helpers ----------
function assertClientReadyOrReply(clientId, res) {
  const ready = isClientReady(clientId);
  if (!ready) {
    // 425 Too Early – client not ready yet
    res.status(425).json({ error: 'WhatsApp client not ready yet', clientId });
    return false;
  }
  return true;
}

if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', true);
}

const app = express();
const server = http.createServer(app);

// For Render / proxies
app.set('trust proxy', 1);

// Express CORS — allow all origins (no credentials)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  })
);

app.use(express.json());

// Socket.IO with open CORS (no credentials)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
});
global.io = io;

// ---------- Routes ----------
app.use('/api', subscribeRoutes);
app.use('/subscriptions', subscriptionsStatusRoute);
app.use('/auth', authRoute);
app.use(getApiKeyRoute);
app.use('/qr', qrRoute);
app.use('/send-message', requireActivePlanForClient, sendMessageRoute);
app.use('/send-confirmation', sendConfirmationRoute);
app.use('/register-client', registerClientRoute);
app.use('/send-poll-message', sendPollMessageRoute);

// GET /chats/:clientId  (safe: does not auto-start the WA client)
app.get('/chats/:clientId', async (req, res) => {
  try {
    const clientId = req.params.clientId;

    // Check readiness first (prevents auto-start via getClient)
    if (!assertClientReadyOrReply(clientId, res)) return;

    // Now safe: client is already initialized & ready
    const client = getClient(clientId);
    if (!client) return res.status(404).json({ error: `Client ${clientId} not found.` });

    // small retry if store not hydrated
    const chats = await client.getChats().catch(async (e) => {
      console.warn('getChats failed once, retrying in 300ms:', e?.message);
      await new Promise((r) => setTimeout(r, 300));
      return client.getChats();
    });

    return res.json({
      clientId,
      chats: chats.map((c) => ({
        id: c.id._serialized,
        name: c.name,
        isGroup: c.isGroup,
        unreadCount: c.unreadCount,
        lastMessage: c.lastMessage ? c.lastMessage.body : null,
        timestamp: c.lastMessage ? c.lastMessage.timestamp : null,
      })),
    });
  } catch (err) {
    console.error(`❌ Error fetching chats for ${req.params.clientId}:`, err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /messages/:clientId/:chatId  (safe: does not auto-start; returns JSON)
app.get('/messages/:clientId/:chatId', async (req, res) => {
  try {
    const { clientId, chatId } = req.params;
    const order = (req.query.order || 'desc').toLowerCase(); // 'asc' | 'desc'
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);

    // Check readiness first
    if (!assertClientReadyOrReply(clientId, res)) return;

    const client = getClient(clientId);
    if (!client) return res.status(404).json({ error: `Client ${clientId} not found.` });

    const chat = await client.getChatById(chatId);
    if (!chat) return res.status(404).json({ error: `Chat ${chatId} not found.` });

    // Fetch messages and order
    const raw = await chat.fetchMessages({ limit });
    raw.sort((a, b) => {
      const ta = a.timestamp || 0;
      const tb = b.timestamp || 0;
      return order === 'desc' ? tb - ta : ta - tb;
    });

    // Lightweight projection (no media download here for speed)
    const messages = await Promise.all(
      raw.map(async (m) => {
        let quotedMessage = null;
        try {
          if (m.hasQuotedMsg && typeof m.getQuotedMessage === 'function') {
            const qm = await m.getQuotedMessage();
            quotedMessage = qm?.body ?? null;
          }
        } catch {}

        return {
          id: m.id?._serialized,
          from: m.from,
          to: m.to,
          timestamp: m.timestamp,
          body: m.body,
          type: m.type,
          isQuoted: m.hasQuotedMsg === true,
          quotedMessage,
          hasMedia: m.hasMedia === true,
        };
      })
    );

    return res.json({ clientId, chatId, order, count: messages.length, messages });
  } catch (err) {
    console.error(
      `❌ Error fetching messages for client ${req.params.clientId}, chat ${req.params.chatId}:`,
      err
    );
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Status Endpoint
app.get('/status/:clientId', (req, res) => {
  try {
    const clientId = req.params.clientId;
    const qr = getQRCode(clientId);
    const ready = isClientReady(clientId);
    res.json({ clientId, ready, qrAvailable: !!qr });
  } catch (err) {
    console.error('❌ Error in /status route:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Base route
app.get('/', (_req, res) => res.send('👋 Hello from WhatsApp Web API!'));

// ---------- Startup ----------
const startServer = async () => {
  await connectDB();

  // Optional boot auto-init (env toggle)
  const AUTO_INIT_CLIENTS = process.env.AUTO_INIT_CLIENTS === 'true';
  if (AUTO_INIT_CLIENTS) {
  try {
    const active = await ClientModel.find({}, 'clientId sessionStatus');
    console.log(`🔁 Found ${active.length} active client(s) to initialize...`);

    for (const { clientId } of active) {
      try {
        const client = await getClient(clientId); // this will set up LocalAuth
        client.on('qr', (qr) => {
          console.log(`📸 QR for client ${clientId}: ${qr.substring(0, 50)}...`);
          // optional: broadcast to Socket.IO room
          io.to(clientId).emit('qr', { qr });
        });

        client.on('ready', () => {
          console.log(`✅ WhatsApp ready for: ${clientId}`);
          ClientModel.updateOne({ clientId }, { sessionStatus: 'connected' }).exec();
        });

        client.on('authenticated', () => {
          console.log(`🔑 Authenticated for: ${clientId}`);
        });

        const ready = isClientReady(clientId);
        if (!ready) {
          console.warn(`⚠️ Client ${clientId} not yet ready — waiting for QR scan`);
        } else {
          console.log(`✅ Client ${clientId} is already connected`);
        }
      } catch (err) {
        console.error(`❌ Failed to initialize client ${clientId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Error fetching clients on startup:', err.message);
  }
} else {
  console.log('⏸️ Skipping auto-init (AUTO_INIT_CLIENTS=false)');
}


  const SOCKET_AUTO_INIT = process.env.SOCKET_AUTO_INIT !== 'false';

  // Socket.IO handlers
  io.on('connection', (socket) => {
    console.log('🔌 Socket.io client connected');

    socket.on('join-client-room', async (clientId) => {
      if (!clientId) {
        console.warn('⚠️ join-client-room received empty clientId. Ignoring.');
        return;
      }
      console.log(`📡 join-client-room received: ${clientId}`);

      // Optional auto-init on join
      if (SOCKET_AUTO_INIT) {
        getClient(clientId); // reuse existing or create new (LocalAuth)
      }

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

      // tiny follow-up to catch fresh QR/ready
      setTimeout(() => {
        const r2 = isClientReady(clientId);
        const q2 = getQRCode(clientId);
        if (r2) socket.emit('ready', { message: '✅ Connected' });
        else if (q2) socket.emit('qr', { qr: q2 });
      }, 250);
    });

    socket.on('send-message', (messageData) => {
      if (messageData?.clientId) socket.to(messageData.clientId).emit('new-message', messageData);
    });

    socket.on('disconnect', async () => {
      const clientId = socket.clientId;
      console.log(`❌ Socket disconnected for clientId: ${clientId || 'unknown'}`);
      // DO NOT flip DB sessionStatus here. WA connectivity is handled by whatsapp-web.js events.
    });
  });

  const PORT = process.env.PORT || 3001;
  const HOST = '0.0.0.0';

  server
    .listen(PORT, HOST, () => {
      console.log(`🚀 Server listening on ${HOST}:${PORT}`);
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        process.exit(1);
      } else {
        throw err;
      }
    });
};

startServer();
