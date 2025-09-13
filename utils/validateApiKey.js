import { ClientModel } from '../db/clients.js';
/**
 * Validate the API Key for the given clientId.
 * @param {string} clientId - The client ID.
 * @param {string} apiKey - The API key to validate.
 * @throws {Error} If the API key is invalid.
 */
export async function validateApiKey(clientId, apiKey) {
  if (!apiKey) {
    throw new Error('API key is missing');
  }

  console.log('client id: ', clientId);
  console.log('API KEY: ', apiKey);

  const client = await ClientModel.findOne({ clientId });

  if (!client || client.apiKey !== apiKey) {
    throw new Error('Invalid API key');
  }
}


