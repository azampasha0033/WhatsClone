// scheduler/scheduledMessageSender.js
import cron from 'node-cron';
import { ScheduledMessage } from '../models/ScheduledMessage.js';
import { getClient } from '../clients/getClient.js';
import { sendMessage } from '../utils/sendMessage.js';

// Export the function to be imported elsewhere
export function startScheduledMessageSender() {
  cron.schedule('* * * * *', async () => {  // Runs every minute
    try {
      // Find messages that need to be sent
      const now = new Date();
      const messagesToSend = await ScheduledMessage.find({ sendAt: { $lte: now }, isSent: false });

      for (let msg of messagesToSend) {
        const { clientId, chatId, message } = msg;

        const client = await getClient(clientId); // Get the client instance

        if (client) {
          try {
            await sendMessage(client, chatId, message);  // Send the message
            msg.isSent = true;  // Mark message as sent
            await msg.save();   // Save the status of the message
            console.log(`Message sent to ${chatId} from client ${clientId}`);
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
