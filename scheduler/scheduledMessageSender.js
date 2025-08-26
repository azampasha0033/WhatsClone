// scheduler/scheduledMessageSender.js
import cron from 'node-cron';
import { ScheduledMessage } from '../models/ScheduledMessage.js';
import { getClient } from '../clients/getClient.js'; 
import { sendMessage } from '../utils/sendMessage.js'; 

// The function to start the cron job
export function startScheduledMessageSender() {
  cron.schedule('* * * * *', async () => { // Runs every minute
    try {
      // Find messages that are due to be sent
      const now = new Date();
      const messagesToSend = await ScheduledMessage.find({ sendAt: { $lte: now }, isSent: false });

      for (let msg of messagesToSend) {
        const { clientId, chatId, message } = msg;

        const client = await getClient(clientId); // Get the client instance

        if (client) {
          try {
            // Send the message using your existing method
            await sendMessage(client, chatId, message);

            // Mark the message as sent in the database
            msg.isSent = true;
            await msg.save();
            console.log(`Message sent to ${chatId} from client ${clientId}`);
          } catch (err) {
            console.error(`Failed to send message to ${chatId} from client ${clientId}:`, err.message);
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
