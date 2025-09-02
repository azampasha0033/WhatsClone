import { Router } from 'express';
import { createAgentController, updateAgentController } from '../controllers/agent.controller.js';

const router = Router();

// POST /api/agents - Create agent
router.post('/', createAgentController);

// PATCH /api/agents/:id - Update agent
router.patch('/:id', updateAgentController);

export default router;
