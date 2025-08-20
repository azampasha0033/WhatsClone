// routes/labels.js
import express from 'express';
import { Label } from '../models/Label.js';
import { jwtAuth } from '../middleware/jwtAuth.js'; // ✅ same as sendMessage route

const router = express.Router();

// apply auth middleware to all label routes
router.use(jwtAuth);

/**
 * Create Label
 */
router.post('/', async (req, res) => {
  try {
    const { clientId, name, color } = req.body;

    // ensure clientId belongs to the logged-in user
    if (req.user.clientId !== clientId) {
      return res.status(403).json({ error: 'Unauthorized clientId' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Label name required' });
    }

    const label = new Label({ clientId, name, color });
    await label.save();
    res.status(201).json(label);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get Labels for the logged-in client
 */
router.get('/', async (req, res) => {
  try {
    const labels = await Label.find({ clientId: req.user.clientId });
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

    const updated = await Label.findOneAndUpdate(
      { _id: req.params.id, clientId: req.user.clientId }, // ✅ only update own labels
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
    const deleted = await Label.findOneAndDelete({
      _id: req.params.id,
      clientId: req.user.clientId, // ✅ only delete own labels
    });

    if (!deleted) return res.status(404).json({ error: 'Label not found' });
    res.json({ success: true, message: 'Label deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
