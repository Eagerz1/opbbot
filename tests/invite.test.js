import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { buildInviteUrl, REQUIRED_PERMISSIONS } from '../src/lib/invite.js';

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
