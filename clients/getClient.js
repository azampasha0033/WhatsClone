// clients/getClient.js
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, Poll, MessageMedia } = pkg;
import qrcode from 'qrcode';

import { MessageQueue } from '../db/messageQueue.js';
import { ClientModel } from '../db/clients.js';
import { SentMessage } from '../models/SentMessage.js';
import { PollVote } from '../models/PollVote.js';
import { saveChat } from '../services/chatService.js';
import { saveMessage } from '../services/messageService.js';
//import { startBotCall } from "../services/botCall.js";


import { userFlowService } from "../services/userFlowService.js";
import { flowService } from "../services/flow.service.js";
import { Template } from "../models/Template.js"; // if using templates




import fs from 'fs';
import path from 'path';

// ⬇️ NEW: quota services
import { assertCanSendMessage, incrementUsage } from '../services/quota.js';

// ----------------------------- In-Memory Stores ----------------------------
const clients = new Map();
const qrCodes = new Map();
const readyFlags = new Map();
const sessionStatus = new Map();   

const sessionsPath = process.env.SESSIONS_DIR || './wa-sessions';

if (!fs.existsSync(sessionsPath)) {
  console.log('⚠️ Session folder missing → Railway wiped storage');
}

/* ------------------------------ Helper funcs ------------------------------ */
function getShortMsgId(serialized) {
  if (!serialized) return null;
  const parts = String(serialized).split('_');
  return parts.length ? parts[parts.length - 1] : serialized;
}

function extractParentMessageIdFromVote(vote) {
  return (
    vote?.pollCreationMessageKey?._serialized ||
    vote?.pollCreationMessageKey?.id ||
    vote?.parentMsgKey?._serialized ||
    vote?.parentMsgKey?.id ||
    vote?.quotedStanzaID ||
    null
  );
}

// Map WhatsApp's selected option objects to plain text labels
function mapSelectedLabels(selected, options) {
  return (Array.isArray(selected) ? selected : [])
    .map(sel => {
      if (sel?.name) return sel.name;
      if (typeof sel === 'number' && options?.[sel]?.name) return options[sel].name;
      if (typeof sel === 'string') return sel;
      return String(sel);
    })
    .filter(Boolean);
}

function extractOrderNumberFromCorrelation(corr) {
  if (!corr) return null;
  const s = String(corr);
  const m = s.match(/(?:confirm:)?(\d+)/i); 
  return m ? m[1] : null;
}

/* -------------------------------- getClient -------------------------------- */
function getClient(clientId) {
  if (clients.has(clientId)) return clients.get(clientId);

  //console.log(`🚀 Initializing WhatsApp client: ${clientId}`);

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: sessionsPath,
      clientId,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
         '--no-zygote',
        '--single-process'
      ],
    },
  });

  /* --------------------------------- QR Code -------------------------------- */
  let qrLogged = false;
  client.on('qr', async (qr) => {
  // --- simple demo log (from example)
  console.log('QR RECEIVED', typeof qr === 'string' ? qr.slice(0, 40) + '…' : qr);

  // (your existing code continues)
  if (readyFlags.get(clientId)) return;
  readyFlags.set(clientId, false);
  if (!qrLogged) {
    console.log(`📸 QR received for ${clientId}`);
    qrLogged = true;
  }
  const qrData = await qrcode.toDataURL(qr);
  qrCodes.set(clientId, qrData);
  sessionStatus.set(clientId, 'pending');
  global.io?.to(clientId).emit('qr', { qr: qrData });
  await ClientModel.updateOne(
    { clientId },
    { $set: { sessionStatus: 'pending' } }
  ).catch((e) => console.warn('⚠️ ClientModel pending warn:', e?.message));
  console.log(`🕓 sessionStatus → 'pending' for ${clientId}`);
});


