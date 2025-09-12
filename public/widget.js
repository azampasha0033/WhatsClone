(function () {
  const clientId = document.currentScript.getAttribute("data-client-id");

  // Load Socket.IO client library dynamically
  const script = document.createElement("script");
  script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
  script.onload = init;
  document.head.appendChild(script);

  function init() {
    const socket = io("https://whatsclone-copy-production.up.railway.app", { // change to your server domain
      query: { clientId, channel: "web" }
    });

    // --- Chat bubble ---
    const chatBubble = document.createElement("div");
    chatBubble.innerText = "💬";
    chatBubble.style.cssText =
      "position:fixed;bottom:20px;right:20px;background:#1B9BD7;color:#fff;width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:28px;z-index:9999;";
    document.body.appendChild(chatBubble);

    // --- Chat box ---
    const chatBox = document.createElement("div");
    chatBox.style.cssText =
      "position:fixed;bottom:100px;right:20px;width:320px;height:420px;background:#fff;border:1px solid #ccc;display:none;flex-direction:column;font-family:sans-serif;z-index:9999;";
    chatBox.innerHTML = `
      <div style="background:#1B9BD7;color:#fff;padding:10px;">Chat with us</div>

      <!-- Form -->
      <div id="chatForm" style="flex:1;overflow-y:auto;padding:10px;">
        <input id="name" placeholder="Name" style="width:100%;margin:5px 0;padding:8px;" />
        <input id="email" placeholder="Email" style="width:100%;margin:5px 0;padding:8px;" />
        <input id="phone" placeholder="Phone" style="width:100%;margin:5px 0;padding:8px;" />
        <button id="startBtn" style="width:100%;padding:10px;background:#1B9BD7;color:#fff;border:none;">Start Chat</button>
      </div>

      <!-- Messages -->
      <div id="messages" style="flex:1;overflow-y:auto;padding:10px;display:none;"></div>

      <!-- Input -->
      <div id="chatInputArea" style="display:none;border-top:1px solid #ccc;">
        <input id="chatInput" style="flex:1;border:none;padding:10px;width:75%;" placeholder="Type a message..." />
        <button id="sendBtn" style="padding:10px;background:#1B9BD7;color:#fff;border:none;width:25%;">Send</button>
      </div>
    `;
    document.body.appendChild(chatBox);

    // --- Toggle chat ---
    chatBubble.onclick = () => {
      chatBox.style.display =
        chatBox.style.display === "none" ? "flex" : "none";
    };

    // --- DOM Elements ---
    const formDiv = chatBox.querySelector("#chatForm");
    const messagesDiv = chatBox.querySelector("#messages");
    const input = chatBox.querySelector("#chatInput");
    const sendBtn = chatBox.querySelector("#sendBtn");
    const startBtn = chatBox.querySelector("#startBtn");

    let chatId = null;

    // --- Start chat (form submit) ---
    startBtn.onclick = () => {
      const name = chatBox.querySelector("#name").value.trim();
      const email = chatBox.querySelector("#email").value.trim();
      const phone = chatBox.querySelector("#phone").value.trim();

      if (!name || !email || !phone) {
        alert("Please fill all fields.");
        return;
      }

      socket.emit("start-webchat", { clientId, name, email, phone });
    };

    // --- Chat started ---
    socket.on("chat-started", (data) => {
      chatId = data.chatId;
      formDiv.style.display = "none";
      messagesDiv.style.display = "block";
      chatBox.querySelector("#chatInputArea").style.display = "flex";
    });

    // --- Append message ---
    function appendMessage(text, from) {
      const div = document.createElement("div");
      div.innerText = (from === "agent" ? "Agent: " : "You: ") + text;
      div.style.margin = "5px 0";
      div.style.textAlign = from === "agent" ? "left" : "right";
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // --- Send message ---
    sendBtn.onclick = () => {
      const text = input.value.trim();
      if (!text) return;
      appendMessage(text, "user");
      socket.emit("web-message", { clientId, chatId, body: text });
      input.value = "";
    };

    // --- Receive agent message ---
    socket.on("new-message", (msg) => {
      if (msg.chatId === chatId && msg.from === "agent") {
        appendMessage(msg.body, "agent");
      }
    });
  }
})();
