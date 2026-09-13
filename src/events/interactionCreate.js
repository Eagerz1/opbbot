import { Events, MessageFlags, EmbedBuilder } from 'discord.js';
import { IDS, COLORS, EMOJI, BRAND } from '../config/constants.js';
import { errEmbed, okEmbed } from '../lib/embeds.js';
import { getGuildConfig, getGiveaway, hasEntry, addEntry, removeEntry, countEntries } from '../lib/store.js';
import { refreshGiveaway } from '../lib/giveaways.js';
import { memberBuffs } from '../lib/util.js';
import { buildRankEmbed } from '../commands/rank.js';
import { buildLeaderboard } from '../commands/leaderboard.js';
import { PATRON_KEYS } from '../config/blueprint.js';
import { roleStepComponents, readModal } from '../lib/giveaway-panel.js';
import { validateDraft, publishDraft, openCreatePanel } from '../lib/giveaway-create.js';
import { saveDraft, getDraft, updateDraft, deleteDraft } from '../lib/drafts.js';

export const name = Events.InteractionCreate;

export async function execute(interaction, client) {
  try {
    if (interaction.isChatInputCommand()) return await handleCommand(interaction, client);
    if (interaction.isButton()) return await handleButton(interaction, client);
    if (interaction.isRoleSelectMenu()) return await handleRoleSelect(interaction, client);
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

  if (ns === 'gw') {
    if (action === 'enter') return enterGiveaway(interaction, client, arg);
    if (action === 'entries') return showEntries(interaction, arg);
    if (action === 'create') return openCreatePanel(interaction);
    if (action === 'publish') return publishFromDraft(interaction, client, arg);
    if (action === 'discard') {
      deleteDraft(arg);
      return interaction.update({ embeds: [okEmbed('Discarded', 'That giveaway draft was thrown away.')], components: [] });
    }
  }

  if (ns === 'rw') {
    if (action === 'rank') {
      return interaction.reply({ embeds: [buildRankEmbed(interaction.guild, interaction.user, interaction.member)], flags: MessageFlags.Ephemeral });
    }
    if (action === 'board') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return interaction.editReply({ embeds: [await buildLeaderboard(interaction.guild, 10)] });
    }
    if (action === 'how') {
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
}

/* ---------------------------- modal submit --------------------------- */

async function handleModal(interaction, client) {
  const isMain = interaction.customId === IDS.giveawayModal;
  const isLegacy = interaction.customId === IDS.giveawayModalLegacy;
  if (!isMain && !isLegacy) return;

  const raw = readModal(interaction);
  const result = validateDraft(raw, { guild: interaction.guild });

  if (!result.ok) {
    return interaction.reply({
      embeds: [
        errEmbed('Check those fields', result.errors.join('\n')).setFooter({
          text: `${BRAND.footer} · nothing was created — just run /giveaway create again`,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const draft = result.value;

  // Legacy path: no role picker in the modal, so ask for roles next.
  if (isLegacy) {
    const draftId = saveDraft(interaction.user.id, draft);
    return interaction.reply({
      embeds: [draftPreviewEmbed(draft, interaction)],
      components: roleStepComponents(draftId),
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await finishPublish(interaction, client, draft);
}

/* ------------------- fallback flow: role step + publish -------------- */

async function handleRoleSelect(interaction, client) {
  const [ns, action, draftId] = interaction.customId.split(':');
  if (ns !== 'gw' || action !== 'roles') return;

  const draft = getDraft(draftId, interaction.user.id);
  if (!draft) {
    return interaction.update({ embeds: [errEmbed('Draft expired', 'That draft is gone. Run `/giveaway create` again.')], components: [] });
  }

  const updated = updateDraft(draftId, { roleIds: interaction.values ?? [] });
  return interaction.update({ embeds: [draftPreviewEmbed(updated, interaction)], components: roleStepComponents(draftId) });
}

async function publishFromDraft(interaction, client, draftId) {
  const draft = getDraft(draftId, interaction.user.id);
  if (!draft) {
    return interaction.update({ embeds: [errEmbed('Draft expired', 'That draft is gone. Run `/giveaway create` again.')], components: [] });
  }
  await interaction.deferUpdate();
  deleteDraft(draftId);
  await finishPublish(interaction, client, draft, { viaUpdate: true });
}

/** Publish and report back, shared by both flows. */
async function finishPublish(interaction, client, draft, { viaUpdate = false } = {}) {
  const respond = (payload) => (viaUpdate ? interaction.editReply({ ...payload, components: [] }) : interaction.editReply(payload));

  try {
    const { giveaway, message, channel } = await publishDraft(interaction, draft);

    const notes = [];
    if (draft.droppedRoles?.length) notes.push(`_Ignored: ${draft.droppedRoles.join(', ')}._`);

    await respond({
      embeds: [
        okEmbed(
          'Giveaway is live',
          [
            `**${giveaway.title}**`,
            `Prize: ${draft.prize}`,
            `${draft.winnerCount} winner${draft.winnerCount > 1 ? 's' : ''} · ends in **${draft.durationLabel}**`,
            draft.roleIds?.length ? `Restricted to ${draft.roleIds.map((r) => `<@&${r}>`).join(', ')}` : 'Open to everyone',
            '',
            `Posted in ${channel} → ${message.url}`,
            `ID \`${giveaway.id}\``,
            ...notes,
          ].join('\n'),
        ),
      ],
    });
  } catch (err) {
    client.logger.error('publish giveaway', err);
    await respond({ embeds: [errEmbed('Could not post the giveaway', err.message)] });
  }
}

function draftPreviewEmbed(draft, interaction) {
  return new EmbedBuilder()
    .setColor(COLORS.giveaway)
    .setTitle(`${EMOJI.gift} ${draft.title}`)
    .setDescription('Pick an optional required role, then hit **Publish**.')
    .addFields(
      { name: 'Prize', value: draft.prize.slice(0, 1024) },
      { name: 'Winners', value: String(draft.winnerCount), inline: true },
      { name: 'Duration', value: draft.durationLabel, inline: true },
      {
        name: 'Required role',
        value: draft.roleIds?.length ? draft.roleIds.map((r) => `<@&${r}>`).join(', ') : '_Anyone can enter_',
        inline: true,
      },
    )
    .setFooter({ text: `${BRAND.footer} · nothing is posted until you publish` });
}

/* ---------------------------- entering ------------------------------ */

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

  // Required roles: 'any' (default) or 'all'.
  const required = gw.requiredRoles ?? [];
  if (required.length) {
    const held = required.filter((id) => member.roles.cache.has(id));
    const passes = gw.requiredMode === 'all' ? held.length === required.length : held.length > 0;
    if (!passes) {
      const missing = required.filter((id) => !member.roles.cache.has(id));
      return interaction.reply({
        embeds: [
          errEmbed(
            'You need a role to enter',
            gw.requiredMode === 'all'
              ? `This giveaway needs **all** of: ${required.map((r) => `<@&${r}>`).join(', ')}\n\nYou're missing: ${missing.map((r) => `<@&${r}>`).join(', ')}`
              : `This giveaway is limited to ${required.map((r) => `<@&${r}>`).join(' or ')}.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // Toggle: entering twice leaves.
  if (hasEntry(gw.id, interaction.user.id)) {
    removeEntry(gw.id, interaction.user.id);
    await refreshGiveaway(client, gw.id);
    return interaction.reply({ embeds: [okEmbed('Entry removed', `You left **${gw.title ?? gw.prize}**. Press Enter again to rejoin.`)], flags: MessageFlags.Ephemeral });
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
          `**${gw.title ?? gw.prize}** — you have **${buffs.entries}** ${buffs.entries === 1 ? 'entry' : 'entries'}.`,
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
        .setTitle(`${EMOJI.people} ${gw.title ?? gw.prize}`)
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
