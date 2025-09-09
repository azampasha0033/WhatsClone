// routes/chats.routes.js
import { Router } from 'express';
import { assignChatController } from '../controllers/chat.controller.js';

const router = Router();

// POST /api/chats/:chatId/assign
// Body: { clientId: "xxx", agentId?: "yyy" }
router.post('/:chatId/assign', assignChatController);

export default router;
