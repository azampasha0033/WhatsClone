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
import subscriptionDetailsRouter from './routes/subscriptionDetails.js';
import { requireActivePlanForClient } from './middleware/requireActivePlanForClient.js';
import getApiKeyRoute from './routes/getApiKey.js';
import uploadRouter from "./routes/upload.js";
import otpRoute from './routes/otp.js';
import path from 'path';
import templateRoutes from "./routes/template.routes.js";
import tagRoutes from "./routes/tag.routes.js";

import chatRoutes from './routes/chat.routes.js'; // your chat routes
import agentRoutes from './routes/agent.routes.js'; // your agent routes


import flowRoutes from "./routes/flow.routes.js";  // Import your flow routes
// index.js
import { getClient, getQRCode, isClientReady, sessionStatus,safeGetClient } from './clients/getClient.js';
import contactsImportRoute from './routes/contacts-import.js';  
import { startScheduledMessageSender } from './scheduler/scheduledMessageSender.js';
import scheduleMessageRoute from './routes/scheduleMessage.js';

import { Chat } from './models/Chat.js'; // make sure this is imported
import { webchatRoutes, initWebChatSocket } from "./routes/webchat/index.js";


import { validateApiKey } from './utils/validateApiKey.js'; // Adjust the path as per your file structure



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

// Web Chat Wedget Initialize socket logic
// app.use("/widget", express.static(path.join(process.cwd(), "public")));
// app.use("/api/webchat", webchatRoutes);
// initWebChatSocket(io);


// Routes
app.use('/api/chats', chatRoutes);

app.use('/schedule', scheduleMessageRoute);
app.use("/api/templates", templateRoutes);
app.use("/api/tags", tagRoutes);
app.use('/labels', labelRoute);
app.use("/uploads", express.static(process.env.BASE_DIR || path.join(process.cwd(), "uploads")));
app.use('/import-contacts', contactsImportRoute);  // Register the route
// API routes
app.use("/upload", uploadRouter);
app.use("/api/flows", flowRoutes);  // Register flow-related routes
app.use('/api', subscribeRoutes);
app.use('/subscriptions', subscriptionsStatusRoute);
app.use('/subscriptions', subscriptionDetailsRouter);

app.use('/auth', authRoute);
app.use(getApiKeyRoute);

// API routes
app.use('/qr', qrRoute);
app.use('/send-message', requireActivePlanForClient, sendMessageRoute);
app.use('/send-confirmation', sendConfirmationRoute);
app.use('/register-client', registerClientRoute);
app.use('/send-poll-message', sendPollMessageRoute);
app.use('/api/otp', otpRoute);

app.use('/api/agents', agentRoutes);

const sessionsPath = process.env.SESSIONS_DIR || './wa-sessions';


if (!fs.existsSync(sessionsPath)) {
  console.log('⚠️ Session folder missing → Railway wiped storage');
} else {
  console.log('✅ Session folder exists →', sessionsPath);
}

// ✅ Chats
app.get('/chats/:clientId', async (req, res) => {
  try {
    let { clientId } = req.params;
    const apiKey = req.headers['apikey'] || req.headers['apiKey'];  // Handle both cases

     console.log('Request Headers:', req.headers);


    // Validate API key
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

console.log(apiKey);

    // Step 1: Validate the API key
    await validateApiKey(clientId, apiKey);  // Validate the API key for the client


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

    // Get chat assignments from DB
    const dbChats = await Chat.find({ clientId }, { chatId: 1, agentId: 1, status: 1 });

    // Build a lookup map by chatId
    const assignmentMap = {};
    dbChats.forEach(c => {
      assignmentMap[c.chatId] = {
        agentId: c.agentId ? String(c.agentId) : null,
        status: c.status || 'pending'
      };
    });

    // Merge WhatsApp chats with DB data
    const formatted = chats.map(chat => {
      const assignInfo = assignmentMap[chat.id._serialized] || {};
      return {
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        lastMessage: chat.lastMessage ? chat.lastMessage.body : null,
        timestamp: chat.timestamp,
        agentId: assignInfo.agentId,
        status: assignInfo.status || 'pending'
      };
    });

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

   const apiKey = req.headers['apikey'] || req.headers['apiKey'];  // Handle both cases

    const order = (req.query.order || 'desc').toLowerCase(); // 'asc' | 'desc'
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);

  console.log('Request Headers:', req.headers);


    // Validate API key
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Step 1: Validate API key
    await validateApiKey(clientId, apiKey); // Validate API key for the client



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
  try {
    // Connect to the database
    await connectDB();
    console.log('✅ Database connection successful.');

    // Fetch active clients from the database
    const activeClients = await ClientModel.find({ sessionStatus: 'connected' }, 'clientId');
    if (!activeClients || activeClients.length === 0) {
      console.log('⚠️ No active clients found.');
    }


    // Initialize each WhatsApp client
    await Promise.all(
      activeClients.map(async ({ clientId }) => {
        try {
          await getClient(clientId);
          console.log(`✅ Initialized WhatsApp client for: ${clientId}`);
        } catch (err) {
          console.error(`❌ Failed to initialize client ${clientId}:`, err);
        }
      })
    );
  } catch (err) {
    console.error('❌ Error fetching clients on startup:', err);
  }

  // Setup socket.io connection handling
  io.on('connection', (socket) => {
    console.log('🔌 Socket.io client connected.');

    // Handle client joining the room
    socket.on('join-client-room', (clientId) => {
      if (!clientId) return;
      console.log('📡 join-client-room received:', clientId);

      // Prevent duplicate joins
      if (socket.rooms.has(clientId)) {
        console.log(`⚠️ Already joined room ${clientId}, ignoring duplicate.`);
        return;
      }
      socket.join(clientId);

      // Send session status to the client
      const status = sessionStatus.get(clientId) || 'disconnected';
      socket.emit('session-status', { clientId, status });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ Socket disconnected (id=${socket.id})`);
    });
  });

  // Start the server and listen on the specified port
  server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      throw err;
    }
  });
};

// Start the server
startServer();
