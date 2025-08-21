// routes/labels.js
import express from 'express';
import { Label } from '../models/Label.js';

const router = express.Router();

/**
 * Create Label
 */
router.post('/', async (req, res) => {
  try {
    const { clientId, name, color } = req.body;
    if (!clientId || !name) {
      return res.status(400).json({ error: 'clientId and name are required' });
    }

    const label = new Label({ clientId, name, color });
    await label.save();
    res.status(201).json(label);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * Get Labels for a Client
 */
router.get('/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const labels = await Label.find({ clientId });
    res.json(labels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update Label
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, color } = req.body;
    const updated = await Label.findByIdAndUpdate(
      req.params.id,
      { name, color },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Label not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete Label
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Label.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Label not found' });
    res.json({ success: true, message: 'Label deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
