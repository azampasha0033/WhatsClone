const express = require('express');
const agentService = require('../services/agent.service.js'); // Import agent service
const router = express.Router();

// Create an agent
router.post('/', async (req, res) => {
  const { clientId, permissions } = req.body;
  try {
    const agent = await agentService.createAgent(clientId, permissions);
    res.status(201).json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all agents for a client
router.get('/', async (req, res) => {
  const { clientId } = req.query;
  try {
    const agents = await agentService.getAgentsByClient(clientId);
    res.json(agents);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update agent permissions
router.put('/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const updateData = req.body;
  try {
    const agent = await agentService.updateAgent(agentId, updateData);
    res.json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete an agent
router.delete('/:agentId', async (req, res) => {
  const { agentId } = req.params;
  try {
    await agentService.deleteAgent(agentId);
    res.json({ message: 'Agent deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Check agent permissions
router.post('/:agentId/has-permission', async (req, res) => {
  const { agentId } = req.params;
  const { action } = req.body; // action can be "create", "update", "delete"
  try {
    const hasPermission = await agentService.hasPermission(agentId, action);
    res.json({ hasPermission });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
