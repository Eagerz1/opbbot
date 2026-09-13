/**
 * Shared validation + publishing for giveaway creation.
 *
 * Every entry point (the /giveaway create panel, the create-giveaway button,
 * and the legacy fallback) funnels through here so the rules are identical
 * no matter how the giveaway was started.
 */
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { COLORS } from '../config/constants.js';
import { getGuildConfig, createGiveaway } from './store.js';
import { publishGiveaway, logGiveaway } from './giveaways.js';
import { parseDuration, formatDuration, makeId } from './util.js';
import { MAX_REQUIRED_ROLES, buildGiveawayModal, buildLegacyModal } from './giveaway-panel.js';
import { errEmbed } from './embeds.js';

export const LIMITS = {
  minDurationMs: 10_000,
  maxDurationMs: 90 * 86_400_000,
  minWinners: 1,
  maxWinners: 20,
  maxRoles: MAX_REQUIRED_ROLES,
};

/** Can this member host a giveaway? */
export function canHost(member) {
  const cfg = getGuildConfig(member.guild.id);
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const funder = cfg.roles?.giveawayFunder;
  const manager = cfg.roles?.giveawayManager;
  if (funder && member.roles.cache.has(funder)) return true;
  if (manager && member.roles.cache.has(manager)) return true;
  return false;
}

/**
 * Show the giveaway creation panel.
 *
 * Tries the rich modal (with the inline role picker) first and silently falls
 * back to the text-only modal + follow-up role step if the client rejects it,
 * so creation never hard-fails on an older client.
 */
export async function openCreatePanel(interaction, defaults = {}) {
  if (!canHost(interaction.member)) {
    const cfg = getGuildConfig(interaction.guild.id);
    const roleMention = cfg.roles?.giveawayFunder ? `<@&${cfg.roles.giveawayFunder}>` : '**💰 Giveaway Funder**';
    return interaction.reply({
      embeds: [errEmbed('You need the Giveaway Funder role', `Only ${roleMention} members (or staff) can create giveaways. Ask an admin to grant it.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    await interaction.showModal(buildGiveawayModal(defaults));
  } catch (err) {
    interaction.client?.logger?.warn?.('Label modal rejected, falling back to legacy modal:', err.message);
    if (interaction.replied || interaction.deferred) return;
    await interaction.showModal(buildLegacyModal(defaults)).catch((e) => {
      interaction.client?.logger?.error?.('legacy modal failed too', e);
    });
  }
}

/**
 * Validate raw panel input.
 * @returns {{ok: true, value: object} | {ok: false, errors: string[]}}
 */
export function validateDraft({ title, prize, winnersRaw, durationRaw, roleIds = [] }, { guild } = {}) {
  const errors = [];

  const cleanTitle = (title ?? '').trim();
  const cleanPrize = (prize ?? '').trim();

  if (!cleanTitle) errors.push('**Title** is required.');
  else if (cleanTitle.length > 100) errors.push('**Title** must be 100 characters or fewer.');

  if (!cleanPrize) errors.push('**Prize** is required.');
  else if (cleanPrize.length > 500) errors.push('**Prize** must be 500 characters or fewer.');

  // Winners: must be a clean integer in range.
  const winnersTrimmed = String(winnersRaw ?? '').trim();
  let winnerCount = 1;
  if (winnersTrimmed === '') {
    winnerCount = 1;
  } else if (!/^\d+$/.test(winnersTrimmed)) {
    errors.push(`**Winners** must be a whole number — \`${winnersTrimmed}\` isn't one.`);
  } else {
    winnerCount = Number(winnersTrimmed);
    if (winnerCount < LIMITS.minWinners || winnerCount > LIMITS.maxWinners) {
      errors.push(`**Winners** must be between ${LIMITS.minWinners} and ${LIMITS.maxWinners}.`);
    }
  }

  const ms = parseDuration(durationRaw);
  if (!ms) {
    errors.push(`**Duration** \`${String(durationRaw ?? '').trim() || '(empty)'}\` isn't valid. Try \`30m\`, \`2h\`, \`3d\`, \`1w\` or \`1d12h\`.`);
  } else if (ms < LIMITS.minDurationMs) {
    errors.push('**Duration** must be at least 10 seconds.');
  } else if (ms > LIMITS.maxDurationMs) {
    errors.push('**Duration** cannot be longer than 90 days.');
  }

  // Roles: drop @everyone, managed/bot roles and duplicates.
  const cleanRoles = [];
  const dropped = [];
  for (const id of [...new Set(roleIds)]) {
    if (!id) continue;
    if (guild && id === guild.id) {
      dropped.push('@everyone (everyone can already enter)');
      continue;
    }
    const role = guild?.roles?.cache?.get(id);
    if (role?.managed) {
      dropped.push(`${role.name} (bot/integration role)`);
      continue;
    }
    cleanRoles.push(id);
  }
  if (cleanRoles.length > LIMITS.maxRoles) errors.push(`You can require at most ${LIMITS.maxRoles} roles.`);

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title: cleanTitle,
      prize: cleanPrize,
      winnerCount,
      durationMs: ms,
      durationLabel: formatDuration(ms),
      roleIds: cleanRoles,
      droppedRoles: dropped,
    },
  };
}

/**
 * Persist + post a validated giveaway.
 * @returns {{giveaway: object, message: import('discord.js').Message, channel: object}}
 */
export async function publishDraft(interaction, draft, { channel: explicitChannel } = {}) {
  const cfg = getGuildConfig(interaction.guild.id);

  const channel =
    explicitChannel ??
    (cfg.channels?.giveaways ? await interaction.guild.channels.fetch(cfg.channels.giveaways).catch(() => null) : null) ??
    interaction.channel;

  if (!channel?.isTextBased()) {
    throw new Error('No text channel available to post in. Run `/setup` first, or pass a channel.');
  }

  // Fail before writing to the DB if we can't actually post.
  const me = interaction.guild.members.me;
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages)) {
    throw new Error(`I can't post in ${channel}. Give me **View Channel** and **Send Messages** there.`);
  }
  if (!perms.has(PermissionFlagsBits.EmbedLinks)) {
    throw new Error(`I need **Embed Links** in ${channel} to post the giveaway embed.`);
  }

  const gw = createGiveaway({
    id: makeId(),
    guildId: interaction.guild.id,
    channelId: channel.id,
    hostId: interaction.user.id,
    title: draft.title,
    prize: draft.prize,
    description: draft.description ?? null,
    winnerCount: draft.winnerCount,
    endsAt: Date.now() + draft.durationMs,
    patronOnly: draft.patronOnly ?? false,
    requiredRoles: draft.roleIds ?? [],
    requiredMode: draft.requiredMode ?? 'any',
  });

  const message = await publishGiveaway(interaction.client, gw);

  await logGiveaway(interaction.client, interaction.guild.id, {
    title: 'Giveaway created',
    description: [
      `**${draft.title}** · ID \`${gw.id}\``,
      `Prize: ${draft.prize}`,
      `Host: <@${interaction.user.id}>`,
      `Winners: ${draft.winnerCount} · Ends in ${draft.durationLabel}`,
      draft.roleIds?.length ? `Required: ${draft.roleIds.map((r) => `<@&${r}>`).join(', ')}` : 'Open to everyone',
    ].join('\n'),
    color: COLORS.success,
  });

  return { giveaway: gw, message, channel };
}
