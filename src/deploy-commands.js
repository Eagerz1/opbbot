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
import { fetchApplicationId, fetchBotGuilds } from './lib/invite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Write a key into .env, filling a blank line or appending. */
function saveToEnv(key, value) {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return false;
  let text = readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  const blank = new RegExp(`^([ \\t]*(?:export[ \\t]+)?${key}[ \\t]*[=:])[ \\t]*$`, 'm');
  if (blank.test(text)) text = text.replace(blank, `$1${value}`);
  else text += `${text.endsWith('\n') || text === '' ? '' : '\n'}${key}=${value}\n`;
  writeFileSync(envPath, text, 'utf8');
  return true;
}

const token = process.env.DISCORD_TOKEN?.trim();
let clientId = process.env.CLIENT_ID?.trim();
let guildId = process.env.GUILD_ID?.trim();

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
    if (saveToEnv('CLIENT_ID', clientId)) logger.ok('Saved CLIENT_ID to .env');
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const forceGlobal = args.includes('--global');
const clear = args.includes('--clear');

// Global commands take up to an hour to appear; guild commands are instant.
// The bot is usually already in exactly one server, so use it automatically
// rather than making the user find and paste the server ID.
if (!guildId && !forceGlobal && !clear) {
  try {
    const guilds = await fetchBotGuilds(token);
    if (guilds.length === 1) {
      guildId = guilds[0].id;
      logger.info(`Registering to "${guilds[0].name}" so the commands appear immediately`);
      if (saveToEnv('GUILD_ID', guildId)) logger.ok('Saved GUILD_ID to .env');
    } else if (guilds.length > 1) {
      logger.warn(`The bot is in ${guilds.length} servers, so commands will be registered globally (up to 1 hour to appear).`);
      console.error('\n  For instant registration pick one:');
      for (const g of guilds) console.error(`    npm run set-token -- --guild-id ${g.id}   ${g.name}`);
      console.error('');
    } else {
      logger.warn('The bot is not in any server yet — registering globally (up to 1 hour to appear).');
      console.error('\n  Add it to your server first:  npm run invite');
      console.error('  Then run this again for instant commands.\n');
    }
  } catch (err) {
    logger.warn(`Could not check which servers the bot is in (${err.message})`);
  }
}

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

    // Registering to a guild leaves any earlier global copies in place, which
    // shows every command twice in the picker. Clear them out.
    if (!forceGlobal && guildId) {
      try {
        const globals = await rest.get(Routes.applicationCommands(clientId));
        if (globals.length > 0) {
          await rest.put(Routes.applicationCommands(clientId), { body: [] });
          logger.ok(`Removed ${globals.length} older global command(s) so they don't appear twice`);
        }
      } catch {
        /* not fatal - the guild commands are registered either way */
      }
    }
  }
} catch (err) {
  logger.error('Deploy failed:', err.message);
  if (err.rawError?.errors) console.error(JSON.stringify(err.rawError.errors, null, 2));
  process.exit(1);
}
