import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { COLORS, EMOJI, BRAND } from '../config/constants.js';
import { topLevels } from '../lib/store.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Top chatters in the server')
  .setDMPermission(false)
  .addIntegerOption((o) => o.setName('limit').setDescription('How many to show (default 10, max 25)').setMinValue(3).setMaxValue(25));

export async function execute(interaction) {
  await interaction.deferReply();
  await interaction.editReply({ embeds: [await buildLeaderboard(interaction.guild, interaction.options.getInteger('limit') ?? 10)] });
}

export async function buildLeaderboard(guild, limit = 10) {
  const rows = topLevels(guild.id, limit);
  if (!rows.length) {
    return new EmbedBuilder()
      .setColor(COLORS.chat)
      .setTitle(`${EMOJI.trophy} Chat Leaderboard`)
      .setDescription('Nobody has earned XP yet. Be the first — just start talking.')
      .setFooter({ text: BRAND.footer });
  }

  const medal = ['🥇', '🥈', '🥉'];
  const lines = await Promise.all(
    rows.map(async (r, i) => {
      const member = await guild.members.fetch(r.userId).catch(() => null);
      const name = member?.displayName ?? `Unknown (${r.userId})`;
      return `${medal[i] ?? `\`#${String(i + 1).padStart(2, ' ')}\``} **${name}** — Lvl **${r.level}** · ${r.xp.toLocaleString()} XP · ${r.messages.toLocaleString()} msgs`;
    }),
  );

  return new EmbedBuilder()
    .setColor(COLORS.chat)
    .setTitle(`${EMOJI.trophy} Chat Leaderboard — Top ${rows.length}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${BRAND.footer} · more XP = more giveaway entries` })
    .setTimestamp();
}
