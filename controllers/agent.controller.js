import { createAgent } from '../services/agent.service.js';
import { updateAgent } from '../services/agent.service.js';
import { listAgents } from '../services/agent.service.js';
import { AgentModel } from '../models/agent.js'; // Ensure you import the Agent model
import bcrypt from 'bcryptjs';

// Create agent controller
export const createAgentController = async (req, res) => {
  try {
    const { clientId, ...agentData } = req.body;

    // Ensure `clientId` is passed
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
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

    // Ensure `clientId` is passed
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

// Login agent controller
// Login agent controller
export const loginAgentController = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Ensure email and password are provided
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find the agent by email and return all fields
    const agent = await AgentModel.findOne({ email });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
console.log(agent);
    // Ensure passwordHash is present
    if (!agent.passwordHash) {
      return res.status(400).json({ error: 'Password not set for this agent' });
    }

    // Compare the password with the stored hash
    const isPasswordValid = await bcrypt.compare(password, agent.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // If login is successful, return all agent data (except passwordHash)
    res.status(200).json({
      success: true,
      agent: {
        _id: agent._id,
        clientId: agent.clientId,
        name: agent.name,
        email: agent.email,
        phoneRaw: agent.phoneRaw,
        phoneE164: agent.phoneE164,
        permissions: agent.permissions,
        status: agent.status,
        // Add any other fields you need to return
      }
    });
  } catch (err) {
    console.error('Login Error: ', err); // Log error to check the details
    res.status(500).json({ error: err.message });
  }
};

// List agents controller
export const listAgentsController = async (req, res) => {
  try {
    const { clientId } = req.query;  // Get `clientId` from query parameters
    
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });  // Ensure clientId is present
    }

    // Call the service function to list agents for the given clientId
    const agents = await listAgents(clientId);  // Pass `clientId` to the service
    res.json(agents);  // Return the list of agents
  } catch (err) {
    res.status(500).json({ error: err.message });  // Handle error
  }
};
