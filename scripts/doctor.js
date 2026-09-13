#!/usr/bin/env node
/**
 * Pre-flight check: `npm run doctor`
 *
 * Verifies Node version, dependencies, .env contents, the database driver and
 * the token itself BEFORE you try to start the bot, so problems show up as a
 * clear checklist instead of a stack trace.
 */
import dotenv from 'dotenv';
import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

dotenv.config({ quiet: true });

const c = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', gray: '\x1b[90m', bold: '\x1b[1m' };
const ok = (m, d) => console.log(`${c.green}  ✓${c.reset} ${m}${d ? `${c.gray}  ${d}${c.reset}` : ''}`);
const bad = (m, d) => {
  console.log(`${c.red}  ✗${c.reset} ${m}${d ? `\n     ${c.gray}${d}${c.reset}` : ''}`);
  failures++;
};
const warn = (m, d) => {
  console.log(`${c.yellow}  !${c.reset} ${m}${d ? `\n     ${c.gray}${d}${c.reset}` : ''}`);
  warnings++;
};

let failures = 0;
let warnings = 0;

console.log(`\n${c.bold}OPB Giveaways — setup check${c.reset}\n`);

/* ------------------------------- node ------------------------------- */
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 5)) ok(`Node ${process.version}`);
else if (major >= 20) warn(`Node ${process.version} — no built-in SQLite`, 'Either upgrade to Node 22 LTS (https://nodejs.org) or run: npm install better-sqlite3');
else bad(`Node ${process.version} is too old`, 'Install Node 22 LTS from https://nodejs.org');

/* --------------------------- dependencies --------------------------- */
if (existsSync(resolve('node_modules/discord.js'))) {
  const v = JSON.parse(readFileSync(resolve('node_modules/discord.js/package.json'), 'utf8')).version;
  const dmajor = Number(v.split('.')[0]);
  const dminor = Number(v.split('.')[1]);
  if (dmajor > 14 || (dmajor === 14 && dminor >= 27)) ok(`discord.js ${v}`);
  else warn(`discord.js ${v}`, 'The giveaway panel needs 14.27+ for the in-modal role picker. Run: npm install discord.js@latest');
} else {
  bad('Dependencies not installed', 'Run: npm install');
}

/* ------------------------------ driver ------------------------------ */
try {
  const { driver } = await import('../src/lib/db.js');
  ok(`SQLite driver: ${driver}`, driver === 'node:sqlite' ? '(built in — nothing to compile)' : '(external native module)');
} catch (err) {
  bad('No working SQLite driver', err.message.split('\n').slice(0, 4).join('\n     '));
}

/* -------------------------------- env ------------------------------- */
// Be helpful rather than pedantic: if .env is missing but the template is
// there, just create it. Telling a Windows user to run `cp` is useless.
if (!existsSync(resolve('.env'))) {
  if (existsSync(resolve('.env.example'))) {
    try {
      copyFileSync(resolve('.env.example'), resolve('.env'));
      warn('.env was missing — I created it from .env.example', 'Open .env in a text editor and paste in your DISCORD_TOKEN and CLIENT_ID, then run this again.');
      // Reload so the checks below see the (still empty) values.
      dotenv.config({ path: resolve('.env'), override: true, quiet: true });
    } catch (err) {
      bad('.env is missing and I could not create it', `${err.message}\n     Copy .env.example to .env by hand.`);
    }
  } else {
    bad('.env and .env.example are both missing', 'Re-clone the repository — something got deleted.');
  }
} else {
  ok('.env file found');
}

const token = process.env.DISCORD_TOKEN?.trim();
const clientId = process.env.CLIENT_ID?.trim();

if (!token || token === 'your_bot_token_here') {
  bad('DISCORD_TOKEN is not set', 'Discord Developer Portal → your app → Bot → Reset Token');
} else if (token.split('.').length !== 3) {
  bad('DISCORD_TOKEN looks malformed', 'A bot token has three dot-separated parts. Did you paste the Client Secret by mistake?');
} else {
  ok('DISCORD_TOKEN present', `${token.slice(0, 6)}…${token.slice(-4)}`);
}

if (!clientId || clientId === 'your_application_id_here') {
  bad('CLIENT_ID is not set', 'Developer Portal → General Information → Application ID');
} else if (!/^\d{17,20}$/.test(clientId)) {
  bad('CLIENT_ID should be a 17-20 digit number', `Got: ${clientId}`);
} else {
  ok('CLIENT_ID present', clientId);
}

const guildId = process.env.GUILD_ID?.trim();
if (!guildId) warn('GUILD_ID is empty', 'Commands will register globally and can take up to 1 hour to appear. Set GUILD_ID for instant testing.');
else if (!/^\d{17,20}$/.test(guildId)) bad('GUILD_ID should be a 17-20 digit number', `Got: ${guildId}`);
else ok('GUILD_ID present', guildId);

/* ------------------------- live token check ------------------------- */
if (token && token.split('.').length === 3) {
  process.stdout.write(`${c.gray}  … checking the token with Discord${c.reset}\r`);
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const me = await res.json();
      ok(`Token valid — logged in as ${me.username}`, `id ${me.id}`);
      if (clientId && me.id !== clientId) {
        bad('CLIENT_ID does not match the bot token', `Token belongs to ${me.id}, but CLIENT_ID is ${clientId}`);
      }
    } else if (res.status === 401) {
      bad('Discord rejected the token (401)', 'Reset it in the Developer Portal and paste the new one into .env');
    } else {
      warn(`Discord returned HTTP ${res.status}`, 'Could not verify the token right now.');
    }
  } catch (err) {
    warn('Could not reach Discord', `${err.message}. Check your internet connection or firewall.`);
  }
}

/* ------------------------------ summary ----------------------------- */
console.log();
if (failures === 0 && warnings === 0) {
  console.log(`${c.green}${c.bold}All good.${c.reset} Next: ${c.bold}npm run deploy${c.reset} then ${c.bold}npm start${c.reset}\n`);
} else if (failures === 0) {
  console.log(`${c.yellow}${c.bold}Ready, with ${warnings} warning(s).${c.reset} Next: ${c.bold}npm run deploy${c.reset} then ${c.bold}npm start${c.reset}\n`);
} else {
  console.log(`${c.red}${c.bold}${failures} problem(s) to fix${c.reset}${warnings ? ` and ${warnings} warning(s)` : ''}. See above.\n`);
  process.exitCode = 1;
}
