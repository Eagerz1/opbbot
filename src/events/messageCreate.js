import { Events } from 'discord.js';
import { awardXp } from '../lib/levels.js';

export const name = Events.MessageCreate;

export async function execute(message, client) {
  if (!message.inGuild() || message.author.bot || message.system) return;
  try {
    await awardXp(message);
  } catch (err) {
    client.logger.error('xp award', err);
  }
}
