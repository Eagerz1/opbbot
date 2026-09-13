import {
  Events,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { IDS, COLORS, EMOJI, BRAND } from '../config/constants.js';
import { errEmbed, okEmbed, chatRewardsEmbed } from '../lib/embeds.js';
import { getGuildConfig, getGiveaway, hasEntry, addEntry, removeEntry, countEntries, createGiveaway } from '../lib/store.js';
import { refreshGiveaway, publishGiveaway, logGiveaway } from '../lib/giveaways.js';
import { memberBuffs, parseDuration, formatDuration, makeId } from '../lib/util.js';
import { buildRankEmbed } from '../commands/rank.js';
import { buildLeaderboard } from '../commands/leaderboard.js';
import { PATRON_KEYS } from '../config/blueprint.js';

export const name = Events.InteractionCreate;

export async function execute(interaction, client) {
  try {
    if (interaction.isChatInputCommand()) return await handleCommand(interaction, client);
    if (interaction.isButton()) return await handleButton(interaction, client);
    if (interaction.isModalSubmit()) return await handleModal(interaction, client);
  } catch (err) {
    client.logger.error(`interaction ${interaction.id}`, err);
    const payload = { embeds: [errEmbed('Something broke', 'That failed on my end. Try again — staff have been notified.')], flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}

async function handleCommand(interaction, client) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  client.logger.info(`/${interaction.commandName} by ${interaction.user.tag} in ${interaction.guild?.name ?? 'DM'}`);
  await command.execute(interaction, client);
}

/* ------------------------------ buttons ----------------------------- */

async function handleButton(interaction, client) {
  const [ns, action, arg] = interaction.customId.split(':');

  if (ns === 'gw' && action === 'enter') return enterGiveaway(interaction, client, arg);
  if (ns === 'gw' && action === 'entries') return showEntries(interaction, arg);
  if (ns === 'gw' && action === 'create') return openCreateModal(interaction);

  if (ns === 'rw' && action === 'rank') {
    return interaction.reply({ embeds: [buildRankEmbed(interaction.guild, interaction.user, interaction.member)], flags: MessageFlags.Ephemeral });
  }
  if (ns === 'rw' && action === 'board') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return interaction.editReply({ embeds: [await buildLeaderboard(interaction.guild, 10)] });
  }
  if (ns === 'rw' && action === 'how') {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.chat)
          .setTitle(`${EMOJI.chart} How XP works`)
          .setDescription(
            [
              '• **15–25 XP** per message, at most once every **60 seconds**.',
              '• Messages under 2 characters are ignored.',
              '• Info, staff and giveaway channels give **no XP** — chat in general, media and memes.',
              '• Your **Patron tier** and **Chat Level** role multiply your XP (they stack).',
              '• Levels use a rising curve: `5·L² + 50·L + 100` XP per level.',
              '',
              'Reward roles are granted **automatically** the moment you hit the level.',
            ].join('\n'),
          )
          .setFooter({ text: BRAND.footer }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function enterGiveaway(interaction, client, giveawayId) {
  const gw = getGiveaway(giveawayId);
  if (!gw) return interaction.reply({ embeds: [errEmbed('Gone', 'That giveaway no longer exists.')], flags: MessageFlags.Ephemeral });
  if (gw.ended || gw.cancelled) return interaction.reply({ embeds: [errEmbed('Closed', 'This giveaway has already ended.')], flags: MessageFlags.Ephemeral });

  const cfg = getGuildConfig(interaction.guild.id);
  const member = interaction.member;

  if (gw.patronOnly) {
    const patronRoleIds = PATRON_KEYS.map((k) => cfg.roles?.[k]).filter(Boolean);
    if (!patronRoleIds.some((id) => member.roles.cache.has(id))) {
      return interaction.reply({
        embeds: [errEmbed('Patron only', `This one is for patrons. ${cfg.channels?.patreonInfo ? `See <#${cfg.channels.patreonInfo}>.` : ''}`)],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  if (gw.requiredRole && !member.roles.cache.has(gw.requiredRole)) {
    return interaction.reply({ embeds: [errEmbed('Missing role', `You need <@&${gw.requiredRole}> to enter this one.`)], flags: MessageFlags.Ephemeral });
  }

  // Toggle: entering twice leaves.
  if (hasEntry(gw.id, interaction.user.id)) {
    removeEntry(gw.id, interaction.user.id);
    await refreshGiveaway(client, gw.id);
    return interaction.reply({ embeds: [okEmbed('Entry removed', `You left **${gw.prize}**. Press Enter again to rejoin.`)], flags: MessageFlags.Ephemeral });
  }

  const buffs = memberBuffs(member);
  addEntry(gw.id, interaction.user.id, buffs.entries);
  await refreshGiveaway(client, gw.id);

  const detail = [
    buffs.patron ? `${buffs.patron.name} **+${buffs.patron.entryBonus}**` : null,
    buffs.chat ? `${buffs.chat.name} **+${buffs.chat.entryBonus}**` : null,
  ].filter(Boolean);

  return interaction.reply({
    embeds: [
      okEmbed(
        "You're in",
        [
          `**${gw.prize}** — you have **${buffs.entries}** ${buffs.entries === 1 ? 'entry' : 'entries'}.`,
          detail.length ? `\nBase **1** · ${detail.join(' · ')}` : '\nChat more or become a patron for bonus entries.',
          `\nWinners drawn <t:${Math.floor(gw.endsAt / 1000)}:R>.`,
        ].join(''),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function showEntries(interaction, giveawayId) {
  const gw = getGiveaway(giveawayId);
  if (!gw) return interaction.reply({ embeds: [errEmbed('Gone', 'That giveaway no longer exists.')], flags: MessageFlags.Ephemeral });
  const e = countEntries(gw.id);
  const mine = hasEntry(gw.id, interaction.user.id);
  const buffs = memberBuffs(interaction.member);

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.giveaway)
        .setTitle(`${EMOJI.people} ${gw.prize}`)
        .setDescription(
          [
            `**${e.people}** ${e.people === 1 ? 'person has' : 'people have'} entered (**${e.weight}** weighted entries).`,
            `**${gw.winnerCount}** winner${gw.winnerCount > 1 ? 's' : ''} · drawn <t:${Math.floor(gw.endsAt / 1000)}:R>`,
            '',
            mine ? `${EMOJI.check} You're entered with **${buffs.entries}** ${buffs.entries === 1 ? 'entry' : 'entries'}.` : `${EMOJI.cross} You haven't entered yet.`,
            mine && e.weight > 0 ? `Your odds: **${((buffs.entries / e.weight) * 100).toFixed(1)}%** per winner slot.` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .setFooter({ text: BRAND.footer }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

/* ------------------------- create giveaway modal --------------------- */

async function openCreateModal(interaction) {
  const cfg = getGuildConfig(interaction.guild.id);
  const funderId = cfg.roles?.giveawayFunder;
  const isStaff = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  const isFunder = funderId && interaction.member.roles.cache.has(funderId);
  const isManager = cfg.roles?.giveawayManager && interaction.member.roles.cache.has(cfg.roles.giveawayManager);

  if (!isStaff && !isFunder && !isManager) {
    return interaction.reply({
      embeds: [errEmbed('Funder role required', `Only ${funderId ? `<@&${funderId}>` : '**💰 Giveaway Funder**'} members can create giveaways.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder().setCustomId(IDS.giveawayModal).setTitle('Create a Giveaway');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('prize').setLabel('Prize').setPlaceholder('e.g. Nitro Classic (1 month)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('duration').setLabel('Duration (30m, 2h, 3d, 1w)').setPlaceholder('24h').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('winners').setLabel('Number of winners').setPlaceholder('1').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description / requirements (optional)')
        .setPlaceholder('Must be able to receive a gift on Steam.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('patron').setLabel('Patron only? (yes/no)').setPlaceholder('no').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(3),
    ),
  );

  await interaction.showModal(modal);
}

async function handleModal(interaction, client) {
  if (interaction.customId !== IDS.giveawayModal) return;

  const prize = interaction.fields.getTextInputValue('prize').trim();
  const durationRaw = interaction.fields.getTextInputValue('duration').trim();
  const winnersRaw = interaction.fields.getTextInputValue('winners')?.trim();
  const description = interaction.fields.getTextInputValue('description')?.trim() || null;
  const patronRaw = interaction.fields.getTextInputValue('patron')?.trim().toLowerCase();

  const ms = parseDuration(durationRaw);
  if (!ms || ms < 10_000) {
    return interaction.reply({ embeds: [errEmbed('Invalid duration', `\`${durationRaw}\` isn't valid. Use \`30m\`, \`2h\`, \`3d\`, \`1w\` or \`1d12h\`.`)], flags: MessageFlags.Ephemeral });
  }

  const winnerCount = Math.min(Math.max(parseInt(winnersRaw || '1', 10) || 1, 1), 20);
  const cfg = getGuildConfig(interaction.guild.id);
  const target = cfg.channels?.giveaways ? await interaction.guild.channels.fetch(cfg.channels.giveaways).catch(() => null) : interaction.channel;

  if (!target?.isTextBased()) {
    return interaction.reply({ embeds: [errEmbed('No giveaway channel', 'Run `/setup` first so I have somewhere to post.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const gw = createGiveaway({
    id: makeId(),
    guildId: interaction.guild.id,
    channelId: target.id,
    hostId: interaction.user.id,
    prize,
    description,
    winnerCount,
    endsAt: Date.now() + ms,
    patronOnly: ['yes', 'y', 'true', '1'].includes(patronRaw),
  });

  try {
    const msg = await publishGiveaway(client, gw);
    await logGiveaway(client, interaction.guild.id, {
      title: 'Giveaway created (modal)',
      description: `**${prize}** · ID \`${gw.id}\`\nHost: <@${interaction.user.id}>\nEnds in ${formatDuration(ms)} · ${winnerCount} winner(s)`,
      color: COLORS.success,
    });
    await interaction.editReply({ embeds: [okEmbed('Giveaway live', `**${prize}** is up in ${target}.\nEnds in **${formatDuration(ms)}** · ID \`${gw.id}\`\n\n${msg.url}`)] });
  } catch (err) {
    await interaction.editReply({ embeds: [errEmbed('Could not post the giveaway', err.message)] });
  }
}
