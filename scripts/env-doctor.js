/**
 * Diagnoses WHY a .env value didn't load.
 *
 * "DISCORD_TOKEN is not set" is useless when the user swears they set it.
 * Almost always the file is fine and something mundane broke it:
 *   - Notepad saved it as `.env.txt` (Windows hides the real extension)
 *   - Notepad saved it as UTF-16 ("Unicode"), which dotenv can't read
 *   - the value was pasted on the line *below* the key
 *   - the line is still commented out with #
 *   - the placeholder / angle brackets / smart quotes were left in
 *   - they're running npm from the wrong folder
 *
 * This module finds those and reports the actual cause.
 */
import { existsSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/** Filenames people end up with instead of `.env`. */
const WRONG_NAMES = ['.env.txt', '.env.TXT', 'env', 'env.txt', '.env.env', '.ENV', '.env '];

export function findStrayEnvFiles(dir = process.cwd()) {
  const found = [];

  for (const name of WRONG_NAMES) {
    const p = join(dir, name);
    if (existsSync(p) && statSync(p).isFile()) found.push({ name, path: p });
  }

  // Anything that starts with ".env" but isn't .env / .env.example
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.toLowerCase().startsWith('.env')) continue;
      if (entry === '.env' || entry === '.env.example') continue;
      if (found.some((f) => f.name === entry)) continue;
      found.push({ name: entry, path: join(dir, entry) });
    }
  } catch {
    /* unreadable dir - nothing we can do */
  }

  return found;
}

/** Detect UTF-16 / UTF-32, which dotenv cannot parse. */
export function detectEncoding(buf) {
  if (buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le';
    if (buf[0] === 0xfe && buf[1] === 0xff) return 'utf16be';
  }
  // UTF-16 without a BOM shows up as interleaved NUL bytes in ASCII text.
  const sample = buf.subarray(0, 200);
  const nulls = sample.filter((b) => b === 0).length;
  if (sample.length > 8 && nulls > sample.length / 4) return 'utf16-no-bom';
  return 'utf8';
}

/**
 * Look for a key in the raw text and explain what's wrong with it.
 * @returns {{status: string, detail?: string, value?: string, line?: number}}
 */
export function inspectKey(raw, key) {
  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Commented out: "# DISCORD_TOKEN=..."
    const commented = trimmed.match(new RegExp(`^#\\s*(?:export\\s+)?${key}\\s*[=:]\\s*(.*)$`));
    if (commented) {
      const val = commented[1].trim();
      if (val && !isPlaceholder(val)) {
        return { status: 'commented', line: i + 1, value: val, detail: `Line ${i + 1} starts with "#", so it's treated as a comment. Delete the # at the start of that line.` };
      }
    }

    const m = trimmed.match(new RegExp(`^(?:export\\s+)?${key}\\s*[=:]\\s*(.*)$`));
    if (!m) continue;

    let val = m[1].trim();

    // Value sitting on the following line instead of after the =
    if (val === '') {
      const next = (lines[i + 1] ?? '').trim();
      if (next && !next.startsWith('#') && !/^[A-Z_]+\s*[=:]/.test(next)) {
        return {
          status: 'value-on-next-line',
          line: i + 1,
          value: next,
          detail: `Line ${i + 1} is "${key}=" with nothing after it, and line ${i + 2} has "${truncate(next)}". The value must be on the SAME line: ${key}=${truncate(next)}`,
        };
      }
      return { status: 'empty', line: i + 1, detail: `Line ${i + 1} is "${key}=" with no value after the "=".` };
    }

    if (isPlaceholder(val)) {
      return { status: 'placeholder', line: i + 1, value: val, detail: `Line ${i + 1} still has the template placeholder "${truncate(val)}". Replace it with your real value.` };
    }

    // Wrappers people leave in
    if (/^[<(\[].*[>)\]]$/.test(val)) {
      return { status: 'brackets', line: i + 1, value: val, detail: `Line ${i + 1} has brackets around the value: ${truncate(val)}. Remove them — paste the value bare.` };
    }
    if (/^[\u201C\u201D\u2018\u2019].*[\u201C\u201D\u2018\u2019]$/.test(val)) {
      return { status: 'smart-quotes', line: i + 1, value: val, detail: `Line ${i + 1} has curly “smart quotes” around the value (usually from Word or a chat app). Remove them.` };
    }

    return { status: 'ok', line: i + 1, value: val.replace(/^["']|["']$/g, '') };
  }

  return { status: 'missing', detail: `No line starting with "${key}=" was found in the file.` };
}

function isPlaceholder(v) {
  const s = v.toLowerCase().replace(/^["'<]|["'>]$/g, '');
  return (
    s === '' ||
    s.includes('your_bot_token') ||
    s.includes('your_application_id') ||
    s.includes('your_token') ||
    s.includes('paste') ||
    s === 'token' ||
    s === 'here'
  );
}

const truncate = (s, n = 40) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Full diagnosis of the env situation in `dir`.
 * @returns {{envPath: string|null, strays: object[], encoding: string|null, raw: string|null}}
 */
export function diagnoseEnv(dir = process.cwd()) {
  const envPath = resolve(dir, '.env');
  const exists = existsSync(envPath);
  let raw = null;
  let encoding = null;

  if (exists) {
    const buf = readFileSync(envPath);
    encoding = detectEncoding(buf);
    raw = (encoding.startsWith('utf16') ? buf.toString('utf16le') : buf.toString('utf8')).replace(/^\uFEFF/, '');
  }

  return { envPath, exists, raw, encoding, strays: findStrayEnvFiles(dir) };
}

/** Rename a stray file (e.g. .env.txt) to .env. Returns true on success. */
export function adoptStray(strayPath, dir = process.cwd()) {
  const target = resolve(dir, '.env');
  if (existsSync(target)) return false;
  renameSync(strayPath, target);
  return true;
}
