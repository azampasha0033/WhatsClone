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

/* helper: short msg id */
function getShortMsgId(serialized) {
  if (!serialized) return null;
  const parts = String(serialized).split('_');
  return parts.length ? parts[parts.length - 1] : serialized;
}

router.post('/', requireActivePlanForClient, async (req, res) => {
  const {
    clientId,
    to,
    type,
    message,
    question,
    options,
    allowMultipleAnswers = false,
    introText = '',
    attachment,
    mimetype = 'application/octet-stream',
    filename = 'file',
    correlationId
  } = req.body;

  const apiKey = req.headers['x-api-key'] || req.headers['X-API-KEY'];
  if (!clientId || !to || !apiKey) {
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
      return res.status(403).json({ error: 'Invalid API Key or clientId' });
    }

    const client = getClient(cleanClientId);

    // ✅ normalize chatId (strip +, spaces, etc.)
    const rawTo = String(to).trim();
    const chatId = rawTo.replace(/\D/g, '') + '@c.us';

    const isPoll = (type === 'poll') || (!!question && Array.isArray(options) && options.length > 0);
    const intendedCount = isPoll ? (introText ? 2 : 1) : 1;

    // Quota
    let subInfo;
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

    // If client not ready → queue
    if (!client || !isClientReady(cleanClientId)) {
      const payload = isPoll
        ? { question, options, allowMultipleAnswers, introText, correlationId: correlationId || null }
        : { message, attachment, mimetype, filename, correlationId: correlationId || null };

      await MessageQueue.create({
        clientId: cleanClientId,
        to,
        message: JSON.stringify(payload),
        type: isPoll ? 'poll' : (attachment ? 'media' : 'message'),
        status: 'pending'
      }).catch((e) => console.warn('⚠️ queue warn:', e?.message));

      return res.status(202).json({
        success: true,
        queued: true,
        message: `Client not ready. ${isPoll ? 'poll' : (attachment ? 'media' : 'message')} queued.`
      });
    }

    /* -------------------------- ACTUAL SEND -------------------------- */
    let sent;
    let consumed = 0;

    try {
      if (isPoll) {
        // optional intro
        if (introText && String(introText).trim()) {
          const introMsg = await client.sendMessage(chatId, String(introText));
          if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
          consumed++;
        }

        const qRaw = String(question || 'Do you confirm your order?').trim();
        const ops = (Array.isArray(options) && options.length ? options : ['✅ Yes', '❌ No']).map(o => String(o).trim());
        const poll = new Poll(qRaw, ops, { allowMultipleAnswers: !!allowMultipleAnswers, allowResubmission: false });

        sent = await client.sendMessage(chatId, poll);
        if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
        consumed++;
      }
     else if (attachment) {
  let media;
  try {
    if (String(attachment).startsWith('http')) {
      media = await MessageMedia.fromUrl(attachment);
    } else {
      const base64 = String(attachment).includes(',')
        ? String(attachment).split(',')[1]
        : String(attachment);
      media = new MessageMedia(mimetype, base64, filename);
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid attachment', details: e.message });
  }

  sent = await client.sendMessage(chatId, media, { caption: message || '' });

  if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
  consumed++;
}

      else {
        sent = await client.sendMessage(chatId, message || '');
        if (subInfo?.sub?._id) await incrementUsage(subInfo.sub._id, 1);
        consumed++;
      }

      await ClientModel.updateOne({ _id: clientRecord._id }, { $inc: { messagesCount: consumed } }).catch(() => {});
      return res.status(200).json({
        success: true,
        messageId: sent?.id?._serialized || null,
        consumed,
        remaining: (subInfo.remaining - consumed)
      });
    } catch (sendErr) {
      console.error('❌ sendMessage failed:', sendErr);
      return res.status(500).json({ error: 'Failed to send via WhatsApp: ' + sendErr.message });
    }
  } catch (err) {
    console.error('⛔ send-message fatal error:', err);
    return res.status(500).json({ error: 'Internal error: ' + err.message });
  }
});

export default router;
