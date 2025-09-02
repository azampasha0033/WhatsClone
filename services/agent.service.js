import { AgentModel } from '../models/agent.js';
import bcrypt from 'bcryptjs';

// Create a new agent
export const createAgent = async (clientId, data) => {
  const { password, ...rest } = data;

  // Hash the password before saving
  const passwordHash = await bcrypt.hash(String(password), 12);

  // Create the agent with the provided clientId
  return AgentModel.create({
    clientId,  // Use the clientId from the payload
    passwordHash,
    ...rest  // Spread the rest of the agent data (name, email, etc.)
  });
};

// List all agents associated with a specific clientId (owner)
export const listAgents = async (clientId) => {
  return AgentModel.find({ clientId }).sort({ createdAt: -1 });
};

// Get a single agent by ID for a specific clientId (owner)
export const getAgentById = async (clientId, agentId) => {
  return AgentModel.findOne({ _id: agentId, clientId });
};

// Update an agent for a specific clientId (owner)
export const updateAgent = async (agentId, clientId, updates) => {
  if (updates.password) {
    updates.passwordHash = await bcrypt.hash(String(updates.password), 12);
    delete updates.password;  // Remove plain text password
  }

  return AgentModel.findOneAndUpdate(
    { _id: agentId, clientId },  // Use clientId from the payload
    updates,
    { new: true, runValidators: true }
  );
};

// Soft delete an agent by changing its status to 'inactive'
export const deleteAgent = async (clientId, agentId) => {
  return AgentModel.findOneAndUpdate(
    { _id: agentId, clientId },
    { status: 'inactive' },
    { new: true }
  );
};
