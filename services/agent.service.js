import bcrypt from 'bcryptjs';
import { AgentModel } from '../models/agent.js';

export const createAgent = async (ownerId, data) => {
  const { password, ...rest } = data;
  const passwordHash = await bcrypt.hash(String(password), 12);

  return AgentModel.create({
    clientId: ownerId,
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

export const updateAgent = async (ownerId, agentId, updates) => {
  if (updates.password) {
    updates.passwordHash = await bcrypt.hash(String(updates.password), 12);
    delete updates.password;
  }
  return AgentModel.findOneAndUpdate(
    { _id: agentId, clientId: ownerId },
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
