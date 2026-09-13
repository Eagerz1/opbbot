/**
 * Chat XP + the 5 chat-level reward roles.
 */
import { EmbedBuilder } from 'discord.js';
import { XP, COLORS, EMOJI, BRAND } from '../config/constants.js';
import { CHAT_LEVEL_ROLES } from '../config/blueprint.js';
import { getLevel, saveLevel, getGuildConfig } from './store.js';
import { memberBuffs } from './util.js';

/** Total XP required to reach `level` from zero. */
export function totalXpFor(level) {
  let total = 0;
  for (let l = 0; l < level; l++) total += XP.curve(l);
  return total;
}

/** Given total xp, what level is that? */
export function levelFromXp(xp) {
  let level = 0;
  let remaining = xp;
  while (remaining >= XP.curve(level)) {
    remaining -= XP.curve(level);
    level++;
    if (level > 1000) break;
  }
  return { level, into: remaining, needed: XP.curve(level) };
}

/** Channels that never grant XP. */
function isXpChannel(message) {
  const cfg = getGuildConfig(message.guild.id);
  const blocked = new Set(
    ['botCommands', 'giveaways', 'createGiveaway', 'winners', 'giveawayLogs', 'modLogs', 'botLogs', 'staffChat', 'levelUps', 'leaderboard', 'rules', 'welcome', 'announcements', 'faq', 'roles', 'patreonInfo', 'chatRewards', 'giveawayRules', 'updates']
      .map((k) => cfg.channels?.[k])
      .filter(Boolean),
  );
  return !blocked.has(message.channel.id);
}

/**
 * Award XP for a message. Returns {leveledUp, level, awarded} or null.
 */
export async function awardXp(message) {
  if (!message.guild || message.author.bot) return null;
  if (message.content.trim().length < 2) return null;
  if (!isXpChannel(message)) return null;

  const row = getLevel(message.guild.id, message.author.id);
  const now = Date.now();
  if (now - row.last_xp < XP.cooldownMs) return null;

  const buffs = memberBuffs(message.member);
  const rolled = Math.floor(Math.random() * (XP.max - XP.min + 1)) + XP.min;
  const awarded = Math.round(rolled * buffs.xpMultiplier);

  const xp = row.xp + awarded;
  const { level } = levelFromXp(xp);
  const leveledUp = level > row.level;

  saveLevel(message.guild.id, message.author.id, {
    xp,
    level,
    messages: row.messages + 1,
    lastXp: now,
  });

  if (leveledUp) await handleLevelUp(message, level);
  return { leveledUp, level, awarded, xp };
}

/** Grant any newly-earned reward roles and announce. */
export async function handleLevelUp(message, level) {
  const cfg = getGuildConfig(message.guild.id);
  const earned = CHAT_LEVEL_ROLES.filter((c) => c.level <= level);
  const newlyEarned = CHAT_LEVEL_ROLES.filter((c) => c.level === level);

  const granted = [];
  for (const spec of earned) {
    const roleId = cfg.roles?.[spec.key];
    if (!roleId) continue;
    if (message.member.roles.cache.has(roleId)) continue;
    const role = message.guild.roles.cache.get(roleId);
    if (!role) continue;
    const me = message.guild.members.me;
    if (!me?.permissions.has('ManageRoles') || me.roles.highest.comparePositionTo(role) <= 0) continue;
    await message.member.roles.add(role, `Chat level ${level}`).catch(() => {});
    granted.push(role);
  }

  const announceId = cfg.channels?.levelUps;
  const target = announceId ? await message.guild.channels.fetch(announceId).catch(() => null) : message.channel;
  if (!target?.isTextBased()) return granted;

  const embed = new EmbedBuilder()
    .setColor(COLORS.chat)
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
    .setDescription(
      [
        `${EMOJI.sparkles} <@${message.author.id}> reached **Level ${level}**!`,
        granted.length ? `\n${EMOJI.trophy} Unlocked: ${granted.map((r) => `<@&${r.id}>`).join(', ')}` : '',
        newlyEarned.length ? `\n${newlyEarned.flatMap((n) => n.perks.map((p) => `• ${p}`)).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join(''),
    )
    .setFooter({ text: BRAND.footer });

  await target.send({ embeds: [embed] }).catch(() => {});
  return granted;
}

/** Text progress bar: ██████░░░░ */
export function progressBar(current, total, size = 14) {
  const ratio = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(ratio * size);
  return `${'█'.repeat(filled)}${'░'.repeat(size - filled)} ${Math.floor(ratio * 100)}%`;
}
