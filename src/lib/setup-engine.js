/**
 * The /setup engine: turns the blueprint into a real Discord server.
 *
 * Design notes:
 *  - Idempotent. Re-running /setup adopts existing roles/channels by name
 *    instead of duplicating them, so it's safe to run again after a failure.
 *  - Resilient. One failed channel does not abort the whole run; failures are
 *    collected and reported back to the operator.
 *  - Rate-limit friendly. discord.js queues requests, but we still keep the
 *    work sequential per-resource so ordering (and role position) is stable.
 */
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { CATEGORIES, ROLES, channelName, DEFAULT_SEPARATOR } from '../config/blueprint.js';
import { resolveOverwrites, resolvePermissions, mergeOverwrites } from './permissions.js';
import { saveGuildConfig, getGuildConfig } from './store.js';
import { buildPanels } from './panels.js';

const CHANNEL_TYPE = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
  announcement: ChannelType.GuildAnnouncement,
  stage: ChannelType.GuildStageVoice,
};

/** Strip emoji/separators so "🎁│general" and "general" compare equal. */
export function normalizeName(name) {
  return name
    .normalize('NFKD')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u20E3]/gu, '')
    .replace(/[│｜|_\-\s]+/g, '')
    .trim()
    .toLowerCase();
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {object} opts
 * @param {(msg: string) => void} [opts.onProgress]
 */
