/**
 * Writes a value straight into .env, bypassing Notepad entirely.
 *
 *   npm run set-token -- MTIzNDU2Nzg5...your.real.token
 *   npm run set-token -- --client-id 123456789012345678
 *   npm run set-token -- --guild-id 987654321098765432
 *
 * Every .env problem so far has come from the editor, not the value: the file
 * saved as .env.txt, saved as UTF-16, the key renamed, the value pasted next
 * to a blank duplicate. Writing the file programmatically avoids all of it.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const bold = (s) => `\u001b[1m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const green = (s) => `\u001b[32m${s}\u001b[0m`;
const dim = (s) => `\u001b[90m${s}\u001b[0m`;

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  console.log(`
${bold('Set a value in .env without opening a text editor')}

  npm run set-token -- YOUR_TOKEN_HERE
  npm run set-token -- --client-id 123456789012345678
  npm run set-token -- --guild-id 987654321098765432

${dim('Paste the token exactly as copied from the Discord Developer Portal.')}
`);
  process.exit(0);
}

let key = 'DISCORD_TOKEN';
let value = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--client-id' || a === '--clientid') {
    key = 'CLIENT_ID';
    value = argv[++i];
  } else if (a === '--guild-id' || a === '--guildid' || a === '--server-id') {
    key = 'GUILD_ID';
    value = argv[++i];
  } else if (a === '--token') {
    key = 'DISCORD_TOKEN';
    value = argv[++i];
  } else if (!a.startsWith('-')) {
    value = a;
  }
}

if (!value) {
  console.error(red('\n  No value given.\n'));
  console.error('  Example:  npm run set-token -- MTIzNDU2Nzg5MDEyMzQ1Njc4.GxYzAb.aBcDeF\n');
  process.exit(1);
}

// Strip anything a shell or a copy/paste may have wrapped around it.
value = value.trim().replace(/^["'\u201C\u2018<[(]+/, '').replace(/["'\u201D\u2019>\])]+$/, '').replace(/[;,]+$/, '').trim();

if (key === 'DISCORD_TOKEN') {
  if (value.toLowerCase().startsWith('bot ')) {
    value = value.slice(4).trim();
    console.log(dim('  (removed the "Bot " prefix - the library adds it)'));
  }
  const parts = value.split('.');
  if (parts.length !== 3) {
    console.error(red(`\n  That does not look like a bot token.`));
    console.error(`  A token has three parts separated by dots:  ${dim('aaaa.bbbb.cccc')}`);
    console.error(`  You gave ${parts.length} part(s), ${value.length} characters.\n`);
    console.error('  Copy it from: Developer Portal -> your app -> Bot -> Reset Token.\n');
    process.exit(1);
  }
} else if (!/^\d{17,20}$/.test(value)) {
  console.error(red(`\n  ${key} should be a 17-20 digit number.`));
  console.error(`  You gave: ${value}\n`);
  process.exit(1);
}

const envPath = resolve(process.cwd(), '.env');
const examplePath = resolve(process.cwd(), '.env.example');

if (!existsSync(envPath)) {
  if (existsSync(examplePath)) copyFileSync(examplePath, envPath);
  else writeFileSync(envPath, '', 'utf8');
}

let text = readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');

// Replace every existing assignment of this key (any spelling), then ensure
// exactly one correct line remains - duplicates are what caused earlier bugs.
const anySpelling = new RegExp(
  `^[ \\t]*(?:export[ \\t]+)?(?:${key}|${key.replace(/_/g, '[ \\t-]?')})[ \\t]*[=:].*$`,
  'gim'
);

let replaced = false;
text = text.replace(anySpelling, () => {
  if (replaced) return '\u0000DELETE\u0000'; // mark extra duplicates for removal
  replaced = true;
  return `${key}=${value}`;
});
text = text
  .split(/\r?\n/)
  .filter((l) => l !== '\u0000DELETE\u0000')
  .join('\n');

if (!replaced) {
  if (text.length && !text.endsWith('\n')) text += '\n';
  text += `${key}=${value}\n`;
}

writeFileSync(envPath, text, 'utf8');

const shown = value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
console.log(green(`\n  ✓ ${key} written to .env`) + dim(`  ${shown}  (${value.length} chars)`));
console.log(dim(`    ${envPath}\n`));
console.log(`  Next: ${bold('npm start')}\n`);
