import bcrypt from 'bcryptjs';
import { AgentModel } from '../models/agent.js';

export const createAgent = async (data) => {
  const { clientId, password, ...rest } = data;
  
  // Hash the password before saving
  const passwordHash = await bcrypt.hash(String(password), 12);

  // Create the agent with the provided clientId (not from the logged-in user)
  return AgentModel.create({
    clientId,  // Use the clientId from the payload
    passwordHash,
    ...rest
  });
};


export const listAgents = async (ownerId) => {
  return AgentModel.find({ clientId: ownerId }).sort({ createdAt: -1 });
};

export const getAgentById = async (ownerId, agentId) => {
  return AgentModel.findOne({ _id: agentId, clientId: ownerId });
};

export const updateAgent = async (agentId, clientId, updates) => {
  if (updates.password) {
    updates.passwordHash = await bcrypt.hash(String(updates.password), 12);
    delete updates.password;  // Remove plain text password
  }
  
  // Update the agent and ensure it matches both `agentId` and `clientId`
  return AgentModel.findOneAndUpdate(
    { _id: agentId, clientId },  // Use clientId from the payload
    updates,
    { new: true, runValidators: true }
  );
};

export const deleteAgent = async (ownerId, agentId) => {
  return AgentModel.findOneAndUpdate(
    { _id: agentId, clientId: ownerId },
    { status: 'inactive' },
    { new: true }
  );
};
