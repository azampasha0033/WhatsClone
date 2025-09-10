// controllers/chat.controller.js
import { autoAssignChat, assignChatToAgent } from '../services/chat.service.js';

/**
 * Assign chat (manual if agentId given, else auto-assign)
 */
export const assignChatController = async (req, res) => {
  const { chatId } = req.params;
  const { clientId, agentId } = req.body;

  try {
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const chat = agentId
      ? await assignChatToAgent(clientId, chatId, agentId) // manual
      : await autoAssignChat(clientId, chatId);            // auto

    res.json({ success: true, chat });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
