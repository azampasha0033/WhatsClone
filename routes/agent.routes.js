import { Router } from 'express';
import { createAgentController, updateAgentController,loginAgentController } from '../controllers/agent.controller.js';

const router = Router();

// POST /api/agents - Create agent
router.post('/', createAgentController);


// POST /api/agents/login - Login agent
router.post('/login', loginAgentController);


// GET /api/agents - List agents
router.get('/', async (req, res) => {
  try {
    const { clientId } = req.query;  // Get `clientId` from query parameters
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
    const { clientId } = req.query;  // Get `clientId` from query parameters
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const agent = await getAgentById(clientId, req.params.id);  // Pass clientId and agentId to the service
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/agents/:id - Update agent
router.patch('/:id', updateAgentController);

// DELETE /api/agents/:id - Delete agent (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { clientId } = req.query;  // Get `clientId` from query parameters
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const agent = await deleteAgent(clientId, req.params.id);  // Pass clientId and agentId to the service
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/', listAgentsController);  // Use the controller to list agents



export default router;
