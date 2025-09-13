import { ClientModel } from '../db/clients.js';
/**
 * Validate the API Key for the given clientId.
 * @param {string} clientId - The client ID.
 * @param {string} apiKey - The API key to validate.
 * @throws {Error} If the API key is invalid.
 */
export async function validateApiKey(clientId, apiKey) {

    console.log('client id 1'+clientId);
    console.log('API KEY HERE 1'+apiKey);
  const client = await ClientModel.findOne({ clientId });

console.log(client);

  if (!client || client.apiKey !== apiKey) {
    throw new Error('Invalid API key here ');
  }
}


