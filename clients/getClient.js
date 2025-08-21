// clients/getClient.js
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, Poll, MessageMedia } = pkg;
import qrcode from 'qrcode';

import { MessageQueue } from '../db/messageQueue.js';
import { ClientModel } from '../db/clients.js';
import { SentMessage } from '../models/SentMessage.js';
import { PollVote } from '../models/PollVote.js';

import fs from 'fs';
import path from 'path';

// ⬇️ NEW: quota services
import { assertCanSendMessage, incrementUsage } from '../services/quota.js';

// ----------------------------- In-Memory Stores ----------------------------
const clients = new Map();
const qrCodes = new Map();
const readyFlags = new Map();
const sessionStatus = new Map();   // ✅ Added

const sessionsPath = process.env.SESSIONS_DIR || './wa-sessions';

/* ------------------------------ Helper funcs ------------------------------ */
function getShortMsgId(serialized) {
  if (!serialized) return null;
  const parts = String(serialized).split('_');
  return parts.length ? parts[parts.length - 1] : serialized;
}

function extractParentMessageIdFromVote(vote) {
  return (
    vote?.pollCreationMessageKey?._serialized ||
    vote?.pollCreationMessageKey?.id ||
    vote?.parentMsgKey?._serialized ||
    vote?.parentMsgKey?.id ||
    vote?.quotedStanzaID ||
    null
  );
}

// Map WhatsApp's selected option objects to plain text labels
function mapSelectedLabels(selected, options) {
  return (Array.isArray(selected) ? selected : [])
    .map(sel => {
      if (sel?.name) return sel.name;
      if (typeof sel === 'number' && options?.[sel]?.name) return options[sel].name;
      if (typeof sel === 'string') return sel;
      return String(sel);
    })
    .filter(Boolean);
}

function extractOrderNumberFromCorrelation(corr) {
  if (!corr) return null;
  const s = String(corr);
  const m = s.match(/(?:confirm:)?(\d+)/i); 
  return m ? m[1] : null;
}

/* -------------------------------- getClient -------------------------------- */
function getClient(clientId) {
  if (clients.has(clientId)) return clients.get(clientId);

  console.log(`🚀 Initializing WhatsApp client: ${clientId}`);

const client = new Client({
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', 
      '--disable-gpu'
    ]
  },
  authStrategy: new LocalAuth({ clientId })
});


  /* --------------------------------- QR Code -------------------------------- */
  let qrLogged = false;
  client.on('qr', async (qr) => {
    if (readyFlags.get(clientId)) return;
    readyFlags.set(clientId, false);

    if (!qrLogged) {
      console.log(`📸 QR received for ${clientId}`);
      qrLogged = true;
    }

    const qrData = await qrcode.toDataURL(qr);
    qrCodes.set(clientId, qrData);
    sessionStatus.set(clientId, 'pending');
    global.io?.to(clientId).emit('qr', { qr: qrData });

    await ClientModel.updateOne(
      { clientId },
      { $set: { sessionStatus: 'pending' } }
    ).catch((e) => console.warn('⚠️ ClientModel pending warn:', e?.message));
    console.log(`🕓 sessionStatus → 'pending' for ${clientId}`);
  });

