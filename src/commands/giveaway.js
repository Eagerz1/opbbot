import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { COLORS, EMOJI, BRAND } from '../config/constants.js';
import { createGiveaway, getGiveaway, listActiveGiveaways, getGuildConfig, countEntries, markCancelled } from '../lib/store.js';
import { publishGiveaway, endGiveaway, rerollGiveaway, refreshGiveaway, logGiveaway } from '../lib/giveaways.js';
import { parseDuration, formatDuration, makeId } from '../lib/util.js';
import { errEmbed, okEmbed } from '../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Create and manage OPB giveaways')
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName('create')
      .setDescription('Start a giveaway (requires the Giveaway Funder role)')
      .addStringOption((o) => o.setName('prize').setDescription('What are you giving away?').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 30m, 2h, 3d, 1w, 1d12h').setRequired(true))
      .addIntegerOption((o) => o.setName('winners').setDescription('How many winners (1-20)').setMinValue(1).setMaxValue(20))
      .addStringOption((o) => o.setName('description').setDescription('Extra details, requirements, etc.').setMaxLength(1000))
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post (defaults to the OPB giveaways channel)'))
      .addBooleanOption((o) => o.setName('patron_only').setDescription('Restrict entry to Patron tiers'))
      .addRoleOption((o) => o.setName('required_role').setDescription('Extra role needed to enter')),
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

/** Funder / manager / admin gate. */
function canHost(member) {
  const cfg = getGuildConfig(member.guild.id);
  const funder = cfg.roles?.giveawayFunder;
  const manager = cfg.roles?.giveawayManager;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (funder && member.roles.cache.has(funder)) return true;
  if (manager && member.roles.cache.has(manager)) return true;
  return false;
}

function canManage(member) {
  const cfg = getGuildConfig(member.guild.id);
  const manager = cfg.roles?.giveawayManager;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return !!(manager && member.roles.cache.has(manager));
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const cfg = getGuildConfig(interaction.guild.id);

  if (sub === 'create') {
    if (!canHost(interaction.member)) {
      const roleMention = cfg.roles?.giveawayFunder ? `<@&${cfg.roles.giveawayFunder}>` : '**💰 Giveaway Funder**';
      return interaction.reply({
        embeds: [errEmbed('You need the Giveaway Funder role', `Only ${roleMention} members (or staff) can host giveaways. Ask an admin to grant it.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const prize = interaction.options.getString('prize');
    const durationRaw = interaction.options.getString('duration');
    const ms = parseDuration(durationRaw);
    if (!ms || ms < 10_000) {
      return interaction.reply({
        embeds: [errEmbed('Invalid duration', 'Use formats like `30m`, `2h`, `3d`, `1w` or `1d12h`. Minimum 10 seconds.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (ms > 90 * 86400000) {
      return interaction.reply({ embeds: [errEmbed('Too long', 'Maximum giveaway length is 90 days.')], flags: MessageFlags.Ephemeral });
    }

    const target =
      interaction.options.getChannel('channel') ??
      (cfg.channels?.giveaways ? await interaction.guild.channels.fetch(cfg.channels.giveaways).catch(() => null) : null) ??
      interaction.channel;

    if (!target?.isTextBased()) {
      return interaction.reply({ embeds: [errEmbed('Bad channel', 'Pick a text channel, or run `/setup` first.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gw = createGiveaway({
      id: makeId(),
      guildId: interaction.guild.id,
      channelId: target.id,
      hostId: interaction.user.id,
      prize,
      description: interaction.options.getString('description'),
      winnerCount: interaction.options.getInteger('winners') ?? 1,
      endsAt: Date.now() + ms,
      patronOnly: interaction.options.getBoolean('patron_only') ?? false,
      requiredRole: interaction.options.getRole('required_role')?.id ?? null,
    });

    try {
      const msg = await publishGiveaway(interaction.client, gw);
      await logGiveaway(interaction.client, interaction.guild.id, {
        title: 'Giveaway created',
        description: `**${prize}** · ID \`${gw.id}\`\nHost: <@${interaction.user.id}>\nEnds in ${formatDuration(ms)} · ${gw.winnerCount} winner(s)`,
        color: COLORS.success,
      });
      await interaction.editReply({
        embeds: [okEmbed('Giveaway live', `**${prize}** is up in ${target}.\nEnds in **${formatDuration(ms)}** · ID \`${gw.id}\`\n\n${msg.url}`)],
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
            return `**${g.prize}** · \`${g.id}\`\n<#${g.channelId}> · ends <t:${Math.floor(g.endsAt / 1000)}:R> · ${e.people} entries · ${g.winnerCount} winner(s)`;
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
      description: `**${gw.prize}** · ID \`${gw.id}\`\nBy <@${interaction.user.id}>`,
      color: COLORS.danger,
    });
    return interaction.editReply({ embeds: [okEmbed('Cancelled', `**${gw.prize}** was cancelled. No winners drawn.`)] });
  }
}