// 🔄 Force chat sync if client is already connected
client.on('authenticated', async () => {
  try {
    // give it a short delay so WA session is stable
    setTimeout(async () => {
      if (readyFlags.get(clientId)) {
        const chats = await client.getChats();
        for (const chat of chats) {
          await saveChat(clientId, chat);
        }
        console.log(`🔄 Forced sync for already-connected client ${clientId}`);
      }
    }, 3000);
  } catch (err) {
    console.error(`❌ Forced sync failed for ${clientId}:`, err.message);
  }
});


  /* ---------------------------------- Ready --------------------------------- */
  client.on('ready', async () => {

    console.log(`✅ Client ready: ${clientId}`);
    qrCodes.set(clientId, null);
    readyFlags.set(clientId, true);
    sessionStatus.set(clientId, 'connected');
    global.io?.to(clientId).emit('ready', { message: 'connected' });

/*
  let sent;
 const startTime = new Date(Date.now() + 60_000);
  const link = await client.createCallLink(startTime, "voice"); // e.g. https://call.whatsapp.com/voice/XXXX
 const call_link=`Tap to join this call: ${link}`;
  await client.sendMessage("9233090230074@c.us", );
 sent = await client.sendMessage("923090230074@c.us", call_link);
if(sent){
  console.log("Call link sent successfully");
    console.log("Call link sent:", link);
}else{
  console.log("Failed to send call link");
}
*/

      
  try {
  const page = client.pupPage;

  if (page && !page.__joinedHooked) {
    // Detect "joined the call" messages in WA console logs
    page.on('console', (msg) => {
      if (msg.text().includes("joined the call")) {
        console.log("✅ User joined call link");
        global.io?.to(clientId).emit('call-joined', { clientId });
      }
    });
    page.__joinedHooked = true;
  } else {
    console.log("Page not found or already hooked for joined event");
  }

  if (page && !page.__consoleHooked) {
    // Pipe WA console logs
    page.on('console', (m) => console.log('📄[WA] LOG', m.text()));
    page.on('error', (e) => console.warn('📄[WA] PAGE ERROR', e?.message || e));
    page.on('pageerror', (e) => console.warn('📄[WA] PAGEEXCEPTION', e?.message || e));

    page.on('close', async () => {
      console.warn(`⚠️ Puppeteer page closed for ${clientId}`);
      readyFlags.set(clientId, false);
      sessionStatus.set(clientId, 'disconnected');

      await ClientModel.updateOne(
        { clientId },
        { $set: { sessionStatus: 'disconnected', lastDisconnectedAt: new Date(), lastDisconnectReason: 'PAGE_CLOSED' } }
      ).catch(() => null);

      try { await client.destroy(); } catch {}
      clients.delete(clientId);
      qrCodes.delete(clientId);
      readyFlags.delete(clientId);
      sessionStatus.delete(clientId);
    });

    // 🔥 Inject hook into WhatsApp Web to intercept WebRTC connections
   await page.evaluate(() => {
  const OrigPC = window.RTCPeerConnection;
  window.RTCPeerConnection = function(...args) {
    const pc = new OrigPC(...args);
    console.log("✅ Hooked into WA PeerConnection");

    pc.addEventListener("track", (event) => {
      if (event.track.kind === "audio") {
        console.log("🎤 Got audio from WA call");
        // TODO: forward audio via WebSocket to backend
      }
    });

    const sender = pc.addTrack; // save reference
    pc.addTrack = function(track, ...rest) {
      console.log("📢 Bot can inject audio here");
      return sender.call(this, track, ...rest);
    };

    return pc;
  };
});


    page.__consoleHooked = true;
    console.log('🔌 ready: page console piping enabled + WebRTC hook added');
  }
} catch (e) {
  console.warn('⚠️ ready: console pipe failed:', e?.message);
}


 // ✅ Single block to save chats + messages
  try {
    const chats = await client.getChats();
    for (const chat of chats) {
      await saveChat(clientId, chat);

      try {
        const messages = await chat.fetchMessages({ limit: 50 });
        for (const msg of messages) {
          await saveMessage(clientId, msg);
        }
      } catch (err) {
        console.warn(`⚠️ Could not fetch messages for chat ${chat.id._serialized}:`, err.message);
      }
    }
    console.log(`💾 Saved ${chats.length} chats (and recent messages) for client ${clientId}`);
  } catch (err) {
    console.error(`❌ Failed to fetch chats/messages for ${clientId}:`, err.message);
  }

    await ClientModel.updateOne(
      { clientId },
      { $set: { sessionStatus: 'connected', lastConnectedAt: new Date() } }
    ).catch((e) => console.warn('⚠️ ClientModel connected warn:', e?.message));
    console.log(`🟢 sessionStatus → 'connected' for ${clientId}`);

    // === Process Queued Messages ===
    const queued = await MessageQueue.find({ clientId, status: 'pending' }).catch(() => []);
    console.log(`📮 queued count for ${clientId}: ${queued.length}`);

    for (const { to, message, _id, type } of queued) {
      try {
        const chatId = to.replace(/\D/g, '') + '@c.us';
        let payload = null;
        try { payload = JSON.parse(message); } catch {}

        let sent;

        if (type === 'poll') {
          if (payload?.introText) {
            await client.sendMessage(chatId, String(payload.introText));
          }

          const qRaw = (payload?.question || '').trim();
          const ops = Array.isArray(payload?.options) ? payload.options.map(o => String(o).trim()) : [];
          if (!qRaw || ops.length === 0) {
            console.error(`❌ Invalid poll payload`, payload);
            continue;
          }

          const poll = new Poll(qRaw, ops, {
            allowMultipleAnswers: payload?.allowMultipleAnswers === true
          });

          sent = await client.sendMessage(chatId, poll);
          console.log('✉️ poll sent →', sent?.id?._serialized);

        } else if (payload?.attachment) {
          let media;
          if (String(payload.attachment).startsWith('http')) {
            media = await MessageMedia.fromUrl(payload.attachment);
          } else {
            media = new MessageMedia(
              payload.mimetype || 'application/octet-stream',
              String(payload.attachment).includes(',') ? String(payload.attachment).split(',')[1] : payload.attachment,
              payload.filename || 'file'
            );
          }
          sent = await client.sendMessage(chatId, media, { caption: payload.message || '' });

        } else {
          const text = payload?.message ?? message;
          sent = await client.sendMessage(chatId, text);
        }

          console.log(`✅ queued item sent type=${type} to=${to}`);
    // ✅ Update status to 'sent'
        await MessageQueue.findByIdAndUpdate(_id, { status: 'sent', sentAt: new Date(), failureReason: null });



      } catch (err) {
        console.error(`⛔ queued send failed to ${to}:`, err.message);
      }
    }
  });

  /* ------------------------------- Calls Update ------------------------------ */
