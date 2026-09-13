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
import { loadEnv } from './lib/env.js';
loadEnv();
import { REST, Routes } from 'discord.js';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { logger } from './lib/logger.js';
import { fetchApplicationId } from './lib/invite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_TOKEN?.trim();
let clientId = process.env.CLIENT_ID?.trim();
const guildId = process.env.GUILD_ID?.trim();

if (!token) {
  logger.error('DISCORD_TOKEN is not set.');
  console.error('\n  Set it with:  npm run set-token -- YOUR_TOKEN\n');
  process.exit(1);
}

// CLIENT_ID is derivable from the token, so don't make the user go find it.
if (!clientId) {
  try {
    clientId = await fetchApplicationId(token);
    logger.info(`CLIENT_ID was not set — looked it up from your token: ${clientId}`);

    // Save it so every later run is instant and offline-safe.
    const envPath = resolve(process.cwd(), '.env');
    if (existsSync(envPath)) {
      let text = readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
      const blank = /^([ \t]*(?:export[ \t]+)?CLIENT_ID[ \t]*[=:])[ \t]*$/m;
      if (blank.test(text)) text = text.replace(blank, `$1${clientId}`);
      else text += `${text.endsWith('\n') ? '' : '\n'}CLIENT_ID=${clientId}\n`;
      writeFileSync(envPath, text, 'utf8');
      logger.ok('Saved CLIENT_ID to .env');
    }
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }
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