export async function runSetup(guild, opts = {}) {
  const {
    separator = DEFAULT_SEPARATOR,
    dryRun = false,
    onProgress = () => {},
    actorId = null,
    postPanels = true,
    skipExisting = true,
    clean = false,
  } = opts;

  const report = {
    roles: { created: [], adopted: [], failed: [] },
    categories: { created: [], adopted: [], failed: [] },
    channels: { created: [], adopted: [], failed: [] },
    deleted: { channels: [], failed: [] },
    panels: { posted: [], failed: [] },
    warnings: [],
    dryRun,
  };

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels) || !me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('I need **Manage Roles** and **Manage Channels** permissions to run setup.');
  }

  /* --------------------- 0. optional clean slate --------------------- */

  if (clean) {
    await guild.channels.fetch();

    // Never delete the channel the command was run from, or anything Discord
    // treats as structural (rules/updates channels on Community servers).
    const protectedIds = new Set(
      [opts.invokedChannelId, guild.rulesChannelId, guild.publicUpdatesChannelId, guild.safetyAlertsChannelId].filter(Boolean),
    );

    const doomed = [...guild.channels.cache.values()].filter((c) => c && !protectedIds.has(c.id));

    // Children first so categories are empty when they go.
    doomed.sort((a, b) => (a.type === ChannelType.GuildCategory ? 1 : 0) - (b.type === ChannelType.GuildCategory ? 1 : 0));

    onProgress(`Deleting ${doomed.length} existing channel(s)…`);
    for (const ch of doomed) {
      if (dryRun) {
        report.deleted.channels.push({ name: ch.name, id: ch.id });
        continue;
      }
      try {
        await ch.delete('OPB /setup clean rebuild');
        report.deleted.channels.push({ name: ch.name, id: ch.id });
      } catch (err) {
        report.deleted.failed.push({ name: ch.name, error: err.message });
      }
    }
    if (report.deleted.failed.length) {
      report.warnings.push(`Could not delete ${report.deleted.failed.length} channel(s) — check my role position.`);
    }
  }

  /* ----------------------------- 1. roles ---------------------------- */

  const roleIds = { ...getGuildConfig(guild.id).roles };
  await guild.roles.fetch();

  for (const spec of ROLES) {
    try {
      // Adopt by stored id, then by exact name, then by normalized name.
      let existing =
        (roleIds[spec.key] && guild.roles.cache.get(roleIds[spec.key])) ||
        guild.roles.cache.find((r) => r.name === spec.name) ||
        guild.roles.cache.find((r) => !r.managed && r.id !== guild.id && normalizeName(r.name) === normalizeName(spec.name));

      if (existing) {
        roleIds[spec.key] = existing.id;
        report.roles.adopted.push({ key: spec.key, name: existing.name, id: existing.id });
        onProgress(`↺ role ${spec.name}`);
        continue;
      }

      if (dryRun) {
        report.roles.created.push({ key: spec.key, name: spec.name, id: null });
        continue;
      }

      const role = await guild.roles.create({
        name: spec.name,
        color: spec.color,
        hoist: spec.hoist,
        mentionable: spec.mentionable,
        permissions: resolvePermissions(spec.permissions),
        reason: 'OPB Giveaways /setup',
      });
      roleIds[spec.key] = role.id;
      report.roles.created.push({ key: spec.key, name: role.name, id: role.id });
      onProgress(`✚ role ${spec.name}`);
    } catch (err) {
      report.roles.failed.push({ key: spec.key, name: spec.name, error: err.message });
    }
  }

  if (!dryRun) saveGuildConfig(guild.id, { roles: roleIds, separator, setupBy: actorId });

  /* ------------------------ 2. categories + channels ------------------ */

  const botRoleId = me?.roles?.botRole?.id ?? null;
  const channelIds = { ...getGuildConfig(guild.id).channels };
  if (!dryRun) await guild.channels.fetch();

  const ctx = { guild, roleIds, botRoleId };

  for (const cat of CATEGORIES) {
    let parent = null;
    try {
      const existingCat =
        guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === cat.name) ||
        guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && normalizeName(c.name) === normalizeName(cat.name));

      if (existingCat) {
        parent = existingCat;
        channelIds[`cat:${cat.key}`] = existingCat.id;
        report.categories.adopted.push({ key: cat.key, name: existingCat.name, id: existingCat.id });
        onProgress(`↺ category ${cat.name}`);
      } else if (dryRun) {
        report.categories.created.push({ key: cat.key, name: cat.name, id: null });
      } else {
        parent = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: resolveOverwrites(cat.overwrites, ctx),
          reason: 'OPB Giveaways /setup',
        });
        channelIds[`cat:${cat.key}`] = parent.id;
        report.categories.created.push({ key: cat.key, name: parent.name, id: parent.id });
        onProgress(`✚ category ${cat.name}`);
      }
    } catch (err) {
      report.categories.failed.push({ key: cat.key, name: cat.name, error: err.message });
      continue; // can't place children without a parent
    }

    for (const ch of cat.channels) {
      const finalName = channelName(ch.emoji, ch.name, separator, { lower: !ch.preserveCase });
      try {
        const existing =
          (channelIds[ch.key] && guild.channels.cache.get(channelIds[ch.key])) ||
          guild.channels.cache.find((c) => c.parentId === parent?.id && normalizeName(c.name) === normalizeName(finalName)) ||
          guild.channels.cache.find((c) => c.type !== ChannelType.GuildCategory && normalizeName(c.name) === normalizeName(finalName));

        if (existing && skipExisting) {
          channelIds[ch.key] = existing.id;
          report.channels.adopted.push({ key: ch.key, name: existing.name, id: existing.id, category: cat.key });
          onProgress(`↺ channel ${finalName}`);
          continue;
        }

        if (dryRun) {
          report.channels.created.push({ key: ch.key, name: finalName, id: null, category: cat.key, type: ch.type });
          continue;
        }

        const overwrites = ch.overwrites ? mergeOverwrites(cat.overwrites, ch.overwrites) : cat.overwrites;

        const payload = {
          name: finalName,
          type: CHANNEL_TYPE[ch.type] ?? ChannelType.GuildText,
          parent: parent.id,
          permissionOverwrites: resolveOverwrites(overwrites, ctx),
          reason: 'OPB Giveaways /setup',
        };
        if (ch.topic && ch.type !== 'voice') payload.topic = ch.topic;
        if (ch.slowmode) payload.rateLimitPerUser = ch.slowmode;
        if (ch.type === 'voice' && typeof ch.userLimit === 'number' && ch.userLimit > 0) payload.userLimit = ch.userLimit;

        const created = await guild.channels.create(payload);
        channelIds[ch.key] = created.id;
        report.channels.created.push({ key: ch.key, name: created.name, id: created.id, category: cat.key, type: ch.type });
        onProgress(`✚ channel ${finalName}`);
      } catch (err) {
        report.channels.failed.push({ key: ch.key, name: finalName, error: err.message });
      }
    }
  }

  if (!dryRun) saveGuildConfig(guild.id, { roles: roleIds, channels: channelIds, separator, setupBy: actorId });

  /* --------------------------- 3. info panels ------------------------- */

  if (postPanels && !dryRun) {
    const panels = buildPanels({ roles: roleIds, channels: channelIds });
    for (const [channelKey, payload] of Object.entries(panels)) {
      const id = channelIds[channelKey];
      if (!id) continue;
      try {
        const channel = await guild.channels.fetch(id).catch(() => null);
        if (!channel?.isTextBased()) continue;

        // Don't double-post: if our last panel is already there, edit it.
        const recent = await channel.messages.fetch({ limit: 10 }).catch(() => null);
        const mine = recent?.find((m) => m.author.id === guild.client.user.id && m.embeds.length > 0);

        if (mine) {
          await mine.edit(payload);
          report.panels.posted.push({ channel: channelKey, id: mine.id, updated: true });
        } else {
          const sent = await channel.send(payload);
          if (channel.type === ChannelType.GuildText) await sent.pin().catch(() => {});
          report.panels.posted.push({ channel: channelKey, id: sent.id, updated: false });
        }
        onProgress(`▣ panel ${channelKey}`);
      } catch (err) {
        report.panels.failed.push({ channel: channelKey, error: err.message });
      }
    }
  }

  /* ---------------------------- 4. warnings --------------------------- */

  const highestBot = me?.roles?.highest;
  if (highestBot && guild.roles.cache.size > 1) {
    const blocked = ROLES.map((r) => roleIds[r.key])
      .map((id) => guild.roles.cache.get(id))
      .filter((r) => r && highestBot.comparePositionTo(r) <= 0);
    if (blocked.length) {
      report.warnings.push(
        `My role sits below ${blocked.length} of the created role(s). Drag **${me.roles.highest.name}** to the top of Server Settings → Roles so I can assign them.`,
      );
    }
  }

  return report;
}

/** Human-readable summary used by /setup and the preview. */
export function summarize(report) {
  const n = (x) => x.created.length + x.adopted.length;
  return {
    roles: n(report.roles),
    rolesCreated: report.roles.created.length,
    categories: n(report.categories),
    channels: n(report.channels),
    panels: report.panels.posted.length,
    failures: report.roles.failed.length + report.categories.failed.length + report.channels.failed.length,
  };
}
