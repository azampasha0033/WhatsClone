import { Router } from 'express';
import { assignChatController } from '../controllers/chat.controller.js';

const router = Router();

// Assign chat manually or automatically
router.post('/:chatId/assign', assignChatController);

export default router;
