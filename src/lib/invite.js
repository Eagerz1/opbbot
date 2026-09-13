/**
 * Builds the OAuth2 invite URL that adds this bot to a server.
 *
 * Two scopes are required:
 *   bot                   - lets it join and act in the server
 *   applications.commands - lets its slash commands register
 *
 * Administrator is used because /setup creates roles, categories and
 * channels and edits permission overwrites on every one of them. The
 * precise permission set is listed below for anyone who prefers it.
 */
import { PermissionsBitField } from 'discord.js';

/** Everything /setup and the giveaway loop actually touch. */
export const REQUIRED_PERMISSIONS = [
  'ManageRoles',
  'ManageChannels',
  'ViewChannel',
  'SendMessages',
  'SendMessagesInThreads',
  'EmbedLinks',
  'AttachFiles',
  'ReadMessageHistory',
  'MentionEveryone',
  'AddReactions',
  'ManageMessages',
  'UseExternalEmojis',
];

/**
 * Ask Discord which application a bot token belongs to.
 *
 * The token identifies the application, so CLIENT_ID is never something the
 * user needs to go and find by hand.
 *
 * @param {string} token  the bot token
 * @returns {Promise<string>} the application (client) ID
 */
export async function fetchApplicationId(token) {
  if (!token) throw new Error('A bot token is required to look up the application ID');

  const res = await fetch('https://discord.com/api/v10/oauth2/applications/@me', {
    headers: { Authorization: `Bot ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Discord rejected the token (401). It may have been reset — get a new one from the Developer Portal → Bot → Reset Token.');
    }
    throw new Error(`Discord returned HTTP ${res.status} when looking up the application ID.`);
  }

  const app = await res.json();
  if (!app?.id) throw new Error('Discord did not return an application ID.');
  return app.id;
}

/**
 * List the servers this bot is currently in.
 *
 * Used to register slash commands against the actual server instead of
 * globally - guild commands appear instantly, global ones take up to an hour.
 *
 * @param {string} token  the bot token
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function fetchBotGuilds(token) {
  if (!token) throw new Error('A bot token is required to list servers');

  const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: { Authorization: `Bot ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Discord rejected the token (401). It may have been reset — get a new one from the Developer Portal → Bot → Reset Token.');
    }
    throw new Error(`Discord returned HTTP ${res.status} when listing servers.`);
  }

  const guilds = await res.json();
  return Array.isArray(guilds) ? guilds.map((g) => ({ id: g.id, name: g.name })) : [];
}

/**
 * @param {string} clientId  the application ID
 * @param {{admin?: boolean}} [opts]  admin:true (default) requests Administrator
 * @returns {string} the invite URL
 */
export function buildInviteUrl(clientId, { admin = true } = {}) {
  if (!clientId) throw new Error('clientId is required to build an invite URL');

  const permissions = admin
    ? PermissionsBitField.Flags.Administrator
    : new PermissionsBitField(REQUIRED_PERMISSIONS).bitfield;

  const params = new URLSearchParams({
    client_id: String(clientId),
    permissions: String(permissions),
    scope: 'bot applications.commands',
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
