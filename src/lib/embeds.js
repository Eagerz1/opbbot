/**
 * Every embed the bot posts. Kept in one place so branding stays consistent.
 */
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BRAND, COLORS, EMOJI, IDS } from '../config/constants.js';
import { PATRON_TIERS, CHAT_LEVEL_ROLES } from '../config/blueprint.js';

const base = (color = COLORS.primary) => new EmbedBuilder().setColor(color).setFooter({ text: BRAND.footer });

const mention = (id) => (id ? `<@&${id}>` : '`role missing`');
const chan = (id) => (id ? `<#${id}>` : '`channel missing`');

/* ------------------------------ panels ------------------------------ */

export function welcomeEmbed(ctx = {}) {
  return base(COLORS.primary)
    .setTitle(`${EMOJI.gift} Welcome to ${BRAND.name}`)
    .setDescription(
      [
        '**The server where talking gets you free stuff.**',
        '',
        `${EMOJI.check} Read ${chan(ctx.channels?.rules)} first — breaking them voids your entries.`,
        `${EMOJI.gift} Live giveaways drop in ${chan(ctx.channels?.giveaways)}.`,
        `${EMOJI.chart} Chat in ${chan(ctx.channels?.general)} to earn XP and unlock buffs in ${chan(ctx.channels?.chatRewards)}.`,
        `${EMOJI.star} Want more entries? ${chan(ctx.channels?.patreonInfo)} stacks on top.`,
        `${EMOJI.money} Funding a prize? Grab ${mention(ctx.roles?.giveawayFunder)} and use ${chan(ctx.channels?.createGiveaway)}.`,
      ].join('\n'),
    )
    .addFields(
      { name: 'Getting started', value: '`/rank` — your level\n`/rewards` — the buff ladder\n`/patreon` — tiers & perks', inline: true },
      { name: 'Entering giveaways', value: 'Hit **Enter** on any giveaway post. Bonus entries apply automatically.', inline: true },
    );
}

export function rulesEmbed() {
  return base(COLORS.danger)
    .setTitle(`${EMOJI.shield} Server Rules`)
    .setDescription('Enforced by the staff team. Ignorance is not a defence.')
    .addFields(
      { name: '1. Be decent', value: 'No harassment, hate speech, slurs or personal attacks. Zero tolerance.' },
      { name: '2. No spam', value: 'No mass mention, no walls of emoji, no self-promo without permission. XP farming = reset to level 0.' },
      { name: '3. One account per person', value: 'Alt accounts entering giveaways = permanent ban from all giveaways.' },
      { name: '4. Keep it SFW', value: 'No NSFW, gore or shock content anywhere, including avatars and nicknames.' },
      { name: '5. No scamming', value: 'No begging, no fake giveaways, no DM trades. Real giveaways only ever come from the bot.' },
      { name: '6. English in main chat', value: 'So staff can moderate. Any language is fine in VC.' },
      { name: '7. Staff have final say', value: 'Arguing a ruling in public chat gets you a timeout. Open a ticket instead.' },
      { name: `${EMOJI.warn} Giveaway integrity`, value: 'Winners have **24 hours** to claim. Unclaimed prizes are rerolled. Fake proof = permaban.' },
    );
}

export function faqEmbed(ctx = {}) {
  return base(COLORS.info)
    .setTitle(`${EMOJI.ticket} Frequently Asked Questions`)
    .addFields(
      { name: 'How do I enter a giveaway?', value: `Go to ${chan(ctx.channels?.giveaways)} and press **🎁 Enter**. That's it.` },
      { name: 'How do I get more entries?', value: 'Two stacking sources: your **Patron tier** (+1 to +8) and your **Chat Level role** (+1 to +8). Max 17 entries.' },
      { name: 'How do I earn XP?', value: '15–25 XP per message, once a minute, in normal chat channels. Multipliers from patron & chat roles apply.' },
      { name: 'How do I host a giveaway?', value: `You need the ${mention(ctx.roles?.giveawayFunder)} role, then use ${chan(ctx.channels?.createGiveaway)}.` },
      { name: 'I won — what now?', value: 'The bot DMs you and pings you in the giveaway. Reply within **24h** or it gets rerolled.' },
      { name: 'Do Patron perks stack with chat levels?', value: '**Yes.** Entry bonuses add together and XP multipliers multiply.' },
    );
}

