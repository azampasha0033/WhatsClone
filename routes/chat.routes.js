// routes/chat.routes.js
import { Router } from 'express';
import { assignChatController } from '../controllers/chat.controller.js';

const router = Router();

// Assign chat (manual or auto)
// POST /api/chats/:chatId/assign
router.post('/:chatId/assign', assignChatController);

export default router;