// client.on("call", async (call) => {
//   console.log("📞 Call detected:", call);

//   const page = client.pupPage;

//   if (page) {
//     await page.evaluate(() => {
//       const OrigPC = window.RTCPeerConnection;
//       window.RTCPeerConnection = function (...args) {
//         const pc = new OrigPC(...args);
//         console.log("✅ Bot auto-joined WA call");

//         // 🎤 Capture human audio
//         pc.addEventListener("track", (event) => {
//           if (event.track.kind === "audio") {
//             console.log("🎤 Human is speaking");
//             // TODO: forward audio to backend (STT pipeline)
//           }
//         });

//         // 📢 Inject bot audio into call
//         const origAddTrack = pc.addTrack.bind(pc);
//         pc.addTrack = function (track, ...rest) {
//           console.log("📢 Bot audio injected into call");
//           return origAddTrack(track, ...rest);
//         };

//         return pc;
//       };
//     });
//   }

//   global.io?.to(clientId).emit("call-detected", { clientId, call });
// });




  // client.on('call', async (call) => {
//   console.log("📞 Call detected:", call);

//   try {
//     const page = client.pupPage;
//     if (page) {
//       await page.evaluate(() => {
//         // WhatsApp Web uses a button with aria-label="Join" or text "Join"
//         const joinBtn = [...document.querySelectorAll('button')].find(
//           btn => btn.innerText.includes("Join") || btn.getAttribute("aria-label")?.includes("Join")
//         );
//         if (joinBtn) {
//           joinBtn.click();
//           console.log("✅ Auto-joined the call");
//         } else {
//           console.log("⚠️ Join button not found in DOM");
//         }
//       });
//     }
//   } catch (err) {
//     console.error("❌ Failed to auto-join:", err.message);
//   }
// });



