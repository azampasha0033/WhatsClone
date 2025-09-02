import { Router } from 'express';
import {
  createAgent,
  listAgents,
  getAgentById,
  updateAgent,
  deleteAgent
} from '../services/agent.service.js';

const router = Router();

// Middleware: make sure `req.user._id` is set from your auth logic
// Example: req.user = { _id: "ownerId" }

router.post('/', async (req, res) => {
  try {
    const agent = await createAgent(req.user._id, req.body);
    res.status(201).json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const agents = await listAgents(req.user._id);
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const agent = await getAgentById(req.user._id, req.params.id);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const agent = await updateAgent(req.user._id, req.params.id, req.body);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const agent = await deleteAgent(req.user._id, req.params.id);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
