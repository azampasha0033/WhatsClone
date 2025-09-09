// controllers/chat.controller.js
import { assignChatToAgent, autoAssignChat } from '../services/chat.service.js';


export const assignChatController = async (req, res) => {
  const { chatId } = req.params;
  const { clientId, agentId } = req.body;

  try {
    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required for manual assignment' });
    }

    const chat = await assignChatToAgent(clientId, chatId, agentId);
    res.json({ success: true, chat });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

