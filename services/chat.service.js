import { Chat } from '../models/Chat.js';
import { AgentModel } from '../models/agent.js';

// Automatic assignment: assign to the first available active agent
export const autoAssignChat = async (clientId, chatId) => {
  // Find first active agent
  const agent = await AgentModel.findOne({ clientId, status: 'active' });
  if (!agent) throw new Error('No active agent available');

  // Assign the chat
  const chat = await Chat.findOneAndUpdate(
    { clientId, chatId },
    { agentId: agent._id, status: 'assigned' },
    { new: true }
  );

  if (!chat) throw new Error('Chat not found');

  return chat;
};
