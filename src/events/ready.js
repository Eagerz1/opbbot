import { Events, ActivityType } from 'discord.js';
import { startGiveawayLoop } from '../lib/giveaways.js';
import { listActiveGiveaways } from '../lib/store.js';
import { buildInviteUrl } from '../lib/invite.js';
import { BRAND } from '../config/constants.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  const active = listActiveGiveaways();
  client.logger.ok(`${BRAND.name} online as ${client.user.tag}`);
  client.logger.info(`Serving ${client.guilds.cache.size} guild(s) · ${active.length} active giveaway(s) resumed`);

  // Print the invite link when the bot isn't in a server yet - it's the only
  // thing you need next, and the ID is known here without looking it up.
  if (client.guilds.cache.size === 0) {
    const url = buildInviteUrl(client.user.id);
    console.log('');
    console.log('  \u001b[1mAdd the bot to your server:\u001b[0m');
    console.log(`  \u001b[36m${url}\u001b[0m`);
    console.log('');
    console.log('  \u001b[90mAfter it joins: drag the OPB Giveaways role to the top of\u001b[0m');
    console.log('  \u001b[90mServer Settings \u2192 Roles, then run /setup in the server.\u001b[0m');
    console.log('');
  }

  client.user.setPresence({
    activities: [{ name: `${BRAND.icon} giveaways · /help`, type: ActivityType.Watching }],
    status: 'online',
  });

  startGiveawayLoop(client);
}
