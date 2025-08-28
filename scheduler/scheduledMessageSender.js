import cron from 'node-cron';
import { ScheduledMessage } from '../models/ScheduledMessage.js';
import { getClient } from '../clients/getClient.js';
import { sendMessage } from '../utils/sendMessage.js';
import { assertCanSendMessage, incrementUsage } from '../services/quota.js';

export function startScheduledMessageSender() {
  // The cron job runs every minute (every time this executes, it checks for scheduled messages)
  cron.schedule('* * * * *', async () => {  // Runs every minute
    const now = new Date();  // Get current UTC time
    //console.log(`Cron job running at: ${now.toISOString()}`);  // Log the current time for debugging

    try {
      // Fetch messages that need to be sent (sendAt <= now)
      const messagesToSend = await ScheduledMessage.find({
        sendAt: { $lte: now }, 
        isSent: false  
      });

      if (messagesToSend.length === 0) {
        //console.log("No messages to send at this time.");
      } else {
       // console.log(`Found ${messagesToSend.length} message(s) to send.`);
      }

      // Process each message that needs to be sent
for (let msg of messagesToSend) {
  const { clientId, chatId, message, scheduleName } = msg;

  let client = getClient(clientId);
  if (!client) throw new Error('WhatsApp client not found');

  // If client is not yet connected → wait for it
  if (sessionStatus.get(clientId) !== 'connected') {
    console.log(`⚠️ Client ${clientId} not connected, waiting for re-authentication...`);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Client reconnection timeout')), 20000);

      client.once('ready', () => {
        clearTimeout(timeout);
        sessionStatus.set(clientId, 'connected');
        console.log(`✅ Client ${clientId} reconnected & ready`);
        resolve();
      });
    });
  }

  const { sub } = await assertCanSendMessage(clientId);
  if (client) {
    try {
      await sendMessage(client, chatId, message);
      await incrementUsage(sub._id, 1);
      msg.isSent = true;
      msg.failureReason = null; // clear if success
      await msg.save();

      console.log(`Message sent to ${chatId} (Schedule: ${scheduleName})`);
    } catch (err) {
      msg.isSent = false;
      msg.failureReason = err.message; // save failure reason
      await msg.save();
      console.error(`Failed to send message to ${chatId} (Schedule: ${scheduleName}):`, err.message);
    }
  } else {
    msg.isSent = false;
    msg.failureReason = `Client ${clientId} not available`;
    await msg.save();

    console.error(`Client ${clientId} is not available (Schedule: ${scheduleName})`);
  }
}


    } catch (err) {
      console.error('Error sending scheduled messages:', err.message);
    }
  });
}
