import { Message } from '../models/Message.js';

export async function saveMessage(clientId, msg) {
  try {
    await Message.findOneAndUpdate(
      { msgId: msg.id._serialized }, // avoid duplicates
      {
        clientId,
        chatId: msg.fromMe ? msg.to : msg.from,
        msgId: msg.id._serialized,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        type: msg.type,
        hasMedia: msg.hasMedia,
        ack: msg.ack,
        timestamp: msg.timestamp,
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error(`❌ Error saving message for ${clientId}:`, err.message);
  }
}
