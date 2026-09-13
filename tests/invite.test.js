import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { buildInviteUrl, fetchApplicationId, fetchBotGuilds, REQUIRED_PERMISSIONS } from '../src/lib/invite.js';

describe('buildInviteUrl', () => {
  const id = '123456789012345678';

  test('builds a valid discord.com OAuth2 URL', () => {
    const url = new URL(buildInviteUrl(id));
    assert.equal(url.origin, 'https://discord.com');
    assert.equal(url.pathname, '/oauth2/authorize');
    assert.equal(url.searchParams.get('client_id'), id);
  });

  test('requests both required scopes', () => {
    const scope = new URL(buildInviteUrl(id)).searchParams.get('scope');
    assert.deepEqual(scope.split(' ').sort(), ['applications.commands', 'bot']);
  });

  test('defaults to Administrator', () => {
    const perms = new URL(buildInviteUrl(id)).searchParams.get('permissions');
    assert.equal(perms, String(PermissionsBitField.Flags.Administrator));
  });

  test('minimal mode asks for the real permission set instead', () => {
    const perms = new URL(buildInviteUrl(id, { admin: false })).searchParams.get('permissions');
    assert.equal(perms, new PermissionsBitField(REQUIRED_PERMISSIONS).bitfield.toString());
    assert.notEqual(perms, String(PermissionsBitField.Flags.Administrator));
  });

  test('minimal set covers what /setup needs', () => {
    const bits = new PermissionsBitField(REQUIRED_PERMISSIONS);
    for (const flag of ['ManageRoles', 'ManageChannels', 'ViewChannel', 'SendMessages', 'EmbedLinks']) {
      assert.ok(bits.has(PermissionsBitField.Flags[flag]), `missing ${flag}`);
    }
  });

  test('rejects a missing client id', () => {
    assert.throws(() => buildInviteUrl(''), /clientId is required/);
    assert.throws(() => buildInviteUrl(undefined), /clientId is required/);
  });

  test('accepts a numeric id', () => {
    const url = new URL(buildInviteUrl(123456789012345678n));
    assert.equal(url.searchParams.get('client_id'), '123456789012345678');
  });
});

describe('fetchApplicationId', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('returns the application id and authenticates as a bot', async () => {
    let seenAuth = null;
    globalThis.fetch = async (url, opts) => {
      seenAuth = opts.headers.Authorization;
      assert.match(String(url), /oauth2\/applications\/@me$/);
      return new Response(JSON.stringify({ id: '1548667002392940595' }), { status: 200 });
    };
    const id = await fetchApplicationId('my.tok.en');
    assert.equal(id, '1548667002392940595');
    assert.equal(seenAuth, 'Bot my.tok.en');
  });

  test('explains a 401 as a reset/invalid token', async () => {
    globalThis.fetch = async () => new Response('', { status: 401 });
    await assert.rejects(() => fetchApplicationId('bad'), /rejected the token \(401\)/);
  });

  test('surfaces other HTTP failures', async () => {
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(() => fetchApplicationId('x'), /HTTP 503/);
  });

  test('requires a token', async () => {
    await assert.rejects(() => fetchApplicationId(''), /token is required/);
  });
});

describe('fetchBotGuilds', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('returns id and name for each server', async () => {
    globalThis.fetch = async (url, opts) => {
      assert.match(String(url), /users\/@me\/guilds$/);
      assert.equal(opts.headers.Authorization, 'Bot my.tok.en');
      return new Response(JSON.stringify([{ id: '1', name: 'OPB', icon: null, extra: 'ignored' }]), { status: 200 });
    };
    assert.deepEqual(await fetchBotGuilds('my.tok.en'), [{ id: '1', name: 'OPB' }]);
  });

  test('returns an empty list when the bot is in no servers', async () => {
    globalThis.fetch = async () => new Response('[]', { status: 200 });
    assert.deepEqual(await fetchBotGuilds('x'), []);
  });

  test('explains a 401', async () => {
    globalThis.fetch = async () => new Response('', { status: 401 });
    await assert.rejects(() => fetchBotGuilds('bad'), /rejected the token \(401\)/);
  });

  test('requires a token', async () => {
    await assert.rejects(() => fetchBotGuilds(''), /token is required/);
  });
});
