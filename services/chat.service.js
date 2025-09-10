import { Chat } from '../models/Chat.js';
import { AgentModel } from '../models/agent.js';

// Simple round-robin tracker
let lastAssignedIndex = 0;

export const autoAssignChat = async (clientId, chatId, chatName = '') => {
  // Check if chat exists
  let chat = await Chat.findOne({ clientId, chatId });

  // If already assigned, return it
  if (chat && chat.agentId) return chat;

  // Get all active agents for this client
  const agents = await AgentModel.find({ clientId, status: 'active' }).sort({ createdAt: 1 });
  if (!agents.length) {
    console.warn(`⚠️ No agents available for client ${clientId}`);
    return chat || null;
  }

  // Round-robin pick
  const agent = agents[lastAssignedIndex % agents.length];
  lastAssignedIndex++;

  if (!chat) {
    // create new chat & assign
    chat = await Chat.create({
      clientId,
      chatId,
      name: chatName,
      agentId: agent._id,
      status: 'assigned'
    });
  } else {
    // update existing chat
    chat.agentId = agent._id;
    chat.status = 'assigned';
    chat.updatedAt = new Date();
    await chat.save();
  }

  // Notify frontend in real time
  global.io?.to(clientId).emit('chat-assigned', {
    chatId,
    agentId: agent._id,
  });

  return chat;
};
