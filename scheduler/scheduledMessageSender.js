import cron from 'node-cron';
import { ScheduledMessage } from '../models/ScheduledMessage.js';
import { getClient } from '../clients/getClient.js';
import { sendMessage } from '../utils/sendMessage.js';

export function startScheduledMessageSender() {
  cron.schedule('* * * * *', async () => {  // Runs every minute
    const now = new Date();
    console.log(`Cron job running at: ${now.toISOString()}`);  // Log the time for debugging

    try {
      const messagesToSend = await ScheduledMessage.find({
        sendAt: { $lte: now },
        isSent: false
      });

      for (let msg of messagesToSend) {
        const { clientId, chatId, message } = msg;
        const client = await getClient(clientId);

        if (client) {
          try {
            await sendMessage(client, chatId, message);
            msg.isSent = true;  // Mark as sent
            await msg.save();  // Save the status to the database
            console.log(`Message sent to ${chatId}`);
          } catch (err) {
            console.error(`Failed to send message to ${chatId}:`, err.message);
          }
        } else {
          console.error(`Client ${clientId} is not available`);
        }
      }
    } catch (err) {
      console.error('Error sending scheduled messages:', err.message);
    }
  });
}
