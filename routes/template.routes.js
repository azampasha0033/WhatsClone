import express from "express";
import { templateService } from "../services/template.service.js";

const router = express.Router();

// Create Template
router.post("/", async (req, res) => {
  try {
    const { clientId, name, body } = req.body;
    const template = await templateService.createTemplate(clientId, name, body);
    res.json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Templates
router.get("/", async (req, res) => {
  const { clientId } = req.query;
  const templates = await templateService.getTemplates(clientId);
  res.json(templates);
});

// Update Template
router.put("/:id", async (req, res) => {
  try {
    const template = await templateService.updateTemplate(req.body.clientId, req.params.id, req.body);
    res.json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Template
router.delete("/:id", async (req, res) => {
  await templateService.deleteTemplate(req.query.clientId, req.params.id);
  res.json({ message: "Template deleted" });
});

// Assign Tag
router.post("/:templateId/tags/:tagId", async (req, res) => {
  try {
    const template = await templateService.assignTag(req.body.clientId, req.params.templateId, req.params.tagId);
    res.json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove Tag
router.delete("/:templateId/tags/:tagId", async (req, res) => {
  const template = await templateService.removeTag(req.body.clientId, req.params.templateId, req.params.tagId);
  res.json(template);
});

export default router;
