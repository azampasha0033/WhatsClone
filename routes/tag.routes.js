import express from "express";
import { tagService } from "../services/tag.service.js";

const router = express.Router();

// Create Tag
router.post("/", async (req, res) => {
  try {
    const { clientId, name } = req.body;
    const tag = await tagService.createTag(clientId, name);
    res.json(tag);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Tags
router.get("/", async (req, res) => {
  const { clientId } = req.query;
  const tags = await tagService.getTags(clientId);
  res.json(tags);
});

// Update Tag
router.put("/:id", async (req, res) => {
  try {
    const tag = await tagService.updateTag(req.body.clientId, req.params.id, req.body);
    res.json(tag);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Tag
router.delete("/:id", async (req, res) => {
  await tagService.deleteTag(req.query.clientId, req.params.id);
  res.json({ message: "Tag deleted" });
});

export default router;
