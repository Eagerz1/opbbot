import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { patreonEmbed, okEmbed, errEmbed } from '../lib/embeds.js';
import { getGuildConfig } from '../lib/store.js';
import { PATRON_TIERS } from '../config/blueprint.js';

export const data = new SlashCommandBuilder()
  .setName('patreon')
  .setDescription('Patron tiers, perks and tier management')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('tiers').setDescription('Show every tier from Patron to Patron ++++'))
  .addSubcommand((s) =>
    s
      .setName('grant')
      .setDescription('[Staff] Give a member a patron tier')
      .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
      .addIntegerOption((o) =>
        o
          .setName('tier')
          .setDescription('Which tier')
          .setRequired(true)
          .addChoices(...PATRON_TIERS.map((t) => ({ name: `${t.name} (${t.price}/mo)`, value: t.tier }))),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('revoke')
      .setDescription('[Staff] Remove every patron tier from a member')
      .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true)),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const cfg = getGuildConfig(interaction.guild.id);

  if (sub === 'tiers') {
    return interaction.reply({ embeds: [patreonEmbed(cfg)] });
  }

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ embeds: [errEmbed('Staff only', 'You need **Manage Roles** to change patron tiers.')], flags: MessageFlags.Ephemeral });
  }

  const user = interaction.options.getUser('user');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.reply({ embeds: [errEmbed('Not found', 'That user is not in this server.')], flags: MessageFlags.Ephemeral });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const tierRoleIds = PATRON_TIERS.map((t) => cfg.roles?.[t.key]).filter(Boolean);
  if (!tierRoleIds.length) {
    return interaction.editReply({ embeds: [errEmbed('No patron roles', 'Run `/setup` first to create the Patron roles.')] });
  }

  // Always clear existing tiers so a member only ever holds one.
  await member.roles.remove(tierRoleIds.filter((id) => member.roles.cache.has(id)), 'OPB patron tier change').catch(() => {});

  if (sub === 'revoke') {
    return interaction.editReply({ embeds: [okEmbed('Tiers removed', `${user} is no longer a patron.`)] });
  }

  const tier = PATRON_TIERS.find((t) => t.tier === interaction.options.getInteger('tier'));
  const roleId = cfg.roles?.[tier.key];
  if (!roleId) return interaction.editReply({ embeds: [errEmbed('Role missing', `The ${tier.name} role does not exist. Re-run \`/setup\`.`)] });

  try {
    await member.roles.add(roleId, `Patron tier granted by ${interaction.user.tag}`);
  } catch (err) {
    return interaction.editReply({
      embeds: [errEmbed('Could not assign the role', `${err.message}\n\nMake sure my role is **above** ${tier.name} in Server Settings → Roles.`)],
    });
  }

  await member
    .send({
      embeds: [
        okEmbed(
          `You're now ${tier.name}`,
          `Thanks for supporting OPB!\n\n**+${tier.entryBonus} giveaway entries** · **${tier.xpMultiplier}× chat XP**\n${tier.perks.map((p) => `• ${p}`).join('\n')}`,
        ),
      ],
    })
    .catch(() => {});

  return interaction.editReply({
    embeds: [okEmbed('Tier granted', `${user} is now **${tier.name}** — +${tier.entryBonus} entries, ${tier.xpMultiplier}× XP.`)],
  });
}
