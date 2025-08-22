import { Chat } from '../models/Chat.js';

export async function saveChat(clientId, chat) {
  try {
    await Chat.findOneAndUpdate(
      { clientId, chatId: chat.id._serialized },
      {
        clientId,
        chatId: chat.id._serialized,
        name: chat.name || chat.id.user || 'Unknown',
        isGroup: chat.isGroup,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error(`❌ Error saving chat for ${clientId}:`, err.message);
  }
}
