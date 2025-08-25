import express from 'express';
import { Label } from '../models/Label.js';
import { clients } from '../clients/getClient.js'; // make sure you export this Map

const router = express.Router();

/* --------------------- CRUD (DB only) --------------------- */

// Create
router.post('/', async (req, res) => {
  try {
    const { clientId, name, color } = req.body;
    if (!clientId || !name) return res.status(400).json({ error: 'clientId and name are required' });
    const label = new Label({ clientId, name, color });
    await label.save();
    res.status(201).json(label);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ALL (admin)
router.get('/', async (_req, res) => {
  try {
    const labels = await Label.find();
    res.json(labels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get labels for a specific client
router.get('/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const labels = await Label.find({ clientId });
    res.json(labels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update (DB record)
router.put('/:id', async (req, res) => {
  try {
    const { name, color } = req.body;
    const updated = await Label.findByIdAndUpdate(req.params.id, { name, color }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Label not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete (DB record)
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Label.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Label not found' });
    res.json({ success: true, message: 'Label deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- WhatsApp helpers ---------------- */
async function resolveWaLabelIds({ client, clientId, labels }) {
  const waLabels = await client.getLabels(); // [{id,name,hexColor}]
  const byName   = new Map(waLabels.map(l => [l.name.toLowerCase(), String(l.id)]));
  const byId     = new Set(waLabels.map(l => String(l.id)));
  const out = [];

  for (const token of labels) {
    const s = String(token).trim();
    if (byId.has(s)) { // already an id
      out.push(s);
      const m = waLabels.find(l => String(l.id) === s);
      if (m) {
        await Label.updateOne(
          { clientId, name: m.name },
          { $set: { waLabelId: String(m.id), color: m.hexColor || '#777777' } },
          { upsert: true }
        );
      }
      continue;
    }
    // treat as name
    const maybeId = byName.get(s.toLowerCase());
    if (maybeId) {
      out.push(maybeId);
      await Label.updateOne(
        { clientId, name: s },
        { $set: { waLabelId: String(maybeId) } },
        { upsert: true }
      );
      continue;
    }
    throw new Error(`Label "${s}" does not exist on WhatsApp for this account`);
  }

  return [...new Set(out)];
}

async function applyLabels({ client, chatId, waLabelIds, mode = 'replace' }) {
  const chat = await client.getChatById(chatId);

  if (mode === 'replace') {
    await chat.changeLabels(waLabelIds);
    return;
  }

  const current = (await client.getChatLabels(chatId)).map(l => String(l.id));
  const currSet = new Set(current);

  if (mode === 'add') {
    for (const id of waLabelIds) currSet.add(String(id));
    await chat.changeLabels([...currSet]);
    return;
  }
  if (mode === 'remove') {
    for (const id of waLabelIds) currSet.delete(String(id));
    await chat.changeLabels([...currSet]);
    return;
  }
  throw new Error(`Unknown mode "${mode}" (use: replace | add | remove)`);
}

/* ---------------- Assign labels to a chat (WA) ---------------- */
/**
 * POST /labels/assign
 * body: { clientId, chatId, labels: string[], mode?: 'replace'|'add'|'remove' }
 * - labels can be WA ids or label names
 */
router.post('/assign', async (req, res) => {
  try {
    const { clientId, chatId, labels, mode = 'replace' } = req.body;
    if (!clientId || !chatId || !Array.isArray(labels) || labels.length === 0) {
      return res.status(400).json({ error: 'clientId, chatId and labels[] are required' });
    }
    const client = clients.get(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found or not connected' });

    const waLabelIds = await resolveWaLabelIds({ client, clientId, labels });
    await applyLabels({ client, chatId, waLabelIds, mode });

    const finalLabels = await client.getChatLabels(chatId);
    res.json({
      success: true,
      chatId,
      labels: finalLabels.map(l => ({ id: String(l.id), name: l.name, color: l.hexColor })),
      mode,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------------- Sync WA → DB ---------------- */
/** GET /labels/client/:clientId/sync-wa */
router.get('/client/:clientId/sync-wa', async (req, res) => {
  try {
    const { clientId } = req.params;
    const client = clients.get(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found or not connected' });

    const wa = await client.getLabels();
    const ops = wa.map(l => ({
      updateOne: {
        filter: { clientId, name: l.name },
        update:  { $set: { waLabelId: String(l.id), color: l.hexColor || '#777777' } },
        upsert:  true,
      }
    }));
    if (ops.length) await Label.bulkWrite(ops);

    const labels = await Label.find({ clientId }).sort({ name: 1 });
    res.json({ count: labels.length, labels });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
