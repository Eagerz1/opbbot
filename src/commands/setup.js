import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { runSetup, summarize } from '../lib/setup-engine.js';
import { CATEGORIES, ROLES, SEPARATORS, countPlan, channelName } from '../config/blueprint.js';
import { BRAND, COLORS, EMOJI } from '../config/constants.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Build the full OPB Giveaways server: roles, categories, channels and info panels.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName('separator')
      .setDescription('Style for "emoji | channel" names (default: 🎁│general)')
      .addChoices(
        { name: '🎁│general  (bar - recommended)', value: SEPARATORS.bar },
        { name: '🎁｜general  (fullwidth)', value: SEPARATORS.fullwidth },
        { name: '🎁-general  (dash)', value: SEPARATORS.dash },
        { name: '🎁|general  (plain pipe)', value: SEPARATORS.pipe },
      ),
  )
  .addBooleanOption((o) => o.setName('preview').setDescription('Show exactly what would be created without touching the server'))
  .addBooleanOption((o) => o.setName('panels').setDescription('Post the info/rules/patreon/rewards embeds (default: true)'))
  .addBooleanOption((o) =>
    o.setName('clean').setDescription('DELETE every existing channel first, then build fresh (cannot be undone)'),
  );

export async function execute(interaction) {
  const separator = interaction.options.getString('separator') ?? SEPARATORS.bar;
  const dryRun = interaction.options.getBoolean('preview') ?? false;
  const postPanels = interaction.options.getBoolean('panels') ?? true;
  const clean = interaction.options.getBoolean('clean') ?? false;
  const plan = countPlan();

  if (dryRun) {
    await interaction.reply({ embeds: [planEmbed(separator, plan, clean)], flags: MessageFlags.Ephemeral });
    return;
  }

  const existingCount = clean ? interaction.guild.channels.cache.size : 0;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(clean ? COLORS.warning : COLORS.primary)
        .setTitle(`${EMOJI.gift} Building ${BRAND.name}…`)
        .setDescription(
          [
            clean ? `**Deleting ${existingCount} existing channel(s)** first.` : null,
            `Creating **${plan.roles} roles**, **${plan.categories} categories** and **${plan.channels} channels**.`,
            'This takes about 30–60 seconds — Discord rate limits channel creation.',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .setFooter({ text: BRAND.footer }),
    ],
  });

  const progress = [];
  let report;
  try {
    report = await runSetup(interaction.guild, {
      separator,
      postPanels,
      clean,
      invokedChannelId: interaction.channelId,
      actorId: interaction.user.id,
      onProgress: (msg) => progress.push(msg),
    });
  } catch (err) {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLORS.danger).setTitle(`${EMOJI.cross} Setup failed`).setDescription(err.message)],
    });
    return;
  }

  const s = summarize(report);
  const cfgChannels = report.channels.created.concat(report.channels.adopted);
  const find = (key) => cfgChannels.find((c) => c.key === key)?.id;

  const embed = new EmbedBuilder()
    .setColor(s.failures ? COLORS.warning : COLORS.success)
    .setTitle(`${EMOJI.check} ${BRAND.name} is ready`)
    .setDescription(
      [
        report.deleted?.channels.length ? `_Deleted ${report.deleted.channels.length} old channel(s) first._` : '',
        `**${s.roles}** roles · **${s.categories}** categories · **${s.channels}** channels · **${s.panels}** panels posted`,
        report.roles.adopted.length || report.channels.adopted.length
          ? `_Reused ${report.roles.adopted.length} existing role(s) and ${report.channels.adopted.length} existing channel(s)._`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .addFields(
      {
        name: `${EMOJI.gift} OPB Giveaways`,
        value: [
          find('giveaways') ? `<#${find('giveaways')}> — live giveaways` : null,
          find('createGiveaway') ? `<#${find('createGiveaway')}> — **Giveaway Funder only**` : null,
          find('winners') ? `<#${find('winners')}> — hall of fame` : null,
        ]
          .filter(Boolean)
          .join('\n') || '—',
        inline: false,
      },
      {
        name: `${EMOJI.star} Patreon & Rewards`,
        value: [
          find('patreonInfo') ? `<#${find('patreonInfo')}> — Patron → Patron ++++` : null,
          find('chatRewards') ? `<#${find('chatRewards')}> — chat rewards embed` : null,
        ]
          .filter(Boolean)
          .join('\n') || '—',
        inline: false,
      },
      {
        name: `${EMOJI.warn} Do this now`,
        value: [
          '1. **Server Settings → Roles** → drag my role to the very top so I can assign reward roles.',
          '2. Give your prize sponsors the **💰 Giveaway Funder** role.',
          '3. Link your Patreon tiers to the five Patron roles.',
        ].join('\n'),
      },
    )
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  if (report.warnings.length) embed.addFields({ name: `${EMOJI.warn} Warnings`, value: report.warnings.join('\n').slice(0, 1024) });

  if (s.failures) {
    const fails = [...report.roles.failed, ...report.categories.failed, ...report.channels.failed]
      .slice(0, 8)
      .map((f) => `• \`${f.name}\` — ${f.error}`)
      .join('\n');
    embed.addFields({ name: `${EMOJI.cross} ${s.failures} item(s) failed`, value: fails.slice(0, 1024) });
  }

  await interaction.editReply({ embeds: [embed] });
}

function planEmbed(separator, plan, clean = false) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`${EMOJI.gift} Setup Preview — nothing was created`)
    .setDescription(
      [
        clean ? '\u26a0\ufe0f **clean:true** — every existing channel would be **deleted** first.' : null,
        `**${plan.roles}** roles \u00b7 **${plan.categories}** categories \u00b7 **${plan.channels}** channels (${plan.text} text, ${plan.voice} voice)`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .setFooter({ text: `${BRAND.footer} · run /setup without preview to build it` });

  for (const cat of CATEGORIES) {
    embed.addFields({
      name: cat.name,
      value: cat.channels
        .map((c) => {
          const n = channelName(c.emoji, c.name, separator, { lower: !c.preserveCase });
          const tag = c.type === 'voice' ? ' `voice`' : c.type === 'announcement' ? ' `news`' : '';
          const gate = c.key === 'createGiveaway' ? ' 🔒 funder' : c.overwrites ? ' 🔒' : '';
          return `\`${n}\`${tag}${gate}`;
        })
        .join('\n'),
      inline: true,
    });
  }

  const groups = ROLES.reduce((acc, r) => {
    (acc[r.group] ??= []).push(r.name);
    return acc;
  }, {});
  embed.addFields({
    name: '🎭 Roles',
    value: Object.entries(groups)
      .map(([g, names]) => `**${g}** — ${names.join(', ')}`)
      .join('\n')
      .slice(0, 1024),
  });

  return embed;
}
