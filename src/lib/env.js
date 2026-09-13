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
 * Names people actually write, mapped to the name the bot reads.
 *
 * Env vars are case-sensitive, so `Discord_token=` loads a *different*
 * variable and the bot sees nothing. Nobody should have to know that, and
 * "token" / "bot token" are the obvious things to write. Normalisation is
 * by squashed lowercase, so DISCORD-TOKEN, discord token and discordToken
 * all land on DISCORD_TOKEN too.
 */
const ALIASES = {
  discordtoken: 'DISCORD_TOKEN',
  token: 'DISCORD_TOKEN',
  bottoken: 'DISCORD_TOKEN',
  discordbottoken: 'DISCORD_TOKEN',
  secret: 'DISCORD_TOKEN',
  clientid: 'CLIENT_ID',
  applicationid: 'CLIENT_ID',
  appid: 'CLIENT_ID',
  discordclientid: 'CLIENT_ID',
  guildid: 'GUILD_ID',
  serverid: 'GUILD_ID',
  discordguildid: 'GUILD_ID',
  patreonurl: 'PATREON_URL',
  patreon: 'PATREON_URL',
  databasepath: 'DATABASE_PATH',
  dbpath: 'DATABASE_PATH',
  database: 'DATABASE_PATH',
  port: 'PORT',
};

/** Map whatever the user typed onto the canonical key name. */
function canonicalKey(raw) {
  const squashed = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALIASES[squashed] ?? raw;
}

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

    // Key may be written with spaces or hyphens ("DISCORD TOKEN", "discord-token").
    const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_ -]*?)\s*[=:]\s*(.*)$/);
    if (!m) continue;

    const key = canonicalKey(m[1]);
    let value = m[2];

    // "KEY=" with the value on the next line
    if (clean(value) === '') {
      const next = (lines[i + 1] ?? '').trim();
      const nextIsKey = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_ -]*?\s*[=:]/.test(next);
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
      if (entry === '.env') continue; // handled separately as the canonical file
      // .env.txt, env.txt, env, .ENV, .env.local, .env.bak, "env - Copy.txt",
      // and .env.example (only ever used if it has real values typed into it)
      if (lower === 'env' || lower.startsWith('env.') || lower.startsWith('env ') || lower.startsWith('.env')) {
        const p = join(dir, entry);
        try {
          if (statSync(p).isFile()) {
            // .env.example is tracked in git - we may read values a user typed
            // into it by mistake, but must never rename or delete it.
            candidates.push({ name: entry, path: p, score: scoreFile(p), keep: lower === '.env.example' });
          }
        } catch {
          /* unreadable - skip */
        }
      }
    }
  } catch {
    /* ignore */
  }
  // Most real values first.
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/** How many of the important values a file actually supplies. */
function scoreFile(path) {
  try {
    const { text } = decode(readFileSync(path));
    const parsed = parseEnvText(text);
    return (parsed.DISCORD_TOKEN ? 2 : 0) + (parsed.CLIENT_ID ? 1 : 0) + (parsed.GUILD_ID ? 1 : 0);
  } catch {
    return 0;
  }
}

/**
 * Write values into an existing .env, filling its blank `KEY=` lines so the
 * file ends up genuinely correct rather than us papering over it every boot.
 */
