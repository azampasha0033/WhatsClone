// controllers/agent.controller.js
import { createAgent } from '../services/agent.service.js';
import { updateAgent } from '../services/agent.service.js';

// Create agent controller
export const createAgentController = async (req, res) => {
  try {
    // Ensure clientId is passed in the request body
    const { clientId, ...agentData } = req.body;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }
    
    // Call the createAgent service with the clientId and agentData
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
    
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const updatedAgent = await updateAgent(agentId, clientId, updates); // Call service to update agent
    if (!updatedAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(updatedAgent); // Return the updated agent
  } catch (err) {
    res.status(400).json({ error: err.message });  // Handle error
  }
};
