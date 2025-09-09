// services/chat.service.js
import { Chat } from '../models/Chat.js';
import { AgentModel } from '../models/agent.js';

export const assignChatToAgent = async (clientId, chatId, agentId) => {
  // Check agent exists and belongs to the client
  const agent = await AgentModel.findOne({ _id: agentId, clientId, status: 'active' });
  if (!agent) throw new Error('Agent not found or inactive');

  // Assign chat
  const chat = await Chat.findOneAndUpdate(
    { clientId, chatId },
    { agentId, status: 'assigned' },
    { new: true }
  );

  if (!chat) throw new Error('Chat not found');

  return chat;
};
