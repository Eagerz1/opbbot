/**
 * Prints exactly what is in your .env, with the secret values masked.
 *
 *   npm run show-env
 *
 * This exists because "it's filled in" and "the bot can't see it" can both be
 * true at once, and guessing why wastes everyone's time. It shows the real
 * bytes on disk so there is nothing left to infer.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.cwd();
const bold = (s) => `\u001b[1m${s}\u001b[0m`;
const dim = (s) => `\u001b[90m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const green = (s) => `\u001b[32m${s}\u001b[0m`;

console.log(`\n${bold('What is actually in your config files')}\n`);
console.log(`Folder: ${dir}\n`);

const files = readdirSync(dir).filter((f) => {
  const l = f.toLowerCase();
  return l === 'env' || l.startsWith('.env') || l.startsWith('env.') || l.startsWith('env ');
});

if (files.length === 0) {
  console.log(red('  No .env file here at all.'));
  console.log('  Run:  npm run doctor\n');
  process.exit(0);
}

/** Mask a secret so it can be pasted into chat safely. */
function mask(v) {
  if (v.length <= 12) return `${v.slice(0, 2)}…${v.slice(-2)}  (${v.length} chars)`;
  return `${v.slice(0, 6)}…${v.slice(-4)}  (${v.length} chars)`;
}

for (const name of files) {
  const path = join(dir, name);
  const size = statSync(path).size;
  const buf = readFileSync(path);

  let enc = 'UTF-8';
  if (buf[0] === 0xff && buf[1] === 0xfe) enc = 'UTF-16LE';
  else if (buf[0] === 0xfe && buf[1] === 0xff) enc = 'UTF-16BE';
  const text = enc === 'UTF-8' ? buf.toString('utf8').replace(/^\uFEFF/, '') : buf.toString('utf16le');

  console.log(bold(`── ${name}`) + dim(`  ${size} bytes, ${enc}`));

  const lines = text.split(/\r?\n/);
  let shown = 0;
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_ -]*?)\s*[=:](.*)$/);
    if (!m) return;
    shown++;
    const key = m[1];
    const value = m[2].trim();
    const n = String(i + 1).padStart(3);
    if (value === '') console.log(`  ${n}  ${key}=${red('  <-- EMPTY, nothing after the =')}`);
    else console.log(`  ${n}  ${key}=${green(mask(value))}`);
  });
  if (shown === 0) console.log(red('       (no settings lines at all)'));
  console.log();
}

console.log(dim('Values are masked - safe to paste into chat.\n'));
