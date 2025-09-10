// routes/chat.routes.js
import { Router } from 'express';
import { assignChatController } from '../controllers/chat.controller.js';
import { Chat } from '../models/Chat.js';   // ✅ FIXED: import Chat model
import { safeGetClient } from '../clients/getClient.js'; // ✅ use correct client getter

const router = Router();

// POST /api/chats/:chatId/assign
router.post('/:chatId/assign', assignChatController);

// ✅ End chat manually
router.post('/:chatId/end', async (req, res) => {
  try {
    const { clientId } = req.body; // pass clientId in body
    const { chatId } = req.params;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const chat = await Chat.findOneAndUpdate(
      { clientId, chatId },
      { $set: { status: 'closed' } },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // 🔔 Notify frontend
    global.io?.to(clientId).emit('chat-closed', { chatId });

    // 📤 Notify customer via WhatsApp
    const client = await safeGetClient(clientId);
    if (client) {
      await client.sendMessage(chatId, "✅ This chat has been closed by the agent.");
    }

    res.json({ success: true, chat });
  } catch (err) {
    console.error('❌ End chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
