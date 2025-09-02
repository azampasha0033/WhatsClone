// controllers/agent.controller.js
import { createAgent } from '../services/agent.service.js';
import { updateAgent } from '../services/agent.service.js';

export const createAgentController = async (req, res) => {
  try {
    const agentData = req.body; // Get agent data from the request body
    const agent = await createAgent(agentData); // Call the service function to create agent
    res.status(201).json(agent);  // Return the created agent
  } catch (err) {
    res.status(400).json({ error: err.message });  // Handle error
  }
};

export const updateAgentController = async (req, res) => {
  try {
    const { agentId } = req.params;  // Get agentId from the URL parameter
    const clientId = req.body.clientId;  // Get clientId from request body
    const updates = req.body; // Get updates for the agent from the request body

    const updatedAgent = await updateAgent(agentId, clientId, updates); // Call service to update agent
    if (!updatedAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(updatedAgent); // Return the updated agent
  } catch (err) {
    res.status(400).json({ error: err.message });  // Handle error
  }
};
