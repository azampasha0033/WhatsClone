import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  clientId:   { type: String, required: true, index: true },
  chatId:     { type: String, required: true, index: true },
  msgId:      { type: String, required: true, unique: true },
  from:       { type: String },
  to:         { type: String },
  body:       { type: String },
  type:       { type: String },
  hasMedia:   { type: Boolean, default: false },
  ack:        { type: Number },
  timestamp:  { type: Number },
}, { timestamps: true });

export const Message = mongoose.model('Message', messageSchema);
