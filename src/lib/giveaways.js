/**
 * Giveaway lifecycle: post, refresh, end, reroll.
 * A single interval ticks every 5s and ends anything due, so restarts are safe.
 */
import { giveawayEmbed, giveawayComponents, okEmbed } from './embeds.js';
import { COLORS, EMOJI, BRAND } from '../config/constants.js';
import {
  getGiveaway,
  listActiveGiveaways,
  countEntries,
  getEntries,
  markEnded,
  setGiveawayMessage,
  getGuildConfig,
} from './store.js';
import { pickWinners } from './util.js';
import { EmbedBuilder } from 'discord.js';

let timer = null;

export function startGiveawayLoop(client, intervalMs = 5000) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => tick(client).catch((e) => client.logger?.error?.('giveaway tick', e)), intervalMs);
  // Immediate pass so anything that expired while offline resolves at boot.
  tick(client).catch(() => {});
  return timer;
}

export function stopGiveawayLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(client) {
  const now = Date.now();
  for (const gw of listActiveGiveaways()) {
    if (gw.endsAt <= now) await endGiveaway(client, gw.id, { reason: 'timer' });
  }
}

/** Post the giveaway message and store its id. */
export async function publishGiveaway(client, gw) {
  const channel = await client.channels.fetch(gw.channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error('Giveaway channel not found or not text-based.');

  const entries = countEntries(gw.id);
  const msg = await channel.send({
    embeds: [giveawayEmbed(gw, { entries })],
    components: giveawayComponents(gw, { entryCount: entries.people }),
  });
  setGiveawayMessage(gw.id, msg.id);

  // Ping the opt-in role if it exists.
  const cfg = getGuildConfig(gw.guildId);
  const pingId = cfg.roles?.giveawayPing;
  if (pingId) {
    await channel
      .send({ content: `<@&${pingId}> a new giveaway just went live: **${gw.prize}**`, allowedMentions: { roles: [pingId] } })
      .catch(() => {});
  }

  return msg;
}

/** Re-render the live message (entry counter). */
export async function refreshGiveaway(client, giveawayId) {
  const gw = getGiveaway(giveawayId);
  if (!gw?.messageId) return;
  const channel = await client.channels.fetch(gw.channelId).catch(() => null);
  const msg = await channel?.messages.fetch(gw.messageId).catch(() => null);
  if (!msg) return;
  const entries = countEntries(gw.id);
  await msg
    .edit({
      embeds: [giveawayEmbed(gw, { entries, ended: gw.ended, winners: gw.winners })],
      components: giveawayComponents(gw, { disabled: gw.ended, entryCount: entries.people }),
    })
    .catch(() => {});
}

/**
 * End a giveaway, pick winners, announce + DM them, log it.
 */
export async function endGiveaway(client, giveawayId, { reason = 'manual', force = false } = {}) {
  const gw = getGiveaway(giveawayId);
  if (!gw || (gw.ended && !force) || gw.cancelled) return null;

  const entries = getEntries(gw.id);
  const winners = pickWinners(entries, gw.winnerCount);
  markEnded(gw.id, winners);

  const updated = getGiveaway(gw.id);
  const channel = await client.channels.fetch(gw.channelId).catch(() => null);

  if (channel?.isTextBased()) {
    const msg = gw.messageId ? await channel.messages.fetch(gw.messageId).catch(() => null) : null;
    const counts = countEntries(gw.id);

    if (msg) {
      await msg
        .edit({
          embeds: [giveawayEmbed(updated, { entries: counts, ended: true, winners })],
          components: giveawayComponents(updated, { disabled: true, entryCount: counts.people }),
        })
        .catch(() => {});
    }

    const link = msg?.url ?? '';
    await channel
      .send({
        content: winners.length
          ? `${EMOJI.trophy} ${winners.map((w) => `<@${w}>`).join(' ')} — you won **${gw.prize}**! You have 24h to claim. ${link}`
          : `${EMOJI.cross} **${gw.prize}** ended with no valid entries. ${link}`,
        allowedMentions: { users: winners },
      })
      .catch(() => {});
  }

  // DM winners
  for (const id of winners) {
    const user = await client.users.fetch(id).catch(() => null);
    await user
      ?.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(`${EMOJI.trophy} You won!`)
            .setDescription(`You won **${gw.prize}** in **${channel?.guild?.name ?? 'the server'}**.\n\nReply in the giveaway channel within **24 hours** to claim it.`)
            .setFooter({ text: BRAND.footer }),
        ],
      })
      .catch(() => {});
  }

  // Winners board + audit log
  const cfg = getGuildConfig(gw.guildId);
  if (winners.length && cfg.channels?.winners) {
    const wch = await client.channels.fetch(cfg.channels.winners).catch(() => null);
    await wch
      ?.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.giveaway)
            .setTitle(`${EMOJI.trophy} ${gw.prize}`)
            .setDescription(`**Winner${winners.length > 1 ? 's' : ''}:** ${winners.map((w) => `<@${w}>`).join(', ')}\n**Hosted by:** <@${gw.hostId}>`)
            .setFooter({ text: `${BRAND.footer} · ID ${gw.id}` })
            .setTimestamp(),
        ],
      })
      .catch(() => {});
  }

  await logGiveaway(client, gw.guildId, {
    title: `Giveaway ended (${reason})`,
    description: `**${gw.prize}** · ID \`${gw.id}\`\nWinners: ${winners.length ? winners.map((w) => `<@${w}>`).join(', ') : 'none'}\nEntries: ${entries.length}`,
    color: COLORS.dark,
  });

  return { giveaway: updated, winners };
}

/** Pick fresh winners, excluding the previous ones. */
export async function rerollGiveaway(client, giveawayId, count = 1) {
  const gw = getGiveaway(giveawayId);
  if (!gw) return null;

  const previous = new Set(gw.winners);
  const pool = getEntries(gw.id).filter((e) => !previous.has(e.userId));
  const fresh = pickWinners(pool, count);
  if (!fresh.length) return { giveaway: gw, winners: [] };

  markEnded(gw.id, [...gw.winners, ...fresh]);

  const channel = await client.channels.fetch(gw.channelId).catch(() => null);
  await channel
    ?.send({
      content: `${EMOJI.sparkles} **Reroll** for **${gw.prize}**: ${fresh.map((w) => `<@${w}>`).join(', ')} — 24h to claim.`,
      allowedMentions: { users: fresh },
    })
    .catch(() => {});

  for (const id of fresh) {
    const user = await client.users.fetch(id).catch(() => null);
    await user?.send(`${EMOJI.trophy} You won the reroll for **${gw.prize}**! Claim it in the giveaway channel within 24h.`).catch(() => {});
  }

  await logGiveaway(client, gw.guildId, {
    title: 'Giveaway rerolled',
    description: `**${gw.prize}** · ID \`${gw.id}\`\nNew winners: ${fresh.map((w) => `<@${w}>`).join(', ')}`,
    color: COLORS.warning,
  });

  return { giveaway: getGiveaway(gw.id), winners: fresh };
}

/** Write to the staff giveaway-logs channel, if setup created one. */
export async function logGiveaway(client, guildId, { title, description, color = COLORS.primary }) {
  const cfg = getGuildConfig(guildId);
  const id = cfg.channels?.giveawayLogs;
  if (!id) return;
  const ch = await client.channels.fetch(id).catch(() => null);
  await ch
    ?.send({
      embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp().setFooter({ text: BRAND.footer })],
    })
    .catch(() => {});
}
