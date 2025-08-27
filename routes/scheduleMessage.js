// routes/scheduleMessage.js
import express from 'express';
import { assertCanSendMessage, incrementUsage } from '../services/quota.js'; // Import quota functions
import { ScheduledMessage } from '../models/ScheduledMessage.js';  // Import the model
import { getClient } from '../clients/getClient.js';  // Your method to get the client
import { sendMessage } from '../utils/sendMessage.js';  // Your function to send the message

const router = express.Router();

// Handle POST requests to /schedule
router.post('/', async (req, res) => {
  const { clientId, message, sendAt, users, scheduleName } = req.body;

  if (!clientId || !message || !sendAt || !users || users.length === 0 || !scheduleName) {
    return res.status(400).json({ error: 'All fields are required and users should be provided, including scheduleName.' });
  }

  try {
    const scheduledMessages = [];

    for (const user of users) {
      const { chatId } = user;

      // Check message quota
      const { sub, limit, remaining } = await assertCanSendMessage(clientId);
      if (remaining <= 0) {
        return res.status(400).json({ error: `No message quota remaining for client ${clientId}` });
      }

      // Create scheduled message with scheduleName
      const scheduledMessage = new ScheduledMessage({
        clientId,
        chatId,
        message,
        sendAt: new Date(sendAt),
        isSent: false,
        scheduleName  // <-- Save schedule name
      });

      scheduledMessages.push(scheduledMessage);

      // Increment quota
      await incrementUsage(sub._id, 1);
    }

    await ScheduledMessage.insertMany(scheduledMessages);

    res.status(201).json({ message: `${users.length} messages scheduled successfully under "${scheduleName}"` });

  } catch (err) {
    console.error('Error scheduling messages:', err);
    res.status(500).json({ error: 'Failed to schedule messages' });
  }
});

// GET /schedule/summary?clientId=XXXX
router.get('/summary', async (req, res) => {
  const { clientId } = req.query;

  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required' });
  }

  try {
    // Aggregate messages by scheduleName for the specific client
    const schedules = await ScheduledMessage.aggregate([
      { $match: { clientId } },  // FILTER BY CLIENT
      {
        $group: {
          _id: '$scheduleName',
          totalMessages: { $sum: 1 },
          sentMessages: { $sum: { $cond: ['$isSent', 1, 0] } },
          failedMessages: { $sum: { $cond: ['$isSent', 0, 1] } },
          failedNumbers: { $push: { $cond: ['$isSent', null, { chatId: '$chatId', reason: '$failureReason' }] } },
          sendAt: { $first: '$sendAt' },       // scheduled time
          createdAt: { $first: '$createdAt' }, // batch created time
        }
      },
      {
        $project: {
          _id: 0,
          scheduleName: '$_id',
          totalMessages: 1,
          sentMessages: 1,
          failedMessages: 1,
          failedNumbers: {
            $filter: {
              input: '$failedNumbers',
              as: 'f',
              cond: { $ne: ['$$f', null] } // remove nulls
            }
          },
          sendAt: 1,
          createdAt: 1,
          progress: { $concat: [{ $toString: '$sentMessages' }, '/', { $toString: '$totalMessages' }] }
        }
      },
      { $sort: { sendAt: -1 } } // latest first
    ]);

    res.json({ schedules });

  } catch (err) {
    console.error('Error fetching schedule summary:', err);
    res.status(500).json({ error: 'Failed to fetch schedule summary' });
  }
});





export default router;