export function rolesPanelEmbed(ctx = {}) {
  return base(COLORS.primary)
    .setTitle(`${EMOJI.sparkles} Self-Assignable Roles`)
    .setDescription('Pick up the roles you want. Staff can wire these to a reaction-role menu.')
    .addFields(
      { name: `${mention(ctx.roles?.giveawayPing)}`, value: 'Get pinged every time a new giveaway goes live.', inline: false },
      { name: `${mention(ctx.roles?.member)}`, value: 'Default role, granted once you accept the rules.', inline: false },
      { name: `${mention(ctx.roles?.giveawayFunder)}`, value: `Want to fund a prize? Ask staff — unlocks ${chan(ctx.channels?.createGiveaway)}.`, inline: false },
    );
}

/** The create-giveaway panel — funder gated. */
export function createGiveawayPanel(ctx = {}) {
  const embed = base(COLORS.giveaway)
    .setTitle(`${EMOJI.money} Launch a Giveaway`)
    .setDescription(
      [
        `You can see this channel because you hold ${mention(ctx.roles?.giveawayFunder)}.`,
        '',
        '**Two ways to start:**',
        '> Press the button below for a guided form, or',
        '> run `/giveaway create prize:<thing> duration:<1h/2d> winners:<n>`',
        '',
        `Your giveaway posts publicly in ${chan(ctx.channels?.giveaways)} and every action is logged.`,
      ].join('\n'),
    )
    .addFields(
      { name: 'Duration format', value: '`30m` `2h` `3d` `1w` — or combine: `1d12h`', inline: true },
      { name: 'Winners', value: '1–20 per giveaway', inline: true },
      { name: 'Patron only?', value: 'Set `patron_only: true` to restrict it', inline: true },
      { name: `${EMOJI.warn} Funder responsibilities`, value: 'You supply the prize. Failing to deliver = role removed and a ban from hosting.' },
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.giveawayCreateButton).setLabel('Create Giveaway').setEmoji('🎁').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

export function giveawayRulesEmbed() {
  return base(COLORS.giveaway)
    .setTitle(`${EMOJI.trophy} Giveaway Rules & How Entries Work`)
    .setDescription('Read this before you complain about losing.')
    .addFields(
      { name: 'Base entry', value: 'Everyone gets **1 entry** for pressing Enter.' },
      {
        name: 'Bonus entries (they stack)',
        value: [
          '**Patron tiers:** ' + PATRON_TIERS.map((t) => `${t.name} +${t.entryBonus}`).join(' · '),
          '**Chat levels:** ' + CHAT_LEVEL_ROLES.map((c) => `Lvl ${c.level} +${c.entryBonus}`).join(' · '),
          '',
          `Maximum possible: **${1 + 8 + 8} entries**.`,
        ].join('\n'),
      },
      { name: 'Claiming', value: 'Winners are DMed and pinged. **24 hours** to respond or the prize is rerolled.' },
      { name: 'Disqualification', value: 'Alt accounts, XP farming, leaving and rejoining to dodge requirements — instant DQ.' },
      { name: 'Rerolls', value: 'Staff can `/giveaway reroll` at any time for unclaimed or DQed winners.' },
    );
}

export function patreonEmbed(ctx = {}) {
  const embed = base(COLORS.patron)
    .setTitle(`${EMOJI.star} Patreon Tiers`)
    .setDescription(
      [
        'Support OPB and get more chances at every prize.',
        'Perks apply **automatically** the moment you get your tier role.',
        '',
        '**Entry bonuses stack with chat level roles.**',
      ].join('\n'),
    );

  for (const t of PATRON_TIERS) {
    const roleId = ctx.roles?.[t.key];
    embed.addFields({
      name: `${t.name} — ${t.price}/mo`,
      value: [
        roleId ? `Role: <@&${roleId}>` : null,
        `**+${t.entryBonus} entries** · **${t.xpMultiplier}× XP**`,
        ...t.perks.map((p) => `• ${p}`),
      ]
        .filter(Boolean)
        .join('\n'),
      inline: false,
    });
  }

  if (process.env.PATREON_URL) embed.setURL(process.env.PATREON_URL);
  return embed;
}

/** The chat rewards embed the user asked for. */
export function chatRewardsEmbed(ctx = {}) {
  const embed = base(COLORS.chat)
    .setTitle(`${EMOJI.chart} Chat Rewards`)
    .setDescription(
      [
        '**Talk. Level up. Get buffs.**',
        '',
        '`15–25 XP` per message · `60s` cooldown · no XP in bot/staff channels.',
        'Hit a milestone and the role is handed to you automatically.',
      ].join('\n'),
    );

  for (const c of CHAT_LEVEL_ROLES) {
    const roleId = ctx.roles?.[c.key];
    embed.addFields({
      name: `Level ${c.level} → ${c.name}`,
      value: [roleId ? `<@&${roleId}>` : null, ...c.perks.map((p) => `• ${p}`)].filter(Boolean).join('\n'),
      inline: true,
    });
  }

  embed.addFields({
    name: '\u200b',
    value: `Check your progress with \`/rank\` · see the top 10 with \`/leaderboard\``,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.rewardsRank).setLabel('My Rank').setEmoji('📊').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(IDS.rewardsBoard).setLabel('Leaderboard').setEmoji('🏅').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.rewardsHow).setLabel('How XP Works').setEmoji('❓').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/* ----------------------------- giveaways ---------------------------- */

export function giveawayEmbed(gw, { entries = { people: 0, weight: 0 }, hostTag, ended = false, winners = [] } = {}) {
  const endsUnix = Math.floor(gw.endsAt / 1000);
  const embed = new EmbedBuilder()
    .setColor(ended ? COLORS.dark : COLORS.giveaway)
    .setTitle(`${EMOJI.gift} ${gw.prize}`)
    .setFooter({ text: `${BRAND.footer} · ID ${gw.id}` })
    .setTimestamp(gw.endsAt);

  const lines = [];
  if (gw.description) lines.push(gw.description, '');

  if (ended) {
    lines.push(
      winners.length ? `${EMOJI.trophy} **Winners:** ${winners.map((w) => `<@${w}>`).join(', ')}` : `${EMOJI.cross} **No valid entries.**`,
      `Ended <t:${endsUnix}:R>`,
    );
  } else {
    lines.push(`${EMOJI.clock} Ends <t:${endsUnix}:R> · <t:${endsUnix}:f>`);
  }

  lines.push(
    `${EMOJI.people} **Entries:** ${entries.people} ${entries.weight !== entries.people ? `(${entries.weight} weighted)` : ''}`,
    `${EMOJI.trophy} **Winners:** ${gw.winnerCount}`,
    `${EMOJI.crown} **Hosted by:** ${hostTag ? hostTag : `<@${gw.hostId}>`}`,
  );

  if (gw.patronOnly) lines.push(`${EMOJI.star} **Patron only** — you need any Patron tier to enter.`);
  if (gw.requiredRole) lines.push(`${EMOJI.shield} **Required role:** <@&${gw.requiredRole}>`);

  embed.setDescription(lines.join('\n'));
  return embed;
}

export function giveawayComponents(gw, { disabled = false, entryCount = 0 } = {}) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${IDS.giveawayEnter}:${gw.id}`)
        .setLabel(disabled ? 'Giveaway Ended' : 'Enter')
        .setEmoji('🎁')
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`${IDS.giveawayEntries}:${gw.id}`)
        .setLabel(`Entries: ${entryCount}`)
        .setEmoji('👥')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

/* ------------------------------ utility ----------------------------- */

export function okEmbed(title, description) {
  return base(COLORS.success).setTitle(`${EMOJI.check} ${title}`).setDescription(description ?? null);
}

export function errEmbed(title, description) {
  return base(COLORS.danger).setTitle(`${EMOJI.cross} ${title}`).setDescription(description ?? null);
}

export function infoEmbed(title, description) {
  return base(COLORS.info).setTitle(title).setDescription(description ?? null);
}
