import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { inspectKey, detectEncoding, findStrayEnvFiles, diagnoseEnv, adoptStray } = await import('../scripts/env-doctor.js');

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'opb-env-'));
  return dir;
}

/* --------------------------- inspectKey ----------------------------- */

test('a normal line is read correctly', () => {
  const r = inspectKey('DISCORD_TOKEN=abc.def.ghi\n', 'DISCORD_TOKEN');
  assert.equal(r.status, 'ok');
  assert.equal(r.value, 'abc.def.ghi');
});

test('quotes and spaces around the value are tolerated', () => {
  assert.equal(inspectKey('DISCORD_TOKEN = abc.def.ghi\n', 'DISCORD_TOKEN').value, 'abc.def.ghi');
  assert.equal(inspectKey('DISCORD_TOKEN="abc.def.ghi"\n', 'DISCORD_TOKEN').value, 'abc.def.ghi');
  assert.equal(inspectKey('export DISCORD_TOKEN=abc.def.ghi\n', 'DISCORD_TOKEN').value, 'abc.def.ghi');
});

test('detects a value pasted on the following line', () => {
  const r = inspectKey('DISCORD_TOKEN=\nabc.def.ghi\n', 'DISCORD_TOKEN');
  assert.equal(r.status, 'value-on-next-line');
  assert.match(r.detail, /SAME line/);
  assert.match(r.detail, /abc\.def\.ghi/, 'shows them the corrected line');
});

test('detects a commented-out line that has a real value', () => {
  const r = inspectKey('# DISCORD_TOKEN=abc.def.ghi\n', 'DISCORD_TOKEN');
  assert.equal(r.status, 'commented');
  assert.match(r.detail, /Delete the # /);
});

test('a commented-out placeholder is not reported as a real value', () => {
  const r = inspectKey('# DISCORD_TOKEN=your_bot_token_here\nDISCORD_TOKEN=real.tok.en\n', 'DISCORD_TOKEN');
  assert.equal(r.status, 'ok');
  assert.equal(r.value, 'real.tok.en');
});

test('detects an untouched placeholder', () => {
  assert.equal(inspectKey('DISCORD_TOKEN=your_bot_token_here\n', 'DISCORD_TOKEN').status, 'placeholder');
  assert.equal(inspectKey('CLIENT_ID=your_application_id_here\n', 'CLIENT_ID').status, 'placeholder');
});

test('detects brackets and smart quotes left around the value', () => {
  assert.equal(inspectKey('DISCORD_TOKEN=<abc.def.ghi>\n', 'DISCORD_TOKEN').status, 'brackets');
  assert.equal(inspectKey('DISCORD_TOKEN=\u201Cabc.def.ghi\u201D\n', 'DISCORD_TOKEN').status, 'smart-quotes');
});

test('reports an empty assignment and a missing key differently', () => {
  assert.equal(inspectKey('DISCORD_TOKEN=\n', 'DISCORD_TOKEN').status, 'empty');
  assert.equal(inspectKey('CLIENT_ID=123\n', 'DISCORD_TOKEN').status, 'missing');
});

test('a key is not confused with a similarly named one', () => {
  const raw = 'MY_DISCORD_TOKEN=wrong\nDISCORD_TOKEN=right\n';
  assert.equal(inspectKey(raw, 'DISCORD_TOKEN').value, 'right');
});

test('CRLF line endings are handled', () => {
  assert.equal(inspectKey('DISCORD_TOKEN=abc.def.ghi\r\nCLIENT_ID=1\r\n', 'DISCORD_TOKEN').value, 'abc.def.ghi');
});

/* -------------------------- detectEncoding -------------------------- */

test('detects UTF-16, which dotenv cannot read', () => {
  assert.equal(detectEncoding(Buffer.from('DISCORD_TOKEN=x\n', 'utf16le')).startsWith('utf16'), true);
  assert.equal(detectEncoding(Buffer.from('\uFEFFDISCORD_TOKEN=x\n', 'utf16le')), 'utf16le');
});

test('plain UTF-8 (with or without BOM) is reported as utf8', () => {
  assert.equal(detectEncoding(Buffer.from('DISCORD_TOKEN=x\n', 'utf8')), 'utf8');
  assert.equal(detectEncoding(Buffer.from('\uFEFFDISCORD_TOKEN=x\n', 'utf8')), 'utf8');
});

/* --------------------------- stray files ---------------------------- */

test('finds a .env.txt saved by Notepad', () => {
  const dir = tmp();
  writeFileSync(join(dir, '.env.txt'), 'DISCORD_TOKEN=x\n');
  const strays = findStrayEnvFiles(dir);
  assert.ok(strays.some((s) => s.name === '.env.txt'));
  rmSync(dir, { recursive: true, force: true });
});

test('.env and .env.example are never treated as strays', () => {
  const dir = tmp();
  writeFileSync(join(dir, '.env'), 'A=1');
  writeFileSync(join(dir, '.env.example'), 'A=');
  assert.equal(findStrayEnvFiles(dir).length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('a stray is renamed to .env, but never over an existing .env', () => {
  const dir = tmp();
  writeFileSync(join(dir, '.env.txt'), 'DISCORD_TOKEN=fromtxt\n');
  assert.equal(adoptStray(join(dir, '.env.txt'), dir), true);
  assert.ok(existsSync(join(dir, '.env')));
  assert.ok(!existsSync(join(dir, '.env.txt')));

  // second time, with a real .env already present
  writeFileSync(join(dir, '.env.txt'), 'DISCORD_TOKEN=other\n');
  assert.equal(adoptStray(join(dir, '.env.txt'), dir), false, 'refuses to overwrite');
  assert.match(String(diagnoseEnv(dir).raw), /fromtxt/, 'original .env untouched');
  rmSync(dir, { recursive: true, force: true });
});

/* --------------------------- diagnoseEnv ---------------------------- */

test('diagnoseEnv decodes a UTF-16 file so the values are still readable', () => {
  const dir = tmp();
  writeFileSync(join(dir, '.env'), Buffer.from('DISCORD_TOKEN=abc.def.ghi\n', 'utf16le'));
  const info = diagnoseEnv(dir);
  assert.ok(info.encoding.startsWith('utf16'));
  assert.equal(inspectKey(info.raw, 'DISCORD_TOKEN').value, 'abc.def.ghi', 'value recoverable for auto-repair');
  rmSync(dir, { recursive: true, force: true });
});

test('diagnoseEnv reports a missing file without throwing', () => {
  const dir = tmp();
  const info = diagnoseEnv(dir);
  assert.equal(info.exists, false);
  assert.equal(info.raw, null);
  rmSync(dir, { recursive: true, force: true });
});

test('a UTF-8 BOM is stripped so the first key still parses', () => {
  const dir = tmp();
  writeFileSync(join(dir, '.env'), '\uFEFFDISCORD_TOKEN=abc.def.ghi\n');
  const info = diagnoseEnv(dir);
  assert.ok(!info.raw.startsWith('\uFEFF'), 'BOM removed');
  assert.equal(inspectKey(info.raw, 'DISCORD_TOKEN').value, 'abc.def.ghi');
  rmSync(dir, { recursive: true, force: true });
});
