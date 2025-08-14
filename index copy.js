import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, Poll } = pkg;

import express from 'express';
import qrcode from 'qrcode';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const clients = new Map();
const qrCodes = new Map();
const readyFlags = new Map();

// Get or create a new client instance
function getClient(clientId) {
  if (clients.has(clientId)) return clients.get(clientId);

  if (!/^[a-zA-Z0-9_-]+$/.test(clientId)) {
    throw new Error('Invalid clientId. Only alphanumeric characters, underscores and hyphens are allowed.');
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './sessions',
      clientId,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

client.on('qr', async (qr) => {
    if (readyFlags.get(clientId)) return;

    const qrData = await qrcode.toDataURL(qr);
    qrCodes.set(clientId, qrData);
    global.io?.to(clientId).emit('qr', { qr: qrData });

    // Ensure that the session is updated after QR code is shown
    await ClientModel.updateOne(
      { clientId },
      { $set: { sessionStatus: 'pending' } }
    );
    console.log(`🕓 sessionStatus set to 'pending' for ${clientId} (QR shown)`);
});


  client.on('authenticated', () => {
    console.log(`🔐 Authenticated: ${clientId}`);
  });

  client.on('ready', () => {
    console.log(`✅ Client ready: ${clientId}`);
    qrCodes.set(clientId, null);
    readyFlags.set(clientId, true);
  });

  client.on('disconnected', (reason) => {
    console.warn(`🔌 Disconnected (${clientId}):`, reason);
    readyFlags.set(clientId, false);
  });

  client.initialize();
  clients.set(clientId, client);
  return client;
}

app.get('/', (req, res) => {
  res.send('👋 Hello from WhatsApp Web API!');
});

app.get('/qr/:clientId', (req, res) => {
  const { clientId } = req.params;
  getClient(clientId);

  const qr = qrCodes.get(clientId);
  const isReady = readyFlags.get(clientId);

  if (isReady) return res.send({ qr: null, message: '✅ Already connected' });
  if (!qr) return res.send({ qr: null, message: '⏳ QR generating...' });

  return res.send({ qr });
});

app.post('/send-message', async (req, res) => {
  const { clientId, to, message } = req.body;

  if (!clientId || !to || !message) {
    return res.status(400).send({ error: 'Missing clientId, to, or message' });
  }

  const client = getClient(clientId);
  if (!readyFlags.get(clientId)) {
    return res.status(400).send({ error: 'Client not ready' });
  }

  try {
    const chatId = to.replace(/\D/g, '') + '@c.us';
    const result = await client.sendMessage(chatId, message);
    res.send({ success: true, messageId: result.id._serialized });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});







app.post('/send-confirmation', async (req, res) => {
  const { clientId, to, question, options, allowMultipleAnswers, introText } = req.body;

  if (!clientId || !to) {
    return res.status(400).send({ error: 'Missing clientId or to' });
  }

  const client = getClient(clientId);
  if (!readyFlags.get(clientId)) {
    return res.status(400).send({ error: 'Client not ready' });
  }

  try {
    const chatId = to.replace(/\D/g, '') + '@c.us';

    // Step 1: Send Intro Text (template-style message)
    const introMessage = introText || `👋 Hello from XYZ Store!\n\n🧾 Your order has been received and is ready for confirmation.`;
    await client.sendMessage(chatId, introMessage);

    // Step 2: Prepare Poll
    const pollQuestion = question || '🛒 Do you confirm your order?';
    const pollOptions = Array.isArray(options) && options.length > 0
      ? options
      : ['✅ Yes', '❌ No'];

    const pollMessage = new Poll(pollQuestion, pollOptions, {
      allowMultipleAnswers: allowMultipleAnswers === true,
        allowResubmission: false
    });

    // Step 3: Send Poll
    const message = await client.sendMessage(chatId, pollMessage);

    console.log('✅ Sent intro + poll:', message.id._serialized);
    res.send({
      success: true,
      messageId: message.id._serialized,
    });
  } catch (err) {
    console.error('❌ Failed to send confirmation:', err);
    res.status(500).send({ error: err.message });
  }
});









app.get('/chats/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const client = getClient(clientId);

  if (!readyFlags.get(clientId)) {
    return res.status(400).send({ error: 'Client not ready' });
  }

  try {
    const chats = await client.getChats();
    res.send({ success: true, chats });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get('/messages/:clientId/:chatId', async (req, res) => {
  const { clientId, chatId } = req.params;
  const client = getClient(clientId);

  if (!readyFlags.get(clientId)) {
    return res.status(400).send({ error: 'Client not ready' });
  }

  try {
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 50 });

    const formatted = messages.map((m) => ({
      id: m.id._serialized,
      body: m.body,
      type: m.type,
      fromMe: m.fromMe,
      timestamp: m.timestamp,
    }));

    res.send({ success: true, messages: formatted });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
