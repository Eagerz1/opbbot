#!/usr/bin/env node
/**
 * Pre-flight check: `npm run doctor`
 *
 * Verifies Node version, dependencies, .env contents, the database driver and
 * the token itself BEFORE you try to start the bot, so problems show up as a
 * clear checklist instead of a stack trace.
 */
import dotenv from 'dotenv';
import { existsSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diagnoseEnv, inspectKey, adoptStray } from './env-doctor.js';
import { loadEnv } from '../src/lib/env.js';

dotenv.config({ quiet: true });
const envLoad = loadEnv();

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
// Be helpful rather than pedantic. "TOKEN is not set" is useless when the user
// swears they set it — find out what actually went wrong.
const envInfo = diagnoseEnv(process.cwd());

if (!envInfo.exists) {
  // Did they save it under the wrong name? Notepad loves appending .txt,
  // and Windows hides the extension so the file *looks* correct.
  const stray = envInfo.strays[0];
  if (stray) {
    if (adoptStray(stray.path)) {
      warn(`Found "${stray.name}" and renamed it to ".env"`, 'Windows hides file extensions, so Notepad probably saved it as a .txt without telling you. Fixed — re-reading it now.');
      dotenv.config({ path: resolve('.env'), override: true, quiet: true });
      Object.assign(envInfo, diagnoseEnv(process.cwd()));
    } else {
      bad(`Your settings look like they're in "${stray.name}", not ".env"`, `Rename it to exactly ".env" (no .txt on the end).`);
    }
  } else if (existsSync(resolve('.env.example'))) {
    try {
      copyFileSync(resolve('.env.example'), resolve('.env'));
      warn('.env was missing — I created it from .env.example', 'Open .env in a text editor and paste in your DISCORD_TOKEN and CLIENT_ID, then run this again.');
      dotenv.config({ path: resolve('.env'), override: true, quiet: true });
      Object.assign(envInfo, diagnoseEnv(process.cwd()));
    } catch (err) {
      bad('.env is missing and I could not create it', `${err.message}\n     Copy .env.example to .env by hand.`);
    }
  } else {
    bad('.env and .env.example are both missing', `Are you in the right folder? You're in:\n     ${process.cwd()}\n     It should be the "opbbot" folder that contains package.json.`);
  }
} else {
  ok('.env file found', envInfo.envPath);
  for (const note of envLoad.repairs) warn(`.env: ${note}`);

  // Notepad's "Unicode" option writes UTF-16, which dotenv cannot read at all.
  // It's unambiguous and safe to repair, so just rewrite it as UTF-8.
  if (envInfo.encoding?.startsWith('utf16')) {
    try {
      writeFileSync(resolve('.env'), envInfo.raw, 'utf8');
      warn('.env was saved as UTF-16 — I converted it to UTF-8', 'Notepad\'s "Unicode" encoding can\'t be read by the bot. Fixed. (When saving in future, choose UTF-8.)');
      dotenv.config({ path: resolve('.env'), override: true, quiet: true });
      Object.assign(envInfo, diagnoseEnv(process.cwd()));
    } catch (err) {
      bad(
        '.env is saved as UTF-16 — none of its values can be read',
        `In Notepad: File → Save As → set "Encoding" to UTF-8 → overwrite .env.\n     (Could not fix automatically: ${err.message})`,
      );
    }
  }

  // An extra .env.txt lying around usually means they edited the wrong file.
  for (const stray of envInfo.strays) {
    warn(
      `There's also a file called "${stray.name}"`,
      'Any values in it have already been copied into ".env". You can delete the extra file.'
    );
  }
}

