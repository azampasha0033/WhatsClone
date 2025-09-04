import { Router } from 'express';
import { createAgentController, updateAgentController, loginAgentController, listAgentsController } from '../controllers/agent.controller.js';  // <-- Import controller functions

const router = Router();

// POST /api/agents - Create agent
router.post('/', createAgentController);

// POST /api/agents/login - Login agent
router.post('/login', loginAgentController);

// GET /api/agents - List agents
router.get('/', listAgentsController);  // <-- List agents using controller

// GET /api/agents/:id - Get agent by ID
router.get('/:id', async (req, res) => {
  try {
    const { clientId } = req.query;  // Get `clientId` from query parameters
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const agent = await getAgentById(clientId, req.params.id);  // Pass `clientId` and `agentId` to the service
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/agents/:id - Update agent
// PATCH /api/agents/:id - Update agent
router.patch('/:id', async (req, res) => {
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
});


// DELETE /api/agents/:id - Delete agent (soft delete)

router.delete('/:id', async (req, res) => {
  try {
    const { clientId } = req.query;  // Get `clientId` from query parameters
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    // Call the service to delete the agent (soft delete by updating status)
    const agent = await deleteAgent(clientId, req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found or already inactive' });

    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
