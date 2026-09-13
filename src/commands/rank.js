import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { COLORS, EMOJI, BRAND } from '../config/constants.js';
import { getLevel, rankOf, topLevels } from '../lib/store.js';
import { levelFromXp, progressBar } from '../lib/levels.js';
import { memberBuffs } from '../lib/util.js';
import { CHAT_LEVEL_ROLES } from '../config/blueprint.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Show your chat level, XP and active buffs')
  .setDMPermission(false)
  .addUserOption((o) => o.setName('user').setDescription('Check someone else'));

export async function execute(interaction) {
  const target = interaction.options.getUser('user') ?? interaction.user;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  await interaction.reply({ embeds: [buildRankEmbed(interaction.guild, target, member)], flags: MessageFlags.Ephemeral });
}

export function buildRankEmbed(guild, user, member) {
  const row = getLevel(guild.id, user.id);
  const { level, into, needed } = levelFromXp(row.xp);
  const rank = rankOf(guild.id, user.id);
  const buffs = member ? memberBuffs(member) : { entries: 1, xpMultiplier: 1, patron: null, chat: null };
  const next = CHAT_LEVEL_ROLES.find((c) => c.level > level);

  return new EmbedBuilder()
    .setColor(COLORS.chat)
    .setAuthor({ name: `${user.username} — Chat Rank`, iconURL: user.displayAvatarURL() })
    .addFields(
      { name: 'Level', value: `**${level}**`, inline: true },
      { name: 'Total XP', value: `**${row.xp.toLocaleString()}**`, inline: true },
      { name: 'Rank', value: rank ? `**#${rank}**` : '—', inline: true },
      { name: `Progress to level ${level + 1}`, value: `${progressBar(into, needed)}\n\`${into} / ${needed} XP\`` },
      {
        name: `${EMOJI.gift} Giveaway entries`,
        value: `**${buffs.entries}** per giveaway`,
        inline: true,
      },
      { name: `${EMOJI.chart} XP multiplier`, value: `**${buffs.xpMultiplier.toFixed(2)}×**`, inline: true },
      { name: 'Messages', value: `**${row.messages.toLocaleString()}**`, inline: true },
      {
        name: 'Active buffs',
        value:
          [buffs.patron ? `${buffs.patron.name} — +${buffs.patron.entryBonus} entries, ${buffs.patron.xpMultiplier}× XP` : null,
           buffs.chat ? `${buffs.chat.name} — +${buffs.chat.entryBonus} entries, ${buffs.chat.xpMultiplier}× XP` : null]
            .filter(Boolean)
            .join('\n') || '_None yet — keep chatting._',
      },
      ...(next ? [{ name: 'Next reward', value: `**${next.name}** at level **${next.level}** → ${next.perks[0]}` }] : []),
    )
    .setFooter({ text: BRAND.footer });
}