function mergeIntoEnv(text, values) {
  let out = text;
  const added = [];
  for (const [key, value] of Object.entries(values)) {
    const blank = new RegExp(`^([ \\t]*(?:export[ \\t]+)?${key}[ \\t]*[=:])[ \\t]*$`, 'm');
    if (blank.test(out)) {
      out = out.replace(blank, `$1${value}`);
    } else if (!new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*[=:]`, 'm').test(out)) {
      if (!out.endsWith('\n')) out += '\n';
      out += `${key}=${value}\n`;
    } else {
      continue; // already has a real value
    }
    added.push(key);
  }
  return { text: out, added };
}

/**
 * Load .env into process.env, repairing what we safely can.
 * @returns {{loaded: string[], repairs: string[], path: string|null}}
 */
export function loadEnv({ dir = process.cwd(), repair = true } = {}) {
  const repairs = [];
  const path = resolve(dir, '.env');
  const exists = existsSync(path);

  // 1. Read .env (if any) and see what it actually supplies.
  let text = '';
  let encoding = 'utf8';
  if (exists) {
    try {
      const decoded = decode(readFileSync(path));
      text = decoded.text;
      encoding = decoded.encoding;
    } catch {
      /* unreadable - treat as empty */
    }
  }
  let parsed = parseEnvText(text);

  // 2. If .env is missing or still blank for the keys that matter, look at the
  //    neighbouring files. This is the common Windows case: `npm run doctor`
  //    creates a blank .env from the template while the values the user typed
  //    are sitting in ".env.txt" - Notepad appends .txt and Explorer hides it.
  const needed = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
  const missing = needed.filter((k) => !parsed[k]);

  if (missing.length > 0) {
    const better = findStray(dir).find((c) => c.score > 0 && missing.some((k) => !parsed[k]));

    if (better) {
      const { text: strayText } = decode(readFileSync(better.path));
      const strayValues = parseEnvText(strayText);
      const fill = {};
      for (const [k, v] of Object.entries(strayValues)) if (!parsed[k]) fill[k] = v;

      if (Object.keys(fill).length > 0) {
        if (!exists && repair && !better.keep) {
          // No real .env at all - just promote the file wholesale.
          try {
            renameSync(better.path, path);
            text = strayText;
            encoding = 'utf8';
            repairs.push(`your settings were in "${better.name}" — renamed it to ".env" (Windows hides file extensions, so Notepad saved it as a .txt)`);
          } catch {
            text = strayText;
            repairs.push(`reading your settings from "${better.name}"`);
          }
        } else if (repair) {
          // A .env exists but is blank/partial - copy the values into it.
          const merged = mergeIntoEnv(text || '', fill);
          try {
            writeFileSync(path, merged.text, 'utf8');
            text = merged.text;
            encoding = 'utf8';
            repairs.push(
              better.keep
                ? `your values were typed into "${better.name}" instead of ".env" — copied ${merged.added.join(', ')} into .env`
                : `your .env was blank but "${better.name}" had your ${merged.added.join(', ')} — copied ${merged.added.length > 1 ? 'them' : 'it'} into .env`
            );
          } catch {
            text = merged.text;
            repairs.push(`using the values from "${better.name}"`);
          }
        } else {
          text = mergeIntoEnv(text || '', fill).text;
        }
        parsed = parseEnvText(text);
      }
    }
  }

  if (!exists && text === '') return { loaded: [], repairs, path: null };

  // 3. Notepad's "Unicode" encoding produces a file nothing can read.
  if (encoding !== 'utf8' && repair) {
    try {
      writeFileSync(path, text, 'utf8');
      repairs.push('converted .env from UTF-16 to UTF-8 (Notepad\'s "Unicode" option saves files the bot cannot read)');
    } catch {
      repairs.push('your .env is UTF-16; re-save it as UTF-8');
    }
  }

  // 4. Apply to the process. Anything already in the real environment wins.
  const loaded = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] !== undefined && process.env[key] !== '') continue; // real env wins
    process.env[key] = value;
    if (KEYS.includes(key)) loaded.push(key);
  }

  // 5. Rewrite misspelled key names in the file so it becomes correct on disk
  //    rather than relying on alias matching at every boot.
  if (repair && exists) {
    const renamed = [];
    let fixedText = text;
    const lines = fixedText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_ -]*?)\s*([=:])(.*)$/);
      if (!m) continue;
      const written = m[2];
      const canonical = canonicalKey(written);
      if (canonical !== written && KEYS.includes(canonical) && isUsable(m[4])) {
        lines[i] = `${m[1]}${canonical}=${m[4].trim()}`;
        renamed.push(`${written} → ${canonical}`);
      }
    }
    if (renamed.length > 0) {
      fixedText = lines.join('\n');
      try {
        writeFileSync(path, fixedText, 'utf8');
        text = fixedText;
        repairs.push(`renamed ${renamed.join(', ')} in .env (these names are case-sensitive)`);
      } catch {
        repairs.push(`your .env uses ${renamed.join(', ')} — the names are case-sensitive`);
      }
    }
  }

  // 6. Note duplicate keys that would otherwise have silently won.
  for (const key of KEYS) {
    const assignments = [...text.matchAll(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*[=:](.*)$`, 'gm'))].map((m) => m[1]);
    if (assignments.length > 1 && parsed[key]) {
      const blanks = assignments.filter((a) => !isUsable(a)).length;
      if (blanks > 0) repairs.push(`${key} appears ${assignments.length} times in .env — used the filled-in one, ignored ${blanks} blank`);
    }
  }

  return { loaded, repairs, path };
}
