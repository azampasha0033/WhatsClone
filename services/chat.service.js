// services/chat.service.js
import { Chat } from '../models/Chat.js';
import { AgentModel } from '../models/agent.js';

// Simple round-robin tracker
let lastAssignedIndex = 0;

/**
 * Auto-assign chat to an available agent (round-robin)
 */
export const autoAssignChat = async (clientId, chatId, chatName = '') => {
  let chat = await Chat.findOne({ clientId, chatId });

  // If already assigned, return
  if (chat && chat.agentId) return chat;

  // Get active agents
  const agents = await AgentModel.find({ clientId, status: 'active' }).sort({ createdAt: 1 });
  if (!agents.length) {
    console.warn(`⚠️ No agents available for client ${clientId}`);
    return chat || null;
  }

  // Pick agent round-robin
  const agent = agents[lastAssignedIndex % agents.length];
  lastAssignedIndex++;

  if (!chat) {
    chat = await Chat.create({
      clientId,
      chatId,
      name: chatName,
      agentId: agent._id,
      status: 'assigned'
    });
  } else {
    chat.agentId = agent._id;
    chat.status = 'assigned';
    chat.updatedAt = new Date();
    await chat.save();
  }

  // Emit assignment event
  global.io?.to(clientId).emit('chat-assigned', {
    chatId,
    agentId: agent._id,
  });

  return chat;
};

/**
 * Manually assign chat to a specific agent
 */
export const assignChatToAgent = async (clientId, chatId, agentId) => {
  const agent = await AgentModel.findOne({ _id: agentId, clientId, status: 'active' });
  if (!agent) throw new Error('Agent not found or inactive');

  let chat = await Chat.findOne({ clientId, chatId });
  if (!chat) {
    chat = await Chat.create({
      clientId,
      chatId,
      agentId: agent._id,
      status: 'assigned'
    });
  } else {
    chat.agentId = agent._id;
    chat.status = 'assigned';
    chat.updatedAt = new Date();
    await chat.save();
  }

  // Emit assignment event
  global.io?.to(clientId).emit('chat-assigned', {
    chatId,
    agentId: agent._id,
  });

  return chat;
};
