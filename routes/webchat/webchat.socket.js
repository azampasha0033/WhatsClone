import { WebChat } from "./webchat.model.js";
import { AgentModel } from "../../models/agent.js"; // if you already have this


export function initWebChatSocket(io) {
  io.on("connection", (socket) => {
    console.log("🌐 Web widget connected:", socket.id);

    // Start new chat after form submission
    socket.on("start-webchat", async ({ clientId, name, email, phone }) => {
      const chat = await WebChat.create({
        clientId,
        chatId: socket.id,
        name,
        email,
        phone,
        status: "pending",
      });

      // Assign agent (basic demo logic)
    const agent = await AgentModel.findOne({ clientId, online: true, status: "active" }).sort({ createdAt: 1 });

     
      if (agent) {
        chat.agentId = agent._id;
        chat.status = "assigned";
        await chat.save();
      }

      // Inform widget
      socket.emit("chat-started", {
        chatId: chat.chatId,
        agentAssigned: !!agent,
      });

      // Inform dashboard
      io.to(clientId).emit("new-chat", {
        clientId,
        chatId: chat.chatId,
        name,
        email,
        phone,
        agentId: agent ? agent._id : null,
        status: chat.status,
      });
    });

    // Handle user message
    socket.on("web-message", async ({ clientId, chatId, body }) => {
      await WebChat.updateOne(
        { clientId, chatId },
        { $push: { messages: { from: "user", body } } }
      );

      io.to(clientId).emit("new-message", {
        clientId,
        chatId,
        channel: "web",
        body,
        from: "user",
      });
    });

    // Handle agent reply
    socket.on("agent-reply", async ({ clientId, chatId, body }) => {
      await WebChat.updateOne(
        { clientId, chatId },
        { $push: { messages: { from: "agent", body } } }
      );

      io.to(chatId).emit("new-message", {
        clientId,
        chatId,
        channel: "web",
        body,
        from: "agent",
      });
    });

    socket.on("disconnect", () => {
      console.log(`❌ Web widget disconnected: ${socket.id}`);
    });
  });
}
