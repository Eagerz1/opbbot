/**
 * Tests for the tolerant .env loader (src/lib/env.js).
 *
 * These cover the ways a .env that *looks* correctly filled in still fails to
 * load - the duplicate-key case in particular, where a leftover blank
 * `KEY=` line further down the file silently wipes a real pasted value.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv, parseEnvText } from '../src/lib/env.js';

let dir;
const KEYS = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'PATREON_URL', 'DATABASE_PATH', 'PORT'];
let saved;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'envload-'));
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const write = (name, text, enc = 'utf8') => writeFileSync(join(dir, name), text, enc);

describe('parseEnvText', () => {
  test('parses a normal file', () => {
    const r = parseEnvText('DISCORD_TOKEN=abc.def.ghi\nCLIENT_ID=123456789012345678\n');
    assert.equal(r.DISCORD_TOKEN, 'abc.def.ghi');
    assert.equal(r.CLIENT_ID, '123456789012345678');
  });

  test('first usable value wins when a blank duplicate follows', () => {
    // dotenv would return "" here - the whole point of this module
    const r = parseEnvText('DISCORD_TOKEN=real.tok.en\n\n# template\nDISCORD_TOKEN=\n');
    assert.equal(r.DISCORD_TOKEN, 'real.tok.en');
  });

  test('blank line first, real value below still works', () => {
    const r = parseEnvText('DISCORD_TOKEN=\nDISCORD_TOKEN=real.tok.en\n');
    assert.equal(r.DISCORD_TOKEN, 'real.tok.en');
  });

  test('first of two real values wins (top of file is what the user edited)', () => {
    const r = parseEnvText('DISCORD_TOKEN=first.tok.en\nDISCORD_TOKEN=second.tok.en\n');
    assert.equal(r.DISCORD_TOKEN, 'first.tok.en');
  });

  test('recovers a value left on the following line', () => {
    const r = parseEnvText('DISCORD_TOKEN=\nreal.tok.en\nCLIENT_ID=123456789012345678\n');
    assert.equal(r.DISCORD_TOKEN, 'real.tok.en');
    assert.equal(r.CLIENT_ID, '123456789012345678');
  });

  test('does not steal the next KEY= line as a value', () => {
    const r = parseEnvText('DISCORD_TOKEN=\nCLIENT_ID=123456789012345678\n');
    assert.equal(r.DISCORD_TOKEN, undefined);
    assert.equal(r.CLIENT_ID, '123456789012345678');
  });

  test('ignores commented lines', () => {
    const r = parseEnvText('#DISCORD_TOKEN=commented.out\nDISCORD_TOKEN=real.tok.en\n');
    assert.equal(r.DISCORD_TOKEN, 'real.tok.en');
  });

  test('strips quotes, curly quotes, brackets and trailing semicolons', () => {
    assert.equal(parseEnvText('K="a.b.c"\n').K, 'a.b.c');
    assert.equal(parseEnvText('K=\u201Ca.b.c\u201D;\n').K, 'a.b.c');
    assert.equal(parseEnvText('K=<a.b.c>\n').K, 'a.b.c');
    assert.equal(parseEnvText('K=[a.b.c],\n').K, 'a.b.c');
  });

  test('accepts export and colon syntax', () => {
    assert.equal(parseEnvText('export DISCORD_TOKEN=a.b.c\n').DISCORD_TOKEN, 'a.b.c');
    assert.equal(parseEnvText('DISCORD_TOKEN: a.b.c\n').DISCORD_TOKEN, 'a.b.c');
  });

  test('treats template placeholders as not filled in', () => {
    for (const ph of [
      'your_bot_token_here',
      'YOUR TOKEN HERE',
      'paste your token here',
      'insert your client id here',
      '<token>',
      'xxxxxxxx',
      'changeme',
      'TODO',
    ]) {
      assert.equal(parseEnvText(`DISCORD_TOKEN=${ph}\n`).DISCORD_TOKEN, undefined, `should reject: ${ph}`);
    }
  });

  test('does not mistake a real token for a placeholder', () => {
    const real = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.GaBcDe.abcDEF-123_xyz';
    assert.equal(parseEnvText(`DISCORD_TOKEN=${real}\n`).DISCORD_TOKEN, real);
  });

  test('handles CRLF line endings', () => {
    const r = parseEnvText('DISCORD_TOKEN=a.b.c\r\nCLIENT_ID=123456789012345678\r\n');
    assert.equal(r.DISCORD_TOKEN, 'a.b.c');
    assert.equal(r.CLIENT_ID, '123456789012345678');
  });
});

describe('loadEnv', () => {
  test('recovers the reported bug: values pasted above the blank template lines', () => {
    write(
      '.env',
      [
        'DISCORD_TOKEN=MTIzNDU2.GaBcDe.realtoken',
        'CLIENT_ID=123456789012345678',
        'GUILD_ID=987654321098765432',
        '',
        '# --- REQUIRED ---',
        'DISCORD_TOKEN=',
        'CLIENT_ID=',
        'GUILD_ID=',
        '',
      ].join('\n')
    );
    const r = loadEnv({ dir });
    assert.equal(process.env.DISCORD_TOKEN, 'MTIzNDU2.GaBcDe.realtoken');
    assert.equal(process.env.CLIENT_ID, '123456789012345678');
    assert.equal(process.env.GUILD_ID, '987654321098765432');
    assert.ok(r.repairs.some((m) => m.includes('DISCORD_TOKEN') && m.includes('2 times')));
  });

  test('renames a stray .env.txt and loads it', () => {
    write('.env.txt', 'DISCORD_TOKEN=MTIzNDU2.GaBcDe.realtoken\n');
    const r = loadEnv({ dir });
    assert.equal(process.env.DISCORD_TOKEN, 'MTIzNDU2.GaBcDe.realtoken');
    assert.ok(existsSync(join(dir, '.env')));
    assert.ok(!existsSync(join(dir, '.env.txt')));
    assert.ok(r.repairs.some((m) => m.includes('renamed')));
  });

  test('converts a UTF-16 .env to UTF-8 on disk', () => {
    write('.env', 'DISCORD_TOKEN=MTIzNDU2.GaBcDe.realtoken\n', 'utf16le');
    const r = loadEnv({ dir });
    assert.equal(process.env.DISCORD_TOKEN, 'MTIzNDU2.GaBcDe.realtoken');
    const buf = readFileSync(join(dir, '.env'));
    assert.notEqual(buf[1], 0x00, 'file should no longer be UTF-16');
    assert.ok(r.repairs.some((m) => m.includes('UTF-16')));
  });

  test('never overwrites a value already in the real environment', () => {
    process.env.DISCORD_TOKEN = 'from.the.shell';
    write('.env', 'DISCORD_TOKEN=from.the.file\n');
    loadEnv({ dir });
    assert.equal(process.env.DISCORD_TOKEN, 'from.the.shell');
  });

  test('an empty env var IS replaced by the file value', () => {
    process.env.DISCORD_TOKEN = '';
    write('.env', 'DISCORD_TOKEN=from.the.file\n');
    loadEnv({ dir });
    assert.equal(process.env.DISCORD_TOKEN, 'from.the.file');
  });

  test('reports nothing loaded when there is no .env at all', () => {
    const r = loadEnv({ dir });
    assert.equal(r.path, null);
    assert.deepEqual(r.loaded, []);
    assert.equal(process.env.DISCORD_TOKEN, undefined);
  });

  test('leaves an untouched template alone rather than loading placeholders', () => {
    write('.env', 'DISCORD_TOKEN=\nCLIENT_ID=\nGUILD_ID=\n');
    loadEnv({ dir });
    assert.equal(process.env.DISCORD_TOKEN, undefined);
  });

  test('does not adopt .env.example as the config file', () => {
    write('.env.example', 'DISCORD_TOKEN=MTIzNDU2.GaBcDe.realtoken\n');
    const r = loadEnv({ dir });
    assert.equal(r.path, null);
    assert.equal(process.env.DISCORD_TOKEN, undefined);
    assert.ok(existsSync(join(dir, '.env.example')));
  });

  test('repair:false still reads a stray file without renaming it', () => {
    write('.env.txt', 'DISCORD_TOKEN=MTIzNDU2.GaBcDe.realtoken\n');
    loadEnv({ dir, repair: false });
    assert.equal(process.env.DISCORD_TOKEN, 'MTIzNDU2.GaBcDe.realtoken');
    assert.ok(existsSync(join(dir, '.env.txt')), 'stray file should be left in place');
  });

  test('is idempotent - a second run is clean', () => {
    write('.env', 'DISCORD_TOKEN=MTIzNDU2.GaBcDe.realtoken\nDISCORD_TOKEN=\n');
    loadEnv({ dir });
    delete process.env.DISCORD_TOKEN;
    const second = loadEnv({ dir });
    assert.equal(process.env.DISCORD_TOKEN, 'MTIzNDU2.GaBcDe.realtoken');
    assert.equal(second.path, join(dir, '.env'));
  });
});
