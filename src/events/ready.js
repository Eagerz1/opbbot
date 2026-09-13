import { Events, ActivityType } from 'discord.js';
import { startGiveawayLoop } from '../lib/giveaways.js';
import { listActiveGiveaways } from '../lib/store.js';
import { BRAND } from '../config/constants.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  const active = listActiveGiveaways();
  client.logger.ok(`${BRAND.name} online as ${client.user.tag}`);
  client.logger.info(`Serving ${client.guilds.cache.size} guild(s) · ${active.length} active giveaway(s) resumed`);

  client.user.setPresence({
    activities: [{ name: `${BRAND.icon} giveaways · /help`, type: ActivityType.Watching }],
    status: 'online',
  });

  startGiveawayLoop(client);
}
