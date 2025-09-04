import { Router } from 'express';
import { createAgentController, updateAgentController, loginAgentController, listAgentsController } from '../controllers/agent.controller.js'; 
import { deleteAgent } from '../services/agent.service.js'; 

const router = Router();

// POST /api/agents - Create agent
router.post('/', createAgentController);

// POST /api/agents/login - Login agent
router.post('/login', loginAgentController);

// GET /api/agents - List agents
router.get('/', listAgentsController);

// PATCH /api/agents/:id - Update agent
router.patch('/:id', updateAgentController);  // <-- Use the controller function


// DELETE /api/agents/:id - Delete agent (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { clientId } = req.query;  // Get `clientId` from query parameters
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const agent = await deleteAgent(clientId, req.params.id);  // Call ddeleteAgent service function
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or already inactive' });
    }

    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