client.on('authenticated', () => {
  console.log(`🔐 Authenticated: ${clientId}`);
});
  /* ---------------------------------- Ready --------------------------------- */
  client.on('ready', async () => {
    console.log(`✅ Client ready: ${clientId}`);
    qrCodes.set(clientId, null);
    readyFlags.set(clientId, true);
    sessionStatus.set(clientId, 'connected');
    global.io?.to(clientId).emit('ready', { message: 'connected' });

    // --- Sync chats & messages ---
  try {
    console.log(`🔄 Syncing chats for ${clientId}...`);
    const chats = await client.getChats();

    for (const chat of chats) {
      // Save chat (skip if already exists)
      await Chat.updateOne(
        { clientId, chatId: chat.id._serialized },
        {
          $set: {
            clientId,
            chatId: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            timestamp: chat.timestamp || new Date(),
          }
        },
        { upsert: true }
      );

      // Fetch last 200 messages per chat (you can increase)
      const msgs = await chat.fetchMessages({ limit: 200 });

      for (const msg of msgs) {
        await Message.updateOne(
          { clientId, messageId: msg.id._serialized },
          {
            $setOnInsert: {
              clientId,
              chatId: chat.id._serialized,
              messageId: msg.id._serialized,
              from: msg.from,
              to: msg.to,
              type: msg.type,
              body: msg.body,
              timestamp: msg.timestamp,
              mediaUrl: null, // you can add media download logic if needed
            }
          },
          { upsert: true }
        );
      }
    }

    console.log(`✅ Chats & messages synced for ${clientId}`);
  } catch (err) {
    console.error(`❌ Error syncing for ${clientId}:`, err.message);
  }


    try {
      const page = client.pupPage;
      if (page && !page.__consoleHooked) {
        page.on('console', (m) => console.log('📄[WA] LOG', m.text()));
        page.on('error', (e) => console.warn('📄[WA] PAGE ERROR', e?.message || e));
        page.on('pageerror', (e) => console.warn('📄[WA] PAGEEXCEPTION', e?.message || e));

        page.on('close', async () => {
          console.warn(`⚠️ Puppeteer page closed for ${clientId}`);
          readyFlags.set(clientId, false);
          sessionStatus.set(clientId, 'disconnected');

          await ClientModel.updateOne(
            { clientId },
            { $set: { sessionStatus: 'disconnected', lastDisconnectedAt: new Date(), lastDisconnectReason: 'PAGE_CLOSED' } }
          ).catch(() => null);

          try { await client.destroy(); } catch {}
          clients.delete(clientId);
          qrCodes.delete(clientId);
          readyFlags.delete(clientId);
          sessionStatus.delete(clientId);
        });

        page.__consoleHooked = true;
        console.log('🔌 ready: page console piping enabled');
      }
    } catch (e) {
      console.warn('⚠️ ready: console pipe failed:', e?.message);
    }

    await ClientModel.updateOne(
      { clientId },
      { $set: { sessionStatus: 'connected', lastConnectedAt: new Date() } }
    ).catch((e) => console.warn('⚠️ ClientModel connected warn:', e?.message));
    console.log(`🟢 sessionStatus → 'connected' for ${clientId}`);

    // === Process Queued Messages ===
    const queued = await MessageQueue.find({ clientId, status: 'pending' }).catch(() => []);
    console.log(`📮 queued count for ${clientId}: ${queued.length}`);

    for (const { to, message, _id, type } of queued) {
      try {
        const chatId = to.replace(/\D/g, '') + '@c.us';
        let payload = null;
        try { payload = JSON.parse(message); } catch {}

        let sent;

        if (type === 'poll') {
          if (payload?.introText) {
            await client.sendMessage(chatId, String(payload.introText));
          }

          const qRaw = (payload?.question || '').trim();
          const ops = Array.isArray(payload?.options) ? payload.options.map(o => String(o).trim()) : [];
          if (!qRaw || ops.length === 0) {
            console.error(`❌ Invalid poll payload`, payload);
            continue;
          }

          const poll = new Poll(qRaw, ops, {
            allowMultipleAnswers: payload?.allowMultipleAnswers === true
          });

          sent = await client.sendMessage(chatId, poll);
          console.log('✉️ poll sent →', sent?.id?._serialized);

        } else if (payload?.attachment) {
          let media;
          if (String(payload.attachment).startsWith('http')) {
            media = await MessageMedia.fromUrl(payload.attachment);
          } else {
            media = new MessageMedia(
              payload.mimetype || 'application/octet-stream',
              String(payload.attachment).includes(',') ? String(payload.attachment).split(',')[1] : payload.attachment,
              payload.filename || 'file'
            );
          }
          sent = await client.sendMessage(chatId, media, { caption: payload.message || '' });

        } else {
         let text;

  if (payload?.message) {
    // Use provided message
    text = payload.message;
  } else {
    // No message → auto-generate OTP and save in DB
    const { generateOtp } = await import('../services/otpService.js');
    const otp = await generateOtp(chatId.replace('@c.us', ''), clientId);
    text = `🔑 Your OTP is: ${otp}`;
  }

  sent = await client.sendMessage(chatId, text);
        }

        console.log(`✅ queued item sent type=${type} to=${to}`);

      } catch (err) {
        console.error(`⛔ queued send failed to ${to}:`, err.message);
      }
    }
  });


  client.on('auth_failure', async (msg) => {
  console.error(`❌ Auth failure for ${clientId}: ${msg}`);
  readyFlags.set(clientId, false);
  sessionStatus.set(clientId, 'disconnected');

  await ClientModel.updateOne(
    { clientId },
    { $set: { sessionStatus: 'disconnected', lastDisconnectedAt: new Date(), lastDisconnectReason: 'AUTH_FAILURE' } }
  ).catch(() => null);

  // force QR regeneration
  try { await client.destroy(); } catch {}
  clients.delete(clientId);
  qrCodes.delete(clientId);
  readyFlags.delete(clientId);
  sessionStatus.delete(clientId);

  // auto re-init → new QR will be emitted
  getClient(clientId);
});



  /* ------------------------------- New Message ------------------------------ */
  client.on('message', async (msg) => {
    try {
      const messageData = {
        id: msg.id._serialized,
        from: msg.from,
        to: msg.to,
        timestamp: msg.timestamp,
        body: msg.body,
        type: msg.type,
        hasMedia: msg.hasMedia,
        ack: msg.ack
      };

      global.io?.to(clientId).emit('new-message', { clientId, message: messageData });

      const chat = await msg.getChat();
      const chatData = {
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        lastMessage: chat.lastMessage ? chat.lastMessage.body : null,
        timestamp: chat.timestamp
      };
      global.io?.to(clientId).emit('chat-updated', chatData);

    } catch (err) {
      console.error(`❌ Error in message handler for ${clientId}:`, err.message);
    }
  });

  /* --------------------------- Poll vote --------------------------- */
  client.on('vote_update', async (vote) => {
    try {
      const parentIdRaw = extractParentMessageIdFromVote(vote);
      if (!parentIdRaw) return;

      const parentShort = getShortMsgId(parentIdRaw);
      let sent = await SentMessage.findOne({ type: 'poll', messageId: parentIdRaw }) ||
                 await SentMessage.findOne({ type: 'poll', messageId: { $regex: `${parentShort}$` } }) ||
                 await SentMessage.findOne({ type: 'poll', messageIdShort: parentShort });
      if (!sent) return;

      if (sent.answered === true) return;

      const selected = vote?.selectedOptions || vote?.vote?.selectedOptions || vote?.choices || vote?.options || [];
      const labels = mapSelectedLabels(selected, sent.payload?.options);

      const corr = sent.correlationId || sent.payload?.correlationId || null;
      const orderNumber = extractOrderNumberFromCorrelation(corr);

      const res = await SentMessage.updateOne(
        { _id: sent._id, answered: { $ne: true } },
        {
          $set: {
            answered: true,
            answer: { labels, raw: selected, orderNumber },
            answeredAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
      if (res.modifiedCount === 0) return;

      let voterWid = vote?.sender || vote?.author || vote?.from || vote?.voterId || vote?.participant || null;
      if (!voterWid && typeof sent.to === 'string' && sent.to.endsWith('@c.us')) voterWid = sent.to;

      if (voterWid) {
        await PollVote.updateOne(
          { clientId, pollMessageId: sent.messageId, voter: voterWid },
          {
            $setOnInsert: {
              clientId,
              chatId: sent.to,
              pollMessageId: sent.messageId,
              correlationId: corr,
              voter: voterWid,
              option: labels.join(', '),
              orderNumber,
              source: 'vote_update',
              votedAt: new Date()
            }
          },
          { upsert: true }
        );
      }

      global.io?.to(sent.clientId)?.emit('poll_vote', {
        correlationId: corr,
        orderNumber,
        to: sent.to,
        messageId: sent.messageId,
        labels,
        voter: voterWid || null
      });

      console.log('✅ vote_update recorded →', { orderNumber, labels, voter: voterWid || '' });
    } catch (e) {
      console.error('❌ vote_update handler error:', e?.message);
    }
  });

  /* ------------------------------- Disconnected ----------------------------- */
  client.on('disconnected', async (reason) => {
    console.warn(`🔌 Disconnected (${clientId}): ${reason}`);
    readyFlags.set(clientId, false);
    sessionStatus.set(clientId, 'disconnected');

    await ClientModel.updateOne(
      { clientId },
      { $set: { sessionStatus: 'disconnected', lastDisconnectedAt: new Date(), lastDisconnectReason: reason } }
    ).catch(() => null);

    if (reason === 'LOGOUT' || reason === 'NAVIGATION') {
      try { await client.destroy(); } catch {}
      clients.delete(clientId);
      qrCodes.delete(clientId);
      readyFlags.delete(clientId);
      sessionStatus.delete(clientId);
    }
  });

  client.initialize();
  clients.set(clientId, client);
  return client;
}

/* --------------------------------- Utilities ------------------------------- */
function getQRCode(clientId) {
  return qrCodes.get(clientId);
}

function isClientReady(clientId) {
  return readyFlags.get(clientId) === true;
}

/* ---------------------------- Exports (Single) ----------------------------- */
export { getClient, getQRCode, isClientReady, sessionStatus };
