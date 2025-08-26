// utils/sendMessage.js
export const sendMessage = async (client, chatId, message) => {
  try {
    await client.sendMessage(chatId, message);
    console.log(`Message sent to ${chatId}`);
  } catch (err) {
    console.error(`Error sending message to ${chatId}:`, err.message);
    throw err;
  }
};
