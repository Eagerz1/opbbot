/**
 * Registers slash commands with Discord.
 *
 *   npm run deploy            -> guild commands (instant) if GUILD_ID is set,
 *                                otherwise global (up to 1h to appear)
 *   npm run deploy -- --global  force global
 *   npm run deploy -- --clear   remove all commands
 */
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { logger } from './lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  logger.error('DISCORD_TOKEN and CLIENT_ID are required in .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const forceGlobal = args.includes('--global');
const clear = args.includes('--clear');

const commands = [];
const dir = join(__dirname, 'commands');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(join(dir, file)).href);
  if (mod.data) commands.push(mod.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);
const scope = !forceGlobal && guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
const label = !forceGlobal && guildId ? `guild ${guildId}` : 'globally';

try {
  if (clear) {
    await rest.put(scope, { body: [] });
    logger.ok(`Cleared all commands ${label}`);
  } else {
    const data = await rest.put(scope, { body: commands });
    logger.ok(`Registered ${data.length} commands ${label}: ${data.map((c) => `/${c.name}`).join(' ')}`);
    if (forceGlobal || !guildId) logger.info('Global commands can take up to an hour to show up. Set GUILD_ID for instant testing.');
  }
} catch (err) {
  logger.error('Deploy failed:', err.message);
  if (err.rawError?.errors) console.error(JSON.stringify(err.rawError.errors, null, 2));
  process.exit(1);
}
