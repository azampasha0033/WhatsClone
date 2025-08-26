import express from 'express';
import { assertCanSendMessage, incrementUsage } from '../services/quota.js'; // Import your quota functions
import { ScheduledMessage } from '../models/ScheduledMessage.js';  // Import the model
import { getClient } from '../clients/getClient.js';  // Your method to get the client
import { sendMessage } from '../utils/sendMessage.js';  // Your function to send the message

const router = express.Router();

// Handle POST requests to /schedule
router.post('/', async (req, res) => {
  const { clientId, message, sendAt, users } = req.body;

  if (!clientId || !message || !sendAt || !users || users.length === 0) {
    return res.status(400).json({ error: 'All fields are required and users should be provided.' });
  }

  try {
    const scheduledMessages = [];

    for (const user of users) {
      const { chatId } = user; // Assuming `chatId` is passed for each user

      // Check if the client can send the message (assertCanSendMessage)
      const { sub, limit, remaining } = await assertCanSendMessage(clientId);

      if (remaining <= 0) {
        return res.status(400).json({ error: `No message quota remaining for client ${clientId}` });
      }

      // Schedule the message for this user
      const scheduledMessage = new ScheduledMessage({
        clientId,
        chatId,
        message,
        sendAt: new Date(sendAt),
        isSent: false
      });

      scheduledMessages.push(scheduledMessage);

      // Increment the usage for the user
      await incrementUsage(sub._id, 1); // Increment by 1 for each message scheduled
    }

    // Save the scheduled messages to the database
    await ScheduledMessage.insertMany(scheduledMessages);

    res.status(201).json({ message: `${users.length} messages scheduled successfully` });

  } catch (err) {
    console.error('Error scheduling messages:', err);
    res.status(500).json({ error: 'Failed to schedule messages' });
  }
});

export default router;