/** Report on one key, using the raw file to explain failures precisely. */
function checkKey(key, { required, validate, hint, describe }) {
  const value = process.env[key]?.trim();
  const detail = envInfo.raw ? inspectKey(envInfo.raw, key) : null;

  // Problems visible in the file itself, even when dotenv did load something
  // (brackets and smart quotes parse fine but are never a valid value).
  if (detail && ['commented', 'value-on-next-line', 'placeholder', 'brackets', 'smart-quotes'].includes(detail.status)) {
    bad(`${key} ${detail.status === 'commented' || detail.status === 'value-on-next-line' ? 'was not loaded' : 'looks wrong'}`, detail.detail);
    return null;
  }

  if (!value) {
    if (detail?.status === 'empty') {
      bad(`${key} is not set`, `${detail.detail} ${hint ? `\n     ${hint}` : ''}`);
      return null;
    }
    if (detail?.status === 'ok' && envInfo.encoding?.startsWith('utf16')) {
      return null; // already reported the encoding problem
    }
    if (required) bad(`${key} is not set`, hint);
    else warn(`${key} is empty`, hint);
    return null;
  }

  // Loaded, but is it sane?
  const problem = validate?.(value);
  if (problem) {
    bad(`${key} looks wrong`, problem);
    return null;
  }

  ok(`${key} present`, describe ? describe(value) : undefined);
  return value;
}

const token = checkKey('DISCORD_TOKEN', {
  required: true,
  hint: 'Discord Developer Portal → your app → Bot → Reset Token',
  validate: (v) => {
    if (v.toLowerCase().startsWith('bot ')) return 'Remove the "Bot " prefix — paste just the token itself.';
    if (v.split('.').length !== 3) {
      return `A bot token has three dot-separated parts; yours has ${v.split('.').length}. Did you paste the Client Secret or the Public Key by mistake? Use Bot → Reset Token.`;
    }
    return null;
  },
  describe: (v) => `${v.slice(0, 6)}…${v.slice(-4)}`,
});

const clientId = checkKey('CLIENT_ID', {
  required: true,
  hint: 'Developer Portal → General Information → Application ID',
  validate: (v) => (/^\d{17,20}$/.test(v) ? null : `Should be a 17-20 digit number, but got "${v}". That's the Application ID, not the app name.`),
  describe: (v) => v,
});

checkKey('GUILD_ID', {
  required: false,
  hint: 'Commands will register globally and can take up to 1 hour to appear. Set GUILD_ID for instant testing. (Discord → Settings → Advanced → Developer Mode, then right-click your server → Copy Server ID.)',
  validate: (v) => (/^\d{17,20}$/.test(v) ? null : `Should be a 17-20 digit number, but got "${v}".`),
  describe: (v) => v,
});

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

  // Privileged intents must be enabled or login fails outright, which shows up
  // in Discord as "the application did not respond".
  try {
    const res = await fetch('https://discord.com/api/v10/oauth2/applications/@me', {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const app = await res.json();
      const FLAG_MEMBERS = 1 << 14; // GATEWAY_GUILD_MEMBERS
      const FLAG_MEMBERS_LIMITED = 1 << 15;
      const FLAG_MESSAGES = 1 << 18; // GATEWAY_MESSAGE_CONTENT
      const FLAG_MESSAGES_LIMITED = 1 << 19;
      const flags = app.flags ?? 0;

      const members = Boolean(flags & (FLAG_MEMBERS | FLAG_MEMBERS_LIMITED));
      const messages = Boolean(flags & (FLAG_MESSAGES | FLAG_MESSAGES_LIMITED));

      if (members && messages) {
        ok('Privileged intents enabled', 'Server Members + Message Content');
      } else {
        const missing = [!members && 'SERVER MEMBERS INTENT', !messages && 'MESSAGE CONTENT INTENT'].filter(Boolean);
        bad(
          `Privileged intent(s) not enabled: ${missing.join(' and ')}`,
          'Developer Portal → your app → Bot → Privileged Gateway Intents → enable, then Save Changes. Without this the bot cannot log in, and Discord shows "the application did not respond".'
        );
      }
    }
  } catch {
    /* already warned about connectivity above */
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
