/**
 * Tolerant .env loading.
 *
 * A plain `dotenv.config()` fails in several ways that look, to a person
 * staring at the file, exactly like "it's all filled in":
 *
 *   - the file got saved as `.env.txt` (Notepad appends it; Windows hides it)
 *   - the file got saved as UTF-16 ("Unicode" in Notepad) - unreadable
 *   - the value was pasted ABOVE the template's own blank `KEY=` line, so the
 *     later blank line overwrites it and the key ends up empty
 *   - the value was pasted on the line below the key
 *   - the line is still commented out
 *
 * This module reads the file itself, repairs what it safely can, and takes the
 * first NON-EMPTY value for each key instead of blindly letting the last line
 * win. The bot then starts instead of lecturing the user.
 *
 * Anything already set in the real environment (shell export, hosting panel)
 * still takes priority - that's how deployments configure things.
 */
import { existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/** Keys the bot cares about. */
const KEYS = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'PATREON_URL', 'DATABASE_PATH', 'PORT'];

/**
 * Values that are still the template, not a real secret.
 * Deliberately broad: `your_bot_token_here`, `YOUR TOKEN`, `paste-id-here`,
 * `xxxxx`, `changeme`, `<token>`, `...`
 */
const PLACEHOLDER =
  /^(?:(?:your|my|the|a|insert|paste|put|add|enter)[\s_-]+)*(?:discord[\s_-]*)?(?:bot[\s_-]*)?(?:token|client[\s_-]*id|application[\s_-]*id|guild[\s_-]*id|server[\s_-]*id|id|secret|key)(?:[\s_-]*(?:goes)?[\s_-]*here)?$|^(?:x{3,}|\.{2,}|-{2,}|_{2,}|changeme|todo|tbd|none|null|n\/a)$/i;

/** Strip wrappers and stray punctuation people leave around a pasted value. */
function clean(value) {
  let v = value.trim();
  v = v.replace(/\s+#.*$/, ''); // trailing comment
  // matching quotes, including curly ones pasted from chat apps / docs
  const pairs = [
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
    ['\u201C', '\u201D'],
    ['\u2018', '\u2019'],
    ['<', '>'],
    ['[', ']'],
    ['(', ')'],
  ];
  let changed = true;
  while (changed) {
    changed = false;
    const before = v;
    v = v.replace(/[;,]+$/, '').trim(); // stray semicolon / comma
    if (v !== before) changed = true;
    for (const [open, close] of pairs) {
      if (v.length > 1 && v.startsWith(open) && v.endsWith(close)) {
        v = v.slice(1, -1).trim();
        changed = true;
      }
    }
  }
  return v;
}

function isUsable(value) {
  const v = clean(value);
  return v !== '' && !PLACEHOLDER.test(v);
}

/** UTF-16 detection - dotenv cannot read those files at all. */
function decode(buf) {
  let encoding = 'utf8';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) encoding = 'utf16le';
  else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) encoding = 'utf16be';
  else {
    const sample = buf.subarray(0, 200);
    const nulls = sample.filter((b) => b === 0).length;
    if (sample.length > 8 && nulls > sample.length / 4) encoding = 'utf16le';
  }
  const text = (encoding === 'utf8' ? buf.toString('utf8') : buf.toString('utf16le')).replace(/^\uFEFF/, '');
  return { text, encoding };
}

/**
 * Parse, taking the FIRST usable value per key.
 * Also recovers a value that was pasted on the line after `KEY=`.
 */
export function parseEnvText(text) {
  const out = {};
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.*)$/);
    if (!m) continue;

    const key = m[1];
    let value = m[2];

    // "KEY=" with the value on the next line
    if (clean(value) === '') {
      const next = (lines[i + 1] ?? '').trim();
      const nextIsKey = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*[=:]/.test(next);
      if (next && !next.startsWith('#') && !nextIsKey) value = next;
    }

    if (!isUsable(value)) continue;
    if (out[key] === undefined) out[key] = clean(value); // first usable wins
  }

  return out;
}

/** Files people end up with instead of `.env`. */
function findStray(dir) {
  const candidates = [];
  try {
    for (const entry of readdirSync(dir)) {
      const lower = entry.toLowerCase();
      if (entry === '.env' || entry === '.env.example') continue;
      if (lower === 'env' || lower === 'env.txt' || lower.startsWith('.env')) {
        const p = join(dir, entry);
        if (statSync(p).isFile()) candidates.push({ name: entry, path: p });
      }
    }
  } catch {
    /* ignore */
  }
  // Prefer one that actually contains a token.
  candidates.sort((a, b) => scoreFile(b.path) - scoreFile(a.path));
  return candidates[0] ?? null;
}

function scoreFile(path) {
  try {
    const { text } = decode(readFileSync(path));
    const parsed = parseEnvText(text);
    return (parsed.DISCORD_TOKEN ? 2 : 0) + (parsed.CLIENT_ID ? 1 : 0);
  } catch {
    return 0;
  }
}

/**
 * Load .env into process.env, repairing what we safely can.
 * @returns {{loaded: string[], repairs: string[], path: string|null}}
 */
export function loadEnv({ dir = process.cwd(), repair = true } = {}) {
  const repairs = [];
  let path = resolve(dir, '.env');

  // 1. Wrong filename (.env.txt etc.)
  if (!existsSync(path)) {
    const stray = findStray(dir);
    if (stray && scoreFile(stray.path) > 0) {
      if (repair) {
        try {
          renameSync(stray.path, path);
          repairs.push(`renamed "${stray.name}" to ".env" (Windows hides file extensions, so Notepad likely saved it as a .txt)`);
        } catch {
          path = stray.path; // can't rename - read it where it is
          repairs.push(`reading your settings from "${stray.name}"; rename it to ".env" when you can`);
        }
      } else {
        path = stray.path;
      }
    } else {
      return { loaded: [], repairs, path: null };
    }
  }

  // 2. Read + decode
  let buf;
  try {
    buf = readFileSync(path);
  } catch {
    return { loaded: [], repairs, path: null };
  }
  const { text, encoding } = decode(buf);

  if (encoding !== 'utf8' && repair) {
    try {
      writeFileSync(path, text, 'utf8');
      repairs.push('converted .env from UTF-16 to UTF-8 (Notepad\'s "Unicode" option saves files the bot cannot read)');
    } catch {
      repairs.push('your .env is UTF-16; re-save it as UTF-8');
    }
  }

  // 3. Parse, first usable value wins
  const parsed = parseEnvText(text);
  const loaded = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] !== undefined && process.env[key] !== '') continue; // real env wins
    process.env[key] = value;
    if (KEYS.includes(key)) loaded.push(key);
  }

  // 4. Tell the user if the file has a duplicate key that would have broken it
  for (const key of KEYS) {
    const assignments = [...text.matchAll(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*[=:](.*)$`, 'gm'))].map((m) => m[1]);
    if (assignments.length > 1 && parsed[key]) {
      const blanks = assignments.filter((a) => !isUsable(a)).length;
      if (blanks > 0) repairs.push(`${key} appears ${assignments.length} times in .env — used the filled-in one, ignored ${blanks} blank`);
    }
  }

  return { loaded, repairs, path };
}
