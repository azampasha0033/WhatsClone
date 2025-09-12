import express from "express";
import { WebChat } from "./webchat.model.js";

const router = express.Router();

// List all web chats for a client
router.get("/:clientId", async (req, res) => {
  const chats = await WebChat.find({ clientId: req.params.clientId });
  res.json(chats);
});

// Get messages for a specific chat
router.get("/:clientId/:chatId/messages", async (req, res) => {
  const { clientId, chatId } = req.params;
  const chat = await WebChat.findOne({ clientId, chatId });
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  res.json(chat.messages);
});

export default router;