//   client.on('call', (call) => {
//    console.log("📞 Incoming/outgoing call event:", call);
//    console.log('-------------------------------');
//    console.log("From:", call.from, "Is group:", call.isGroup, "Offer:", call.offerTime);
//      console.log('-------------------------------');
//        console.log('-------------------------------');
// });




  /* ------------------------------- Chat Update ------------------------------ */

  client.on('chat_update', async (chat) => {
  await saveChat(clientId, chat);
});


  /* ------------------------------- New Message ------------------------------ */
client.on('message', async (msg) => {
  try {
    console.log('📨 New message received from:', msg.from, 'Body:', msg.body);

    await saveMessage(clientId, msg);
    console.log('💾 Message saved successfully');

    const messageData = {
      id: msg.id._serialized,
      from: msg.from,
      to: msg.to,
      timestamp: msg.timestamp,
      body: msg.body,
      type: msg.type,
      hasMedia: msg.hasMedia,
      ack: msg.ack
    };

    global.io?.to(clientId).emit('new-message', { clientId, message: messageData });
    console.log('🌐 Emitted new-message event');

    // --- Handle Chat Update ---
    const chat = await msg.getChat();
    const chatData = {
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage ? chat.lastMessage.body : null,
      timestamp: chat.timestamp
    };
    global.io?.to(clientId).emit('chat-updated', chatData);
    console.log('🌐 Emitted chat-updated event');

    // --- Handle Flow ---
    const flows = await flowService.getFlows(clientId);
    console.log('🛠 Flows fetched for client:', flows.length);

    if (!flows || flows.length === 0) {
      console.log('⚠️ No flows for this client, exiting handler');
      return;
    }

    const flow = flows[0];
    console.log('➡️ Using flow:', flow._id);

    // --- Get or create user state ---
    let userState = await userFlowService.getUserState(clientId, msg.from, flow._id);
    if (!userState) {
      console.log('🆕 User is new, creating user state');
      const firstNode = flow.nodes[0];
      userState = await userFlowService.createUserState(clientId, msg.from, flow._id, firstNode.id);
    } else {
      console.log('👤 Existing user state found:', userState._id);
    }

    const currentNode = flow.nodes.find(n => n.id === userState.currentNodeId);
    if (!currentNode) {
      console.log('⚠️ Current node not found, exiting');
      return;
    }
    console.log('🔹 Current node:', currentNode.id);

    // --- Determine next node ---
    const outgoingEdges = flow.edges.filter(e => e.source === currentNode.id);
    let nextNodeId = null;
    for (const edge of outgoingEdges) {
      if (!edge.condition || msg.body.toLowerCase().includes(edge.condition.toLowerCase())) {
        nextNodeId = edge.target;
        break;
      }
    }
    if (!nextNodeId && outgoingEdges.length === 1) nextNodeId = outgoingEdges[0].target;

    if (!nextNodeId) {
      console.log('⚠️ No matching edge found, exiting');
      return;
    }

    const nextNode = flow.nodes.find(n => n.id === nextNodeId);
    if (!nextNode) {
      console.log('⚠️ Next node not found, exiting');
      return;
    }
    console.log('➡️ Next node:', nextNode.id);

    // --- Send response ---
    if (nextNode.type === 'template' && nextNode.data.templateId) {
      const template = await Template.findById(nextNode.data.templateId);
      if (template) {
        await client.sendMessage(msg.from, template.body);
        console.log('📤 Template message sent:', template.body);
      }
    } else if (nextNode.type === 'text' && nextNode.data.text) {
      await client.sendMessage(msg.from, nextNode.data.text);
      console.log('📤 Text message sent:', nextNode.data.text);
    }

    // --- Update user state ---
    await userFlowService.updateUserState(userState._id, nextNode.id);
    console.log('✅ User state updated');

  } catch (err) {
    console.error(`❌ Error in message handler for ${clientId}:`, err.message);
  }
});






  /* --------------------------- Poll vote --------------------------- */
  client.on('vote_update', async (vote) => {
    try {
      const parentIdRaw = extractParentMessageIdFromVote(vote);
      if (!parentIdRaw) return;

      const parentShort = getShortMsgId(parentIdRaw);
      let sent = await SentMessage.findOne({ type: 'poll', messageId: parentIdRaw }) ||
                 await SentMessage.findOne({ type: 'poll', messageId: { $regex: `${parentShort}$` } }) ||
                 await SentMessage.findOne({ type: 'poll', messageIdShort: parentShort });
      if (!sent) return;

      if (sent.answered === true) return;

      const selected = vote?.selectedOptions || vote?.vote?.selectedOptions || vote?.choices || vote?.options || [];
      const labels = mapSelectedLabels(selected, sent.payload?.options);

      const corr = sent.correlationId || sent.payload?.correlationId || null;
      const orderNumber = extractOrderNumberFromCorrelation(corr);

      const res = await SentMessage.updateOne(
        { _id: sent._id, answered: { $ne: true } },
        {
          $set: {
            answered: true,
            answer: { labels, raw: selected, orderNumber },
            answeredAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
      if (res.modifiedCount === 0) return;

      let voterWid = vote?.sender || vote?.author || vote?.from || vote?.voterId || vote?.participant || null;
      if (!voterWid && typeof sent.to === 'string' && sent.to.endsWith('@c.us')) voterWid = sent.to;

      if (voterWid) {
        await PollVote.updateOne(
          { clientId, pollMessageId: sent.messageId, voter: voterWid },
          {
            $setOnInsert: {
              clientId,
              chatId: sent.to,
              pollMessageId: sent.messageId,
              correlationId: corr,
              voter: voterWid,
              option: labels.join(', '),
              orderNumber,
              source: 'vote_update',
              votedAt: new Date()
            }
          },
          { upsert: true }
        );
      }

      global.io?.to(sent.clientId)?.emit('poll_vote', {
        correlationId: corr,
        orderNumber,
        to: sent.to,
        messageId: sent.messageId,
        labels,
        voter: voterWid || null
      });

      console.log('✅ vote_update recorded →', { orderNumber, labels, voter: voterWid || '' });
    } catch (e) {
      console.error('❌ vote_update handler error:', e?.message);
    }
  });

  /* ------------------------------- Disconnected ----------------------------- */
  client.on('disconnected', async (reason) => {
    console.warn(`🔌 Disconnected (${clientId}): ${reason}`);
    readyFlags.set(clientId, false);
    sessionStatus.set(clientId, 'disconnected');

    await ClientModel.updateOne(
      { clientId },
      { $set: { sessionStatus: 'disconnected', lastDisconnectedAt: new Date(), lastDisconnectReason: reason } }
    ).catch(() => null);

    if (reason === 'LOGOUT' || reason === 'NAVIGATION') {
      try { await client.destroy(); } catch {}
      clients.delete(clientId);
      qrCodes.delete(clientId);
      readyFlags.delete(clientId);
      sessionStatus.delete(clientId);
    }
  });

  client.initialize();
  clients.set(clientId, client);
  return client;
}

/* --------------------------------- Utilities ------------------------------- */
function getQRCode(clientId) {
  return qrCodes.get(clientId);
}

function isClientReady(clientId) {
  return readyFlags.get(clientId) === true;
}

/* ---------------------------- Exports (Single) ----------------------------- */
export { getClient, getQRCode, isClientReady, sessionStatus };
