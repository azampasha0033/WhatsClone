// controllers/chat.controller.js
import { assignChatToAgent, autoAssignChat } from '../services/chat.service.js';

export const assignChatController = async (req, res) => {
  const { chatId } = req.params;
  const { clientId, agentId } = req.body;

  try {
    let chat;

    if (agentId) {
      chat = await assignChatToAgent(clientId, chatId, agentId); // manual
    } else {
      chat = await autoAssignChat(clientId, chatId); // automatic
    }

    res.json({ success: true, chat });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
