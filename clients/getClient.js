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

const clients = new Map();
const qrCodes = new Map();
const readyFlags = new Map();


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
export function getClient(clientId) {
  if (clients.has(clientId)) return clients.get(clientId);

  console.log(`🚀 Initializing WhatsApp client: ${clientId}`);

  const client = new Client({
   authStrategy: new LocalAuth({
  clientId,
dataPath: process.env.SESSIONS_DIR || '/var/data/wa-sessions'
}),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ],
    },
  });

  /* --------------------------------- QR Code -------------------------------- */
  let qrLogged = false;
  client.on('qr', async (qr) => {
    try {
      // ❌ REMOVE early return; it suppresses refresh/late joiners:
      // if (readyFlags.get(clientId)) return;

      if (!qrLogged) {
        console.log(`📸 QR received for ${clientId}`);
        qrLogged = true;
      } else {
        console.log(`🔄 QR code refreshed for ${clientId}`);
      }

      // 1) Convert & store latest QR
      const qrData = await qrcode.toDataURL(qr);
      qrCodes.set(clientId, qrData);

      // 2) Mark not-ready AFTER storing (so status + sockets can read it)
      readyFlags.set(clientId, false);

      // 3) Emit to any listeners in the room
      global.io?.to(clientId).emit('qr', { qr: qrData });

      // 4) Persist status
      await ClientModel.updateOne(
        { clientId },
        { $set: { sessionStatus: 'pending' } }
      ).catch((e) => console.warn('⚠️ ClientModel pending warn:', e?.message));
      console.log(`🕓 sessionStatus → 'pending' for ${clientId}`);
    } catch (e) {
      console.warn('⚠️ QR handler error:', e?.message);
    }
  });

  client.on('authenticated', () => {
    console.log(`🔐 Authenticated: ${clientId}`);
  });

  /* ---------------------------------- Ready --------------------------------- */
  client.on('ready', async () => {
    console.log(`✅ Client ready: ${clientId}`);
    qrCodes.set(clientId, null);
    readyFlags.set(clientId, true);
    global.io?.to(clientId).emit('ready', { message: 'connected' });

    // page console piping (best-effort)
    try {
      const page = client.pupPage;
      if (page && !page.__consoleHooked) {
        page.on('console', (m) => console.log('📄[WA] LOG', m.text()));
        page.on('error', (e) => console.warn('📄[WA] PAGE ERROR', e?.message || e));
        page.on('pageerror', (e) => console.warn('📄[WA] PAGEEXCEPTION', e?.message || e));
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

        const isPoll = type === 'poll';
        const willSendIntro = isPoll && payload?.introText && String(payload.introText).trim().length > 0;
        const requiredSends = isPoll ? (willSendIntro ? 2 : 1) : 1;

        let subInfo;
        try {
          subInfo = await assertCanSendMessage(clientId);
          if (subInfo.remaining < requiredSends) {
            const msg = `Plan limit reached: need ${requiredSends}, have ${subInfo.remaining}.`;
            console.warn(`⛔ quota: ${msg}`);
            await MessageQueue.updateOne({ _id }, { $set: { status: 'failed', error: msg } });
            continue;
          }
        } catch (qe) {
          const msg = `No active subscription: ${qe.message}`;
          console.warn(`⛔ quota: ${msg}`);
          await MessageQueue.updateOne({ _id }, { $set: { status: 'failed', error: msg } });
          continue;
        }

        let sent;
        let consumed = 0;

        if (isPoll) {
          if (willSendIntro) {
            const introMsg = await client.sendMessage(chatId, String(payload.introText));
            await SentMessage.create({
              clientId, to: chatId, type: 'message',
              messageId: introMsg?.id?._serialized || null,
              messageIdShort: getShortMsgId(introMsg?.id?._serialized || null),
              payload: { message: String(payload.introText), correlationId: payload?.correlationId || null },
              correlationId: payload?.correlationId || null
            }).catch(() => {});
            if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
            consumed += 1;
          }

          const qRaw = (payload?.question || '').trim();
          const ops = Array.isArray(payload?.options) ? payload.options.map(o => String(o).trim()) : [];
          if (!qRaw || ops.length === 0) {
            const msg = `Invalid poll payload for ${to}`;
            console.error(`❌ ${msg}`, payload);
            await MessageQueue.updateOne({ _id }, { $set: { status: 'failed', error: msg } });
            continue;
          }

          const corr = payload?.correlationId || null;
          const qWithId = corr ? `${qRaw} (ID:${corr})` : qRaw;

          const poll = new Poll(qWithId, ops, {
            allowMultipleAnswers: payload?.allowMultipleAnswers === true,
            allowResubmission: false
          });

          sent = await client.sendMessage(chatId, poll);
          const mid = sent?.id?._serialized || null;

          await SentMessage.create({
            clientId, to: chatId, type: 'poll',
            messageId: mid, messageIdShort: getShortMsgId(mid),
            payload: { question: qWithId, options: ops, allowMultipleAnswers: payload?.allowMultipleAnswers === true, correlationId: corr },
            correlationId: corr, answered: false
          }).catch(() => {});
          if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
          consumed += 1;

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

          await SentMessage.create({
            clientId, to: chatId, type: 'media',
            messageId: sent?.id?._serialized || null,
            messageIdShort: getShortMsgId(sent?.id?._serialized || null),
            payload, correlationId: payload?.correlationId || null
          }).catch(() => {});
          if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
          consumed += 1;

        } else {
          const text = payload?.message ?? message;
          sent = await client.sendMessage(chatId, text);

          await SentMessage.create({
            clientId, to: chatId, type: 'message',
            messageId: sent?.id?._serialized || null,
            messageIdShort: getShortMsgId(sent?.id?._serialized || null),
            payload, correlationId: payload?.correlationId || null
          }).catch(() => {});
          if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
          consumed += 1;
        }

        await MessageQueue.updateOne({ _id }, { $set: { status: 'sent', sentAt: new Date(), consumed } }).catch(() => {});
        await ClientModel.updateOne({ clientId }, { $inc: { messagesCount: consumed } }).catch(() => {});
        console.log(`✅ queued item sent type=${type} to=${to} (consumed ${consumed})`);
      } catch (err) {
        console.error(`⛔ queued send failed to ${to}:`, err.message);
        await MessageQueue.updateOne({ _id }, { $set: { status: 'failed', error: err.message } }).catch(() => {});
      }
    }
  });

  /* --------------------------- Poll vote (LOCK on first) --------------------------- */
  client.on('vote_update', async (vote) => {
    try {
      const parentIdRaw = extractParentMessageIdFromVote(vote);
      if (!parentIdRaw) return;

      const parentShort = getShortMsgId(parentIdRaw);

      let sent = await SentMessage.findOne({ type: 'poll', messageId: parentIdRaw });
      if (!sent) sent = await SentMessage.findOne({ type: 'poll', messageId: { $regex: `${parentShort}$` } });
      if (!sent) sent = await SentMessage.findOne({ type: 'poll', messageIdShort: parentShort });
      if (!sent) return;

      if (sent.answered === true) return;

      const selected =
        vote?.selectedOptions || vote?.vote?.selectedOptions || vote?.choices || vote?.options || [];
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

      const isDirectChat = typeof sent.to === 'string' && sent.to.endsWith('@c.us');
      let voterWid =
        vote?.sender || vote?.author || vote?.from || vote?.voterId || vote?.participant || null;
      if (!voterWid && isDirectChat) voterWid = sent.to;

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

      console.log('✅ vote_update recorded (locked)');
    } catch (e) {
      console.error('❌ vote_update handler error:', e?.message);
    }
  });

  /* ------------------------------- Disconnected ----------------------------- */
  client.on('disconnected', async (reason) => {
    console.warn(`🔌 Disconnected (${clientId}): ${reason}`);
    readyFlags.set(clientId, false);
    qrCodes.delete(clientId); // ✅ ensure fresh QR next init if needed

    await ClientModel.updateOne(
      { clientId },
      { $set: { sessionStatus: 'disconnected', lastDisconnectedAt: new Date(), lastDisconnectReason: reason } }
    ).catch(() => null);

    if (String(reason).toUpperCase() === 'LOGOUT') {
      try { await client.destroy(); } catch {}
      clients.delete(clientId);
      readyFlags.delete(clientId);
      console.log(`🧹 Session cleared for ${clientId} after LOGOUT`);
      return;
    }

    setTimeout(async () => {
      try {
        console.log(`♻️ Re-initializing client for ${clientId} after '${reason}'`);
        await client.initialize(); // LocalAuth will silently restore
      } catch (e) {
        console.warn(`⚠️ Re-init failed for ${clientId}: ${e?.message}`);
        try { await client.destroy().catch(() => {}); } catch {}
        clients.delete(clientId);
        const rebuilt = getClient(clientId);
        console.log(`🧱 Rebuilt client object for ${clientId}:`, !!rebuilt);
      }
    }, 1500);
  });

  client.initialize();
  clients.set(clientId, client);
  return client;
}

/* --------------------------------- Utilities ------------------------------- */
export function getQRCode(clientId) {
  return qrCodes.get(clientId) || null;
}
export function isClientReady(clientId) {
  return readyFlags.get(clientId) === true;
}
