import mongoose from 'mongoose';

const messageQueueSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  to: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['poll', 'message'], required: true }, // Add the 'type' field to differentiate poll and regular messages
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export const MessageQueue = mongoose.model('MessageQueue', messageQueueSchema);

// Function to queue a message
export const queueMessage = async (clientId, to, message, type) => {
  await MessageQueue.create({ clientId, to, message, type });  // Save the type when queuing the message
//  console.log(`⏳ Queued message in DB for ${clientId} → ${to} with type ${type}`);
};

// Get all queued messages for a client
export const getQueuedMessages = async (clientId) => {
  return await MessageQueue.find({ clientId, status: 'pending' });
};

// Clear all queued messages for a client
export const clearQueuedMessages = async (clientId) => {
  await MessageQueue.deleteMany({ clientId, status: 'pending' });
};
