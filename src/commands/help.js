import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { BRAND, COLORS, EMOJI } from '../config/constants.js';
import { getGuildConfig } from '../lib/store.js';

export const data = new SlashCommandBuilder().setName('help').setDescription(`What ${BRAND.name} can do`).setDMPermission(false);

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guild.id);
  const ch = (k) => (cfg.channels?.[k] ? `<#${cfg.channels[k]}>` : '`run /setup`');

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${EMOJI.gift} ${BRAND.name}`)
    .setDescription(BRAND.tagline)
    .addFields(
      {
        name: `${EMOJI.shield} Admin`,
        value: [
          '`/setup` — build the whole server (roles, categories, channels, panels)',
          '`/setup preview:true` — see the plan without creating anything',
          '`/patreon grant` · `/patreon revoke` — manage patron tiers',
          '`/rewards post` — repost the chat rewards embed',
        ].join('\n'),
      },
      {
        name: `${EMOJI.money} Giveaways`,
        value: [
          '`/giveaway create` — host one (needs **💰 Giveaway Funder**)',
          '`/giveaway list` · `/giveaway end` · `/giveaway reroll` · `/giveaway cancel`',
          `Live giveaways: ${ch('giveaways')} · Funder-only: ${ch('createGiveaway')}`,
        ].join('\n'),
      },
      {
        name: `${EMOJI.chart} Members`,
        value: ['`/rank` — your level, XP and buffs', '`/leaderboard` — top chatters', '`/patreon tiers` — all 5 patron tiers', '`/rewards show` — the buff ladder'].join('\n'),
      },
      {
        name: `${EMOJI.sparkles} How buffs stack`,
        value: 'Patron tier entries **+** chat level entries. XP multipliers multiply. Max **17 entries** per giveaway.',
      },
    )
    .setFooter({ text: BRAND.footer });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
