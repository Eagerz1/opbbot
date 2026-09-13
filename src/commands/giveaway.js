import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { COLORS, EMOJI, BRAND } from '../config/constants.js';
import { getGiveaway, listActiveGiveaways, getGuildConfig, countEntries, markCancelled } from '../lib/store.js';
import { endGiveaway, rerollGiveaway, refreshGiveaway, logGiveaway } from '../lib/giveaways.js';
import { errEmbed, okEmbed } from '../lib/embeds.js';
import { canHost, validateDraft, publishDraft, openCreatePanel } from '../lib/giveaway-create.js';

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Create and manage OPB giveaways')
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName('create')
      .setDescription('Open the giveaway panel (requires the Giveaway Funder role)'),
  )
  .addSubcommand((s) =>
    s
      .setName('quick')
      .setDescription('Create a giveaway in one line, without the panel')
      .addStringOption((o) => o.setName('title').setDescription('Giveaway title').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('prize').setDescription('What do you win?').setRequired(true).setMaxLength(500))
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 30m, 2h, 3d, 1w, 1d12h').setRequired(true))
      .addIntegerOption((o) => o.setName('winners').setDescription('How many winners (1-20)').setMinValue(1).setMaxValue(20))
      .addRoleOption((o) => o.setName('required_role').setDescription('Restrict entry to this role (e.g. @Booster)'))
      .addRoleOption((o) => o.setName('required_role_2').setDescription('A second role that also grants entry'))
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post (defaults to the OPB giveaways channel)'))
      .addBooleanOption((o) => o.setName('patron_only').setDescription('Restrict entry to Patron tiers')),
  )
  .addSubcommand((s) =>
    s
      .setName('end')
      .setDescription('End a giveaway early and draw winners')
      .addStringOption((o) => o.setName('id').setDescription('Giveaway ID (see the embed footer)').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('reroll')
      .setDescription('Draw replacement winners')
      .addStringOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true))
      .addIntegerOption((o) => o.setName('count').setDescription('How many new winners (default 1)').setMinValue(1).setMaxValue(20)),
  )
  .addSubcommand((s) =>
    s
      .setName('cancel')
      .setDescription('Cancel a giveaway without drawing winners')
      .addStringOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('list').setDescription('List every running giveaway'));

/** End / reroll / cancel gate. `canHost` lives in lib/giveaway-create.js. */
function canManage(member) {
  const cfg = getGuildConfig(member.guild.id);
  const manager = cfg.roles?.giveawayManager;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return !!(manager && member.roles.cache.has(manager));
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const cfg = getGuildConfig(interaction.guild.id);

  // The panel does its own permission check before showing the modal.
  if (sub === 'create') {
    return openCreatePanel(interaction);
  }

  if (sub === 'quick') {
    if (!canHost(interaction.member)) {
      const roleMention = cfg.roles?.giveawayFunder ? `<@&${cfg.roles.giveawayFunder}>` : '**💰 Giveaway Funder**';
      return interaction.reply({
        embeds: [errEmbed('You need the Giveaway Funder role', `Only ${roleMention} members (or staff) can host giveaways. Ask an admin to grant it.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const roleIds = [interaction.options.getRole('required_role')?.id, interaction.options.getRole('required_role_2')?.id].filter(Boolean);

    const result = validateDraft(
      {
        title: interaction.options.getString('title'),
        prize: interaction.options.getString('prize'),
        winnersRaw: String(interaction.options.getInteger('winners') ?? 1),
        durationRaw: interaction.options.getString('duration'),
        roleIds,
      },
      { guild: interaction.guild },
    );

    if (!result.ok) {
      return interaction.reply({ embeds: [errEmbed('Check those fields', result.errors.join('\n'))], flags: MessageFlags.Ephemeral });
    }

    const target = interaction.options.getChannel('channel') ?? null;
    if (target && !target.isTextBased()) {
      return interaction.reply({ embeds: [errEmbed('Bad channel', 'Pick a text channel.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const draft = { ...result.value, patronOnly: interaction.options.getBoolean('patron_only') ?? false };

    try {
      const { giveaway, message, channel } = await publishDraft(interaction, draft, { channel: target });
      await interaction.editReply({
        embeds: [
          okEmbed(
            'Giveaway is live',
            [
              `**${giveaway.title}**`,
              `Prize: ${draft.prize}`,
              `${draft.winnerCount} winner${draft.winnerCount > 1 ? 's' : ''} · ends in **${draft.durationLabel}**`,
              draft.roleIds.length ? `Restricted to ${draft.roleIds.map((r) => `<@&${r}>`).join(', ')}` : 'Open to everyone',
              '',
              `Posted in ${channel} → ${message.url}`,
              `ID \`${giveaway.id}\``,
            ].join('\n'),
          ),
        ],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [errEmbed('Could not post the giveaway', err.message)] });
    }
    return;
  }

  if (sub === 'list') {
    const active = listActiveGiveaways(interaction.guild.id);
    if (!active.length) {
      return interaction.reply({ embeds: [okEmbed('No running giveaways', 'Start one with `/giveaway create`.')], flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.giveaway)
      .setTitle(`${EMOJI.gift} Running giveaways (${active.length})`)
      .setFooter({ text: BRAND.footer })
      .setDescription(
        active
          .slice(0, 15)
          .map((g) => {
            const e = countEntries(g.id);
            return `**${g.title ?? g.prize}** · \`${g.id}\`\n<#${g.channelId}> · ends <t:${Math.floor(g.endsAt / 1000)}:R> · ${e.people} entries · ${g.winnerCount} winner(s)`;
          })
          .join('\n\n'),
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // end / reroll / cancel need manage rights
  const id = interaction.options.getString('id');
  const gw = getGiveaway(id);
  if (!gw || gw.guildId !== interaction.guild.id) {
    return interaction.reply({ embeds: [errEmbed('Not found', `No giveaway with ID \`${id}\` in this server.`)], flags: MessageFlags.Ephemeral });
  }
  const isHost = gw.hostId === interaction.user.id;
  if (!canManage(interaction.member) && !isHost) {
    return interaction.reply({
      embeds: [errEmbed('Not allowed', 'Only the host or a Giveaway Manager can do that.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (sub === 'end') {
    if (gw.ended) return interaction.editReply({ embeds: [errEmbed('Already ended', 'Use `/giveaway reroll` instead.')] });
    const res = await endGiveaway(interaction.client, id, { reason: `manual by ${interaction.user.tag}` });
    return interaction.editReply({
      embeds: [okEmbed('Giveaway ended', res?.winners.length ? `Winners: ${res.winners.map((w) => `<@${w}>`).join(', ')}` : 'No valid entries.')],
    });
  }

  if (sub === 'reroll') {
    const res = await rerollGiveaway(interaction.client, id, interaction.options.getInteger('count') ?? 1);
    return interaction.editReply({
      embeds: [
        res?.winners.length
          ? okEmbed('Rerolled', `New winners: ${res.winners.map((w) => `<@${w}>`).join(', ')}`)
          : errEmbed('No one left', 'Everyone eligible has already won.'),
      ],
    });
  }

  if (sub === 'cancel') {
    markCancelled(id);
    await refreshGiveaway(interaction.client, id);
    await logGiveaway(interaction.client, interaction.guild.id, {
      title: 'Giveaway cancelled',
      description: `**${gw.title ?? gw.prize}** · ID \`${gw.id}\`\nBy <@${interaction.user.id}>`,
      color: COLORS.danger,
    });
    return interaction.editReply({ embeds: [okEmbed('Cancelled', `**${gw.title ?? gw.prize}** was cancelled. No winners drawn.`)] });
  }
}
