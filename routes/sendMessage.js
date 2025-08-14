// routes/sendMessage.js
import express from 'express';
import { getClient, isClientReady } from '../clients/getClient.js';
import { ClientModel } from '../db/clients.js';
import { MessageQueue } from '../db/messageQueue.js';
import { SentMessage } from '../models/SentMessage.js';
import pkg from 'whatsapp-web.js';
import { assertCanSendMessage, incrementUsage } from '../services/quota.js';

import { requireActivePlanForClient } from '../middleware/requireActivePlanForClient.js';
import { Subscription } from '../models/Subscription.js';


const { Poll, MessageMedia } = pkg;
const router = express.Router();

/* helper: turn serialized WA id into short id (suffix) */
function getShortMsgId(serialized) {
  if (!serialized) return null;
  const parts = String(serialized).split('_');
  return parts.length ? parts[parts.length - 1] : serialized;
}

router.post('/', requireActivePlanForClient, async (req, res) => {
  const {
    clientId,
    to,
    type,                    // "message" | "poll" (optional; inferred)
    message,
    question,
    options,
    allowMultipleAnswers = false,
    introText = '',          // optional text to send before a poll
    attachment,              // base64 or URL
    mimetype = 'application/octet-stream',
    filename = 'file',
    correlationId
  } = req.body;

  const apiKey = req.headers['x-api-key'] || req.headers['X-API-KEY'];
  if (!clientId || !to || !apiKey) {
    console.log('⛔ send-message: missing fields', { clientId: !!clientId, to: !!to, hasApiKey: !!apiKey });
    return res.status(400).json({ error: 'Missing required fields: clientId, to, x-api-key' });
  }

  const cleanClientId = String(clientId).trim();
  const cleanApiKey   = String(apiKey).trim();

  try {
    // Auth check
    const clientRecord = await ClientModel.findOne({
      clientId: { $regex: `^${cleanClientId}$`, $options: 'i' },
      apiKey: cleanApiKey
    });
    if (!clientRecord) {
      console.log('⛔ send-message: invalid apiKey/clientId');
      return res.status(403).json({ error: 'Invalid API Key or clientId' });
    }

    const client = getClient(cleanClientId);
    const chatId = to.replace(/\D/g, '') + '@c.us';

    const isPoll = (type === 'poll') || (!!question && Array.isArray(options) && options.length > 0);
    // How many WhatsApp sends will this request produce if sent now?
    // - plain message: 1
    // - media: 1
    // - poll: 1 (+1 if introText is present)
    const intendedCount = isPoll ? (introText ? 2 : 1) : 1;

    // Check subscription/quota FIRST (don’t consume here)
    // We check on queue too (for better UX), and enforce again when the queue actually sends.
    let subInfo = null;
    try {
      subInfo = await assertCanSendMessage(cleanClientId);
      if (subInfo.remaining < intendedCount) {
        return res.status(402).json({
          ok: false,
          error: `Plan limit reached. Need ${intendedCount} sends, but only ${subInfo.remaining} remaining.`
        });
      }
    } catch (e) {
      return res.status(402).json({ ok: false, error: e.message });
    }

    // Not ready → queue (don’t increment usage now; increment when actually sent)
    if (!client || !isClientReady(cleanClientId)) {
      console.log(`🟠 send-message: client not ready, queuing (type=${isPoll ? 'poll' : (attachment ? 'media' : 'message')})`);
      const payload = isPoll
        ? { question, options, allowMultipleAnswers, introText, correlationId: correlationId || null }
        : { message, attachment, mimetype, filename, correlationId: correlationId || null };

      await MessageQueue.create({
        clientId: cleanClientId,
        to,
        message: JSON.stringify(payload),
        type: isPoll ? 'poll' : (attachment ? 'media' : 'message'),
        status: 'pending'
      }).catch((e) => console.warn('⚠️ MessageQueue.create warn:', e?.message));

      return res.status(202).json({
        success: true,
        queued: true,
        message: `Client not ready. ${isPoll ? 'poll' : (attachment ? 'media' : 'message')} queued.`
      });
    }

    // Client is ready → Send now (consume quota immediately after each successful send)
    let sent;
    let consumed = 0;

    if (isPoll) {
      // 1) optional intro text BEFORE poll
      if (introText && String(introText).trim().length > 0) {
        const introMsg = await client.sendMessage(chatId, String(introText));
        console.log('✉️ send-message: intro text sent →', introMsg?.id?._serialized);

        await SentMessage.create({
          clientId: cleanClientId,
          to: chatId,
          type: 'message',
          messageId: introMsg?.id?._serialized || null,
          messageIdShort: getShortMsgId(introMsg?.id?._serialized || null),
          payload: { message: String(introText), correlationId: correlationId || null },
          correlationId: correlationId || null
        }).catch((e) => console.warn('⚠️ SentMessage.create warn (intro):', e?.message));

        // consume 1 for intro
        if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
        consumed += 1;
      }

      // 2) the poll
      const qRaw = String(question || 'Do you confirm your order?').trim();
      const ops = (Array.isArray(options) && options.length ? options : ['✅ Yes', '❌ No'])
        .map(o => String(o).trim());
      const corr = correlationId || null;
      const qWithId = corr ? `${qRaw} (ID:${corr})` : qRaw;

      console.log('🧱 send-message: creating poll with', { q: qWithId, options: ops, allowMultipleAnswers });

      const poll = new Poll(qWithId, ops, {
        allowMultipleAnswers: !!allowMultipleAnswers,
        allowResubmission: false
      });

      sent = await client.sendMessage(chatId, poll);
      console.log('✉️ send-message: poll sent →', sent?.id?._serialized);

      await SentMessage.create({
        clientId: cleanClientId,
        to: chatId,
        type: 'poll',
        messageId: sent?.id?._serialized || null,
        messageIdShort: getShortMsgId(sent?.id?._serialized || null),
        payload: { question: qWithId, options: ops, allowMultipleAnswers: !!allowMultipleAnswers, correlationId: corr },
        correlationId: corr
      }).catch((e) => console.warn('⚠️ SentMessage.create warn (poll):', e?.message));
      console.log('💾 send-message: SentMessage stored with correlationId =', corr);

      // consume 1 for poll
      if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
      consumed += 1;

      await ClientModel.updateOne({ _id: clientRecord._id }, { $inc: { messagesCount: 1 * (introText ? 2 : 1) } })
        .catch((e) => console.warn('⚠️ ClientModel messagesCount++ warn:', e?.message));

      return res.status(200).json({
        success: true,
        messageId: sent?.id?._serialized || null,
        consumed,
        remaining: (subInfo.remaining - consumed)
      });
    }

    // Non-poll
    if (attachment) {
      let media;
      if (String(attachment).startsWith('http')) {
        media = await MessageMedia.fromUrl(attachment);
      } else {
        const base64 = String(attachment).includes(',') ? String(attachment).split(',')[1] : String(attachment);
        media = new MessageMedia(mimetype, base64, filename);
      }
      sent = await client.sendMessage(chatId, media, { caption: message || '' });
      console.log('✉️ send-message: media sent →', sent?.id?._serialized);

      await SentMessage.create({
        clientId: cleanClientId,
        to: chatId,
        type: 'media',
        messageId: sent?.id?._serialized || null,
        messageIdShort: getShortMsgId(sent?.id?._serialized || null),
        payload: { message: message || '', attachment, mimetype, filename, correlationId: correlationId || null },
        correlationId: correlationId || null
      }).catch((e) => console.warn('⚠️ SentMessage.create warn:', e?.message));

      if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
      consumed += 1;
    } else {
      sent = await client.sendMessage(chatId, message);
      console.log('✉️ send-message: text sent →', sent?.id?._serialized);

      await SentMessage.create({
        clientId: cleanClientId,
        to: chatId,
        type: 'message',
        messageId: sent?.id?._serialized || null,
        messageIdShort: getShortMsgId(sent?.id?._serialized || null),
        payload: { message, correlationId: correlationId || null },
        correlationId: correlationId || null
      }).catch((e) => console.warn('⚠️ SentMessage.create warn:', e?.message));

      if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
      consumed += 1;
    }

    await ClientModel.updateOne({ _id: clientRecord._id }, { $inc: { messagesCount: 1 } })
      .catch((e) => console.warn('⚠️ ClientModel messagesCount++ warn:', e?.message));

    return res.status(200).json({
      success: true,
      messageId: sent?.id?._serialized || null,
      consumed,
      remaining: (subInfo.remaining - consumed)
    });
  } catch (err) {
    console.error('⛔ send-message fatal error:', err);
    return res.status(500).json({ error: 'Failed to send message: ' + err.message });
  }
});

export default router;
