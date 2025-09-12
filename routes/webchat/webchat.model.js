import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  from: { type: String, enum: ["user", "agent"], required: true },
  body: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const webChatSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  chatId: { type: String, required: true }, // socket.id
  channel: { type: String, default: "web" },
  name: String,
  email: String,
  phone: String,
  status: { type: String, default: "pending" }, // pending, assigned, closed
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", default: null },
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now },
});

export const WebChat = mongoose.model("WebChat", webChatSchema);
