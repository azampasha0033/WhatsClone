import cron from 'node-cron';
import { ScheduledMessage } from '../models/ScheduledMessage.js';
import { getClient } from '../clients/getClient.js';
import { sendMessage } from '../utils/sendMessage.js';

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
      const client = await getClient(clientId);

      if (client) {
        try {
          await sendMessage(client, chatId, message);

          // Mark as sent
          msg.isSent = true;
          await msg.save();

          console.log(`Message sent to ${chatId} (Schedule: ${scheduleName})`);
        } catch (err) {
          console.error(`Failed to send message to ${chatId} (Schedule: ${scheduleName}):`, err.message);
        }
      } else {
        console.error(`Client ${clientId} is not available (Schedule: ${scheduleName})`);
      }
    }

    } catch (err) {
      console.error('Error sending scheduled messages:', err.message);
    }
  });
}
