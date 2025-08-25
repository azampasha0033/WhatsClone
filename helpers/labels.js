// helpers/labels.js
export async function setChatLabelsByName(client, chatId, labelNames) {
  const all = await client.getLabels();
  const wantedIds = labelNames
    .map(n => all.find(l => l.name.toLowerCase() === String(n).toLowerCase())?.id)
    .filter(Boolean);

  if (!wantedIds.length) throw new Error('No matching labels found');

  const chat = await client.getChatById(chatId);
  await chat.changeLabels([...new Set(wantedIds)]);
}
