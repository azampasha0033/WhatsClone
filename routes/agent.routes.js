import { Router } from 'express';
import {
  createAgent,
  listAgents,
  getAgentById,
  updateAgent,
  deleteAgent
} from '../services/agent.service.js';

const router = Router();

// POST /api/agents - Create agent
router.post('/', async (req, res) => {
  try {
    const { clientId, ...agentData } = req.body;  // Get `clientId` from the payload
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });
    
    // Pass clientId and other agent data to the service
    const agent = await createAgent(clientId, agentData); 
    res.status(201).json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/agents - List agents
router.get('/', async (req, res) => {
  try {
    const { clientId } = req.query;  // Get `clientId` from query params
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });
    
    const agents = await listAgents(clientId);  // Pass clientId to the service
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id - Get agent by ID
router.get('/:id', async (req, res) => {
  try {
    const { clientId } = req.query;  // Get `clientId` from query params
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const agent = await getAgentById(clientId, req.params.id);  // Pass clientId and agentId to the service
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/agents/:id - Update agent
router.patch('/:id', async (req, res) => {
  try {
    const { clientId, ...updates } = req.body;  // Get `clientId` and updates from the payload
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });
    
    const agent = await updateAgent(clientId, req.params.id, updates);  // Pass clientId, agentId, and updates to the service
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/agents/:id - Delete agent (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { clientId } = req.query;  // Get `clientId` from query params
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const agent = await deleteAgent(clientId, req.params.id);  // Pass clientId and agentId to the service
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
