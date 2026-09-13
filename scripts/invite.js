/**
 * Prints the invite link for this bot.
 *
 *   npm run invite              Administrator (recommended - /setup needs it)
 *   npm run invite -- --minimal only the permissions the bot actually uses
 *
 * Uses CLIENT_ID from .env. If that isn't set, it asks Discord for the
 * application ID using the bot token, so it works either way.
 */
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { loadEnv } from '../src/lib/env.js';
import { buildInviteUrl, fetchApplicationId, REQUIRED_PERMISSIONS } from '../src/lib/invite.js';

loadEnv();

const bold = (s) => `\u001b[1m${s}\u001b[0m`;
const cyan = (s) => `\u001b[36m${s}\u001b[0m`;
const dim = (s) => `\u001b[90m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;

const minimal = process.argv.includes('--minimal');

let clientId = process.env.CLIENT_ID?.trim();

// No CLIENT_ID? Ask Discord - the token identifies the application.
if (!clientId) {
  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token) {
    console.error(red('\n  Neither CLIENT_ID nor DISCORD_TOKEN is set.\n'));
    console.error('  Set one with:');
    console.error('    npm run set-token -- YOUR_TOKEN\n');
    process.exit(1);
  }
  try {
    clientId = await fetchApplicationId(token);
    console.log(dim(`\n  (looked up application ID from your token: ${clientId})`));
  } catch (err) {
    console.error(red(`\n  ${err.message}\n`));
    if (err.message.includes('401')) {
      console.error('  Then:  npm run set-token -- YOUR_NEW_TOKEN\n');
    }
    process.exit(1);
  }
}

const url = buildInviteUrl(clientId, { admin: !minimal });

console.log('');
console.log(bold('  Invite link — open this and pick your server:'));
console.log('');
console.log('  ' + cyan(url));
console.log('');
if (minimal) {
  console.log(dim(`  Permissions: ${REQUIRED_PERMISSIONS.join(', ')}`));
} else {
  console.log(dim('  Permissions: Administrator'));
  console.log(dim('  For the narrower set instead:  npm run invite -- --minimal'));
}
console.log('');
console.log(bold('  After it joins:'));
console.log('   1. Server Settings \u2192 Roles \u2192 drag ' + bold('OPB Giveaways') + ' to the very top');
console.log(dim('      (Discord blocks a bot from managing roles above its own)'));
console.log('   2. Run ' + bold('npm run deploy') + ' if you have not already');
console.log('   3. Type ' + bold('/setup') + ' in your server');
console.log('');
