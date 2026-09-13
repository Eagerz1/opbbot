import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { loadEnv } from './lib/env.js';
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { logger } from './lib/logger.js';
import { BRAND } from './config/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Re-read .env tolerantly: recovers values dotenv drops (duplicate keys, a
// value on the next line, .env.txt, UTF-16) and repairs the file in place.
const env = loadEnv();
for (const note of env.repairs) logger.warn(`.env: ${note}`);

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  logger.error('DISCORD_TOKEN is not set.');
  // The loader above already searched every .env-ish file in the folder and
  // found no usable token anywhere, so show exactly what IS here rather than
  // pointing at a line number in a file that may not be the one being edited.
  try {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const here = process.cwd();
    const files = readdirSync(here).filter((f) => {
      const l = f.toLowerCase();
      return l === 'env' || l.startsWith('.env') || l.startsWith('env.') || l.startsWith('env ');
    });

    console.error(`\n  Looked in: ${here}`);
    if (files.length === 0) {
      console.error('\n  There is no .env file here at all.');
      console.error('  Run:  npm run doctor    (it creates one for you)\n');
    } else {
      console.error('\n  Config files found here:');
      for (const f of files) {
        let size = 0;
        try {
          size = statSync(join(here, f)).size;
        } catch {
          /* ignore */
        }
        const note = f.toLowerCase() === '.env.example' ? '  (template — do not edit)' : '';
        console.error(`    ${f}  (${size} bytes)${note}`);
      }
      console.error('\n  None of them contain a bot token.');
      console.error('\n  Skip the text editor — paste your token straight in with:');
      console.error('\n    npm run set-token -- PASTE_YOUR_TOKEN_HERE\n');
      console.error('  To see exactly what your .env contains right now:');
      console.error('\n    npm run show-env\n');
      console.error('  Token comes from: Discord Developer Portal → your app → Bot → Reset Token.\n');
    }
  } catch {
    console.error('\n  Run:  npm run doctor\n');
  }
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
  allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
});

client.logger = logger;
client.commands = new Collection();

/* ------------------------------ loaders ----------------------------- */

async function loadCommands() {
  const dir = join(__dirname, 'commands');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    if (!mod.data || !mod.execute) {
      logger.warn(`commands/${file} has no data/execute export — skipped`);
      continue;
    }
    client.commands.set(mod.data.name, mod);
  }
  logger.info(`Loaded ${client.commands.size} commands: ${[...client.commands.keys()].map((n) => `/${n}`).join(' ')}`);
}

async function loadEvents() {
  const dir = join(__dirname, 'events');
  let n = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    if (!mod.name || !mod.execute) continue;
    if (mod.once) client.once(mod.name, (...args) => mod.execute(...args, client));
    else client.on(mod.name, (...args) => mod.execute(...args, client));
    n++;
  }
  logger.info(`Loaded ${n} event handlers`);
}

/* ------------------------------- boot ------------------------------- */

process.on('unhandledRejection', (err) => logger.error('unhandledRejection', err));
process.on('uncaughtException', (err) => logger.error('uncaughtException', err));

const shutdown = (signal) => {
  logger.warn(`${signal} received — shutting down`);
  client.destroy();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

logger.info(`Starting ${BRAND.name}…`);
await loadCommands();
await loadEvents();
await client.login(token);
