import express from 'express';
import { ClientModel } from '../db/clients.js';
import mongoose from 'mongoose';

const router = express.Router();

// Route to get the API key for a specific client
router.get('/get-api-key/:clientId', async (req, res) => {
  try {
    const id = (req.params.clientId || '').trim();
    
    // Log incoming request for debugging purposes
    console.log(`Request to get API key for clientId: ${id}`);

    // Query for the clientId directly, no need to check for ObjectId
    const query = { clientId: id };

    // Log the query to help with debugging
    console.log('Query to find client:', query);

    // Try to find the client based on clientId
    const client = await ClientModel.findOne(query).select('apiKey');
    
    if (!client) {
      console.log(`Client not found with ID: ${id}`);
      return res.status(404).json({ ok: false, error: 'Client not found' });
    }

    // Return the API key if client is found
    console.log(`API Key found for client ${id}:`, client.apiKey);
    res.json({ ok: true, apiKey: client.apiKey });
  } catch (e) {
    console.error('Error in fetching API key:', e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

export default router;
