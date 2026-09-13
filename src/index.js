import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { logger } from './lib/logger.js';
import { BRAND } from './config/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_TOKEN;
if (!token) {
  logger.error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
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
