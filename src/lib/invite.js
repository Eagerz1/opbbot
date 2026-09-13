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
