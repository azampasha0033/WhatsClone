const { Agent } = require('../models/agent.js');

const agentService = {
  // Create an agent
  async createAgent(clientId, permissions) {
    const agent = new Agent({ clientId, permissions });
    return await agent.save();
  },

  // Get agents by client
  async getAgentsByClient(clientId) {
    return await Agent.find({ clientId });
  },

  // Update an agent's permissions and status
  async updateAgent(agentId, updateData) {
    return await Agent.findByIdAndUpdate(agentId, updateData, { new: true });
  },

  // Delete an agent
  async deleteAgent(agentId) {
    return await Agent.findByIdAndDelete(agentId);
  },

  // Check if an agent has permission for a specific action (create, update, delete)
  async hasPermission(agentId, action) {
    const agent = await Agent.findById(agentId);
    if (!agent) return false;

    return agent.permissions[action] || false;
  },
};

module.exports = agentService;
