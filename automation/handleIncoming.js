import { AutomationModel } from '../db/automations.js';

export async function handleIncomingMessage(clientId, message) {
  const rules = await AutomationModel.find({ clientId, active: true });

  for (const rule of rules) {
    const match =
      (rule.matchType === 'exact' && message.body === rule.trigger) ||
      (rule.matchType === 'contains' && message.body.includes(rule.trigger));

    if (match) {
      await message.reply(rule.response);
      break;
    }
  }
}
