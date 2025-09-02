import { createAgent } from '../services/agent.service.js';
import { updateAgent } from '../services/agent.service.js';

// Create agent controller
export const createAgentController = async (req, res) => {
  try {
    const { clientId, ...agentData } = req.body;  // Get clientId and agent data from the request body

    // Validate clientId and email
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }
    if (!agentData.email) {
      return res.status(400).json({ error: 'email is required' });
    }

    // Call the service function to create the agent
    const agent = await createAgent(clientId, agentData); 
    res.status(201).json(agent);  // Return the created agent
  } catch (err) {
    res.status(400).json({ error: err.message });  // Handle error
  }
};

// Update agent controller
export const updateAgentController = async (req, res) => {
  try {
    const { agentId } = req.params;  // Get agentId from the URL parameter
    const { clientId, ...updates } = req.body;  // Get clientId and updates from the body

    // Validate clientId
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    // Call the service to update the agent
    const updatedAgent = await updateAgent(agentId, clientId, updates);
    if (!updatedAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(updatedAgent);  // Return the updated agent
  } catch (err) {
    res.status(400).json({ error: err.message });  // Handle error
  }
};
