// controllers/chat.controller.js
import { assignChatToAgent, autoAssignChat } from '../services/chat.service.js';

export const assignChatController = async (req, res) => {
  const { chatId } = req.params;
  const { clientId, agentId } = req.body;

  try {
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const chat = agentId
      ? await assignChatToAgent(clientId, chatId, agentId)          // manual
      : await autoAssignChat(clientId, chatId);                      // automatic

    res.json({ success: true, chat });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
