import { ClientModel } from '../db/clients.js';

export async function authMiddleware(req, res, next) {
  const apiKey = req.headers['authorization'];
  if (!apiKey) return res.status(401).json({ error: 'Missing API Key' });

  const client = await ClientModel.findOne({ apiKey });
  if (!client) return res.status(403).json({ error: 'Invalid API Key' });

  req.clientId = client.clientId;
  next();
}
