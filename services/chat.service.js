// services/chat.service.js
import { Chat } from '../models/Chat.js';
import { AgentModel } from '../models/agent.js';

/**
 * Manual assignment: assign a chat to a specific agent
 */
export const assignChatToAgent = async (clientId, chatId, agentId) => {
  const agent = await AgentModel.findOne({ _id: agentId, clientId, status: 'active' });
  if (!agent) throw new Error('Agent not found or not active for this client');

  const chat = await Chat.findOneAndUpdate(
    { clientId, chatId },
    { agentId: agent._id, status: 'assigned' },
    { new: true }
  );

  if (!chat) throw new Error('Chat not found');

  return chat;
};

/**
 * Automatic assignment: pick the first available active agent
 */
export const autoAssignChat = async (clientId, chatId) => {
  const agent = await AgentModel.findOne({ clientId, status: 'active' }).sort({ createdAt: 1 });
  if (!agent) throw new Error('No active agent available');

  const chat = await Chat.findOneAndUpdate(
    { clientId, chatId },
    { agentId: agent._id, status: 'assigned' },
    { new: true }
  );

  if (!chat) throw new Error('Chat not found');

  return chat;
};
