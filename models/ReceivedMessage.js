import mongoose from 'mongoose';

const ReceivedMessageSchema = new mongoose.Schema({
  clientId: { type: String, index: true },
  messageId: { type: String, unique: true, sparse: true },
  from: String,                  // "923xxx@c.us"
  to: String,                    // your biz number
  body: String,
  type: String,                  // 'chat' | 'image' | 'buttons_response' | 'list_response' | 'poll' ...
  ts: Number,
  fromMe: Boolean,
  ack: Number,
  replyToId: { type: String, index: true },  // messageId of quoted/original
  meta: mongoose.Schema.Types.Mixed
}, { timestamps: true });

export const ReceivedMessage = mongoose.model('ReceivedMessage', ReceivedMessageSchema);
