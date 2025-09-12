

// services/chat.service.js
import { Chat } from '../models/Chat.js';
import { AgentModel } from '../models/agent.js';
import { getClient } from '../clients/getClient.js'; // ✅ import your client getter



// Simple round-robin tracker
let lastAssignedIndex = 0;

/**
 * Auto-assign chat to an available agent (round-robin)
 */
export const autoAssignChat = async (clientId, chatId, chatName = '') => {
  let chat = await Chat.findOne({ clientId, chatId });

  // If already assigned to a valid online agent, return as is
  if (chat?.agentId) {
    const existingAgent = await AgentModel.findOne({ 
      _id: chat.agentId, 
      clientId, 
      status: 'active', 
      online: true 
    });
    if (existingAgent) {
      return chat;
    }
  }

  // Get only available agents
  const agents = await AgentModel.find({ clientId, online: true, status: 'active' }).sort({ createdAt: 1 });
  if (!agents.length) {
    const client = getClient(clientId);
    console.warn(`⚠️ No agents available for client ${clientId}`);

    if (client) {
      await client.sendMessage(
        chatId,
        `⚠️ Sorry, no agents are available right now. Please try again later.`
      );
    }
    return chat || null;
  }

  // Pick agent via round robin
  const agent = agents[lastAssignedIndex % agents.length];
  lastAssignedIndex++;

  // Assign chat to selected agent
  if (!chat) {
    chat = await Chat.create({
      clientId,
      chatId,
      name: chatName,
      agentId: agent._id,
      status: 'assigned',
      updatedAt: new Date()
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
 * Manually assign chat to a specific agent (transfer support)
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

  // Emit assignment event to frontend
  global.io?.to(clientId).emit('chat-assigned', {
    chatId,
    agentId: agent._id,
  });

  // ✅ Notify customer of transfer
  const client = getClient(clientId);  // <-- pull WhatsApp client from your sessions
  if (client) {
    const agentName = agent.name || "our support team";
    await client.sendMessage(
      chatId,
      `🤝 You are now connected with ${agentName}`
    );
    console.log(`📤 Notified ${chatId}: transferred to ${agentName}`);
  } else {
    console.warn(`⚠️ No WA client found for ${clientId} → cannot send transfer message`);
  }

  return chat;
};