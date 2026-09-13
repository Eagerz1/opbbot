/**
 * The OPB Giveaways server blueprint.
 *
 * This single file is the source of truth for everything `/setup` builds:
 * roles, categories, channels and their permission overwrites. The preview
 * site and the tests read from here too, so the docs can never drift.
 *
 * Permission overwrites are expressed as role KEYS (see ROLES) plus the two
 * pseudo-keys `@everyone` and `@bot`. They are resolved at runtime.
 */

/* ------------------------------------------------------------------ *
 * Channel name formatting: "emoji │ channel"
 * ------------------------------------------------------------------ */

/**
 * Discord lowercases text-channel names and turns spaces into dashes, so a
 * literal "🎁 | general" becomes "🎁-|-general". Every big server solves this
 * with a box-drawing bar and no spaces. Both styles are offered on /setup.
 */
export const SEPARATORS = {
  bar: '│', // 🎁│general      (default - clean, no dashes)
  fullwidth: '｜', // 🎁｜general
  dash: '-', // 🎁-general
  pipe: '|', // 🎁|general
};

export const DEFAULT_SEPARATOR = SEPARATORS.bar;

/**
 * Build a channel name in `emoji│name` format.
 * Text/forum names are lowercased by Discord anyway - we do it up front so
 * what we log is what actually gets created. Voice channels keep their case.
 */
export function channelName(emoji, name, separator = DEFAULT_SEPARATOR, { lower = true } = {}) {
  const label = lower ? name.toLowerCase().replace(/\s+/g, '-') : name;
  return `${emoji}${separator}${label}`;
}

/* ------------------------------------------------------------------ *
 * Roles
 * ------------------------------------------------------------------ */

/** Patron ladder: Patron -> Patron ++++ (5 tiers, ascending power). */
export const PATRON_TIERS = [
  {
    key: 'patron1',
    name: '💗 Patron',
    tier: 1,
    color: 0xff8ac4,
    price: '$3',
    entryBonus: 1,
    xpMultiplier: 1.1,
    perks: [
      'Patron-only chat + giveaway feed',
      '+1 bonus giveaway entry',
      '1.1× chat XP',
      'Patron role colour & hoisted above members',
    ],
  },
  {
    key: 'patron2',
    name: '💖 Patron +',
    tier: 2,
    color: 0xff5fae,
    price: '$5',
    entryBonus: 2,
    xpMultiplier: 1.25,
    perks: [
      'Everything in Patron',
      '+2 bonus giveaway entries',
      '1.25× chat XP',
      'Access to patron-only giveaways',
    ],
  },
  {
    key: 'patron3',
    name: '💝 Patron ++',
    tier: 3,
    color: 0xeb459e,
    price: '$10',
    entryBonus: 3,
    xpMultiplier: 1.5,
    perks: [
      'Everything in Patron +',
      '+3 bonus giveaway entries',
      '1.5× chat XP',
      'Priority support in the ticket queue',
    ],
  },
  {
    key: 'patron4',
    name: '💜 Patron +++',
    tier: 4,
    color: 0xa855f7,
    price: '$25',
    entryBonus: 5,
    xpMultiplier: 1.75,
    perks: [
      'Everything in Patron ++',
      '+5 bonus giveaway entries',
      '1.75× chat XP',
      'Monthly patron-exclusive drop',
    ],
  },
  {
    key: 'patron5',
    name: '👑 Patron ++++',
    tier: 5,
    color: 0xffd700,
    price: '$50',
    entryBonus: 8,
    xpMultiplier: 2,
    perks: [
      'Everything in Patron +++',
      '+8 bonus giveaway entries (the hard cap)',
      '2× chat XP',
      'Name in the credits + a say in what we give away next',
    ],
  },
];

/** Chat reward ladder: 5 roles, each one a real buff. */
export const CHAT_LEVEL_ROLES = [
  {
    key: 'chat5',
    name: '🗨️ Chat Lvl 5',
    level: 5,
    color: 0x95e1d3,
    entryBonus: 1,
    xpMultiplier: 1.05,
    perks: ['+1 giveaway entry', '1.05× XP', 'Embed links & external emoji in chat'],
  },
  {
    key: 'chat10',
    name: '💬 Chat Lvl 10',
    level: 10,
    color: 0x4ecdc4,
    entryBonus: 2,
    xpMultiplier: 1.1,
    perks: ['+2 giveaway entries', '1.1× XP', 'Attach files in media & memes'],
  },
  {
    key: 'chat25',
    name: '🔊 Chat Lvl 25',
    level: 25,
    color: 0x1abc9c,
    entryBonus: 3,
    xpMultiplier: 1.2,
    perks: ['+3 giveaway entries', '1.2× XP', 'Create threads + use the soundboard'],
  },
  {
    key: 'chat50',
    name: '🔥 Chat Lvl 50',
    level: 50,
    color: 0xff9f1c,
    entryBonus: 5,
    xpMultiplier: 1.35,
    perks: ['+5 giveaway entries', '1.35× XP', 'Hoisted in the member list'],
  },
  {
    key: 'chat100',
    name: '🌟 Chat Lvl 100',
    level: 100,
    color: 0xff6b6b,
    entryBonus: 8,
    xpMultiplier: 1.5,
    perks: ['+8 giveaway entries', '1.5× XP', 'Change your own nickname + veteran flex'],
  },
];

/**
 * All roles created by /setup, in creation order.
 * `position` is implied by order: first = highest.
 */
export const ROLES = [
  {
    key: 'owner',
    name: '👑 Owner',
    color: 0xff0055,
    hoist: true,
    mentionable: false,
    permissions: ['Administrator'],
    group: 'staff',
    description: 'Full control of the server.',
  },
  {
    key: 'admin',
    name: '🛡️ Admin',
    color: 0xed4245,
    hoist: true,
    mentionable: false,
    permissions: ['Administrator'],
    group: 'staff',
    description: 'Runs the server day to day.',
  },
  {
    key: 'mod',
    name: '🔨 Moderator',
    color: 0xfaa61a,
    hoist: true,
    mentionable: true,
    permissions: [
      'ManageMessages',
      'KickMembers',
      'BanMembers',
      'ModerateMembers',
      'MuteMembers',
      'DeafenMembers',
      'MoveMembers',
      'ManageThreads',
      'ViewAuditLog',
    ],
    group: 'staff',
    description: 'Keeps chat clean.',
  },
  {
    key: 'giveawayManager',
    name: '🎉 Giveaway Manager',
    color: 0x9b59b6,
    hoist: true,
    mentionable: true,
    permissions: ['ManageMessages'],
    group: 'giveaway',
    description: 'Can end, reroll and cancel any giveaway.',
  },
  {
    key: 'giveawayFunder',
    name: '💰 Giveaway Funder',
    color: 0x2ecc71,
    hoist: true,
    mentionable: true,
    permissions: [],
    group: 'giveaway',
    description: 'REQUIRED to see & use the create-giveaway channel. Funders pay for the prizes.',
  },
  ...PATRON_TIERS.map((t) => ({
    key: t.key,
    name: t.name,
    color: t.color,
    hoist: true,
    mentionable: false,
    permissions: [],
    group: 'patron',
    tier: t.tier,
    description: `Patreon tier ${t.tier} (${t.price}/mo) - +${t.entryBonus} entries, ${t.xpMultiplier}× XP.`,
  })),
  ...CHAT_LEVEL_ROLES.map((c) => ({
    key: c.key,
    name: c.name,
    color: c.color,
    hoist: c.level >= 50,
    mentionable: false,
    permissions:
      c.level >= 100
        ? ['ChangeNickname', 'EmbedLinks', 'AttachFiles', 'UseExternalEmojis', 'CreatePublicThreads']
        : c.level >= 25
          ? ['EmbedLinks', 'AttachFiles', 'UseExternalEmojis', 'CreatePublicThreads']
          : c.level >= 10
            ? ['EmbedLinks', 'AttachFiles', 'UseExternalEmojis']
            : ['EmbedLinks', 'UseExternalEmojis'],
    group: 'chat',
    level: c.level,
    description: `Chat reward at level ${c.level} - +${c.entryBonus} entries, ${c.xpMultiplier}× XP.`,
  })),
  {
    key: 'booster',
    name: '🚀 Server Booster',
    color: 0xf47fff,
    hoist: true,
    mentionable: false,
    permissions: [],
    group: 'community',
    managedHint: true,
    description: 'Cosmetic twin of the boost role (Discord manages the real one).',
  },
  {
    key: 'giveawayPing',
    name: '🔔 Giveaway Ping',
    color: 0x3498db,
    hoist: false,
    mentionable: true,
    permissions: [],
    group: 'community',
    description: 'Self-assign to get pinged on every new giveaway.',
  },
  {
    key: 'member',
    name: '👥 Member',
    color: 0x99aab5,
    hoist: false,
    mentionable: false,
    permissions: [],
    group: 'community',
    description: 'Everyone who passed the rules gate.',
  },
  {
    key: 'muted',
    name: '🔇 Muted',
    color: 0x4f545c,
    hoist: false,
    mentionable: false,
    permissions: [],
    group: 'moderation',
    description: 'Denied send/speak in every category.',
  },
];

export const ROLE_BY_KEY = Object.fromEntries(ROLES.map((r) => [r.key, r]));

export const PATRON_KEYS = PATRON_TIERS.map((t) => t.key);
export const CHAT_KEYS = CHAT_LEVEL_ROLES.map((c) => c.key);
export const STAFF_KEYS = ['owner', 'admin', 'mod'];

/* ------------------------------------------------------------------ *
 * Permission overwrite shorthands
 * ------------------------------------------------------------------ */

const READ_ONLY = {
  '@everyone': { allow: ['ViewChannel', 'ReadMessageHistory', 'AddReactions'], deny: ['SendMessages', 'CreatePublicThreads', 'CreatePrivateThreads'] },
  mod: { allow: ['SendMessages', 'ManageMessages'] },
  admin: { allow: ['SendMessages', 'ManageMessages'] },
  '@bot': { allow: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageMessages', 'AttachFiles'] },
};

const PUBLIC_TALK = {
  '@everyone': { allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'AddReactions'] },
  muted: { deny: ['SendMessages', 'AddReactions', 'Speak', 'SendMessagesInThreads'] },
};

const STAFF_ONLY = {
  '@everyone': { deny: ['ViewChannel'] },
  mod: { allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
  admin: { allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
  owner: { allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
  '@bot': { allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] },
};

/** Everyone hidden, every patron tier allowed. */
const PATRON_ONLY = {
  '@everyone': { deny: ['ViewChannel'] },
  ...Object.fromEntries(
    PATRON_KEYS.map((k) => [k, { allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'AddReactions', 'AttachFiles', 'EmbedLinks'] }]),
  ),
  mod: { allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
  admin: { allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
  muted: { deny: ['SendMessages', 'AddReactions'] },
  '@bot': { allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] },
};

/* ------------------------------------------------------------------ *
 * Categories + channels
 * ------------------------------------------------------------------ */

/**
 * type: 'text' | 'voice' | 'forum' | 'announcement' | 'stage'
 * panel: which auto-posted embed lands here (handled by lib/panels.js)
 */
export const CATEGORIES = [
  {
    key: 'information',
    name: '📋 INFORMATION',
    overwrites: READ_ONLY,
    channels: [
      { key: 'welcome', emoji: '👋', name: 'welcome', type: 'text', topic: 'Welcome to OPB! Start here.', panel: 'welcome' },
      { key: 'rules', emoji: '📜', name: 'rules', type: 'text', topic: 'Read these. Breaking them costs you your giveaway entries.', panel: 'rules' },
      { key: 'announcements', emoji: '📢', name: 'announcements', type: 'announcement', topic: 'Server-wide announcements from the OPB team.' },
      { key: 'updates', emoji: '📌', name: 'server-updates', type: 'text', topic: 'Changelog for the server & the bot.' },
      { key: 'faq', emoji: '❓', name: 'faq', type: 'text', topic: 'Frequently asked questions about OPB giveaways.', panel: 'faq' },
      { key: 'roles', emoji: '🎭', name: 'get-roles', type: 'text', topic: 'Grab your self-assignable roles.', panel: 'roles' },
    ],
  },
  {
    key: 'community',
    name: '💬 COMMUNITY',
    overwrites: PUBLIC_TALK,
    channels: [
      { key: 'general', emoji: '💬', name: 'general', type: 'text', topic: 'Main chat. Chat XP is earned here.', slowmode: 3 },
      { key: 'media', emoji: '🖼️', name: 'media', type: 'text', topic: 'Screenshots, clips and photos. Images only.', slowmode: 5 },
      { key: 'memes', emoji: '😂', name: 'memes', type: 'text', topic: 'Post your best. Reposts get you clowned.', slowmode: 5 },
      { key: 'botCommands', emoji: '🤖', name: 'bot-commands', type: 'text', topic: 'Spam /rank and /leaderboard in here.' },
      { key: 'counting', emoji: '🔢', name: 'counting', type: 'text', topic: "Don't break the chain." },
    ],
  },
  {
    key: 'voice',
    name: '🔊 VOICE CHANNELS',
    overwrites: {
      '@everyone': { allow: ['ViewChannel', 'Connect', 'Speak', 'Stream', 'UseVAD'] },
      muted: { deny: ['Speak', 'Stream'] },
    },
    channels: [
      { key: 'vcGeneral', emoji: '🔊', name: 'General VC', type: 'voice', preserveCase: true, userLimit: 0 },
      { key: 'vcGaming', emoji: '🎮', name: 'Gaming VC', type: 'voice', preserveCase: true, userLimit: 10 },
      { key: 'vcChill', emoji: '🎵', name: 'Chill VC', type: 'voice', preserveCase: true, userLimit: 5 },
    ],
  },
  {
    key: 'opb',
    name: '🎁 OPB GIVEAWAYS',
    overwrites: READ_ONLY,
    channels: [
      {
        key: 'giveaways',
        emoji: '🎁',
        name: 'opb-giveaways',
        type: 'text',
        topic: '🎁 Every live OPB giveaway lands here. Hit Enter on the ones you want.',
        overwrites: {
          '@everyone': { allow: ['ViewChannel', 'ReadMessageHistory', 'AddReactions'], deny: ['SendMessages'] },
          giveawayManager: { allow: ['SendMessages', 'ManageMessages'] },
          '@bot': { allow: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageMessages', 'MentionEveryone'] },
        },
      },
      {
        key: 'createGiveaway',
        emoji: '🛠️',
        name: 'create-giveaway',
        type: 'text',
        topic: '💰 Giveaway Funder only. Launch a giveaway with the button or /giveaway create.',
        panel: 'createGiveaway',
        /** The gated channel the user asked for: hidden unless you're a Funder. */
        overwrites: {
          '@everyone': { deny: ['ViewChannel'] },
          giveawayFunder: { allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'UseApplicationCommands', 'EmbedLinks', 'AttachFiles'] },
          giveawayManager: { allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'UseApplicationCommands', 'ManageMessages'] },
          admin: { allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'ManageMessages'] },
          owner: { allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'ManageMessages'] },
          '@bot': { allow: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageMessages'] },
        },
      },
      { key: 'winners', emoji: '🏆', name: 'giveaway-winners', type: 'text', topic: 'Hall of fame. Every winner, forever.' },
      { key: 'giveawayRules', emoji: '📜', name: 'giveaway-rules', type: 'text', topic: 'How entries, bonus entries and claims work.', panel: 'giveawayRules' },
      { key: 'proof', emoji: '📸', name: 'winner-proof', type: 'text', topic: 'Winners post their delivery proof here.' },
    ],
  },
  {
    key: 'patreon',
    name: '⭐ PATREON',
    overwrites: READ_ONLY,
    channels: [
      { key: 'patreonInfo', emoji: '⭐', name: 'patreon-perks', type: 'text', topic: 'Every tier from Patron to Patron ++++ and what it gets you.', panel: 'patreon' },
      { key: 'patronChat', emoji: '💎', name: 'patron-chat', type: 'text', topic: 'Patron-only lounge.', overwrites: PATRON_ONLY },
      {
        key: 'patronGiveaways',
        emoji: '🎁',
        name: 'patron-giveaways',
        type: 'text',
        topic: 'Giveaways only patrons can enter.',
        overwrites: {
          ...PATRON_ONLY,
          '@everyone': { deny: ['ViewChannel'] },
          ...Object.fromEntries(PATRON_KEYS.map((k) => [k, { allow: ['ViewChannel', 'ReadMessageHistory', 'AddReactions'], deny: ['SendMessages'] }])),
        },
      },
      { key: 'vcPatron', emoji: '💎', name: 'Patron VC', type: 'voice', preserveCase: true, overwrites: PATRON_ONLY },
    ],
  },
  {
    key: 'rewards',
    name: '🏅 CHAT REWARDS',
    overwrites: READ_ONLY,
    channels: [
      { key: 'chatRewards', emoji: '📈', name: 'chat-rewards', type: 'text', topic: 'Talk → earn XP → unlock buffs. Full ladder below.', panel: 'chatRewards' },
      { key: 'levelUps', emoji: '🎊', name: 'level-ups', type: 'text', topic: 'Level-up announcements.' },
      { key: 'leaderboard', emoji: '🏅', name: 'leaderboard', type: 'text', topic: 'Top chatters. Updated by /leaderboard.' },
    ],
  },
  {
    key: 'staff',
    name: '🛡️ STAFF',
    overwrites: STAFF_ONLY,
    staffOnly: true,
    channels: [
      { key: 'staffChat', emoji: '🛡️', name: 'staff-chat', type: 'text', topic: 'Staff only.' },
      { key: 'giveawayLogs', emoji: '📋', name: 'giveaway-logs', type: 'text', topic: 'Audit trail for every giveaway action.' },
      { key: 'modLogs', emoji: '📝', name: 'mod-logs', type: 'text', topic: 'Moderation audit log.' },
      { key: 'botLogs', emoji: '🤖', name: 'bot-logs', type: 'text', topic: 'OPB Giveaways bot diagnostics.' },
      { key: 'vcStaff', emoji: '🔒', name: 'Staff VC', type: 'voice', preserveCase: true, overwrites: STAFF_ONLY },
    ],
  },
];

/** Flat list of every channel with its category attached. */
export function allChannels() {
  return CATEGORIES.flatMap((cat) => cat.channels.map((ch) => ({ ...ch, category: cat.key, categoryName: cat.name })));
}

export function countPlan() {
  return {
    roles: ROLES.length,
    categories: CATEGORIES.length,
    channels: allChannels().length,
    text: allChannels().filter((c) => c.type === 'text' || c.type === 'announcement').length,
    voice: allChannels().filter((c) => c.type === 'voice').length,
  };
}

/** Total buff a member gets from their roles, used by the giveaway engine. */
export function buffsForRoleKeys(keys) {
  const set = new Set(keys);
  const patron = PATRON_TIERS.filter((t) => set.has(t.key)).sort((a, b) => b.tier - a.tier)[0] ?? null;
  const chat = CHAT_LEVEL_ROLES.filter((c) => set.has(c.key)).sort((a, b) => b.level - a.level)[0] ?? null;
  return {
    patron,
    chat,
    // Base entry is 1. Highest patron tier + highest chat role stack.
    entries: 1 + (patron?.entryBonus ?? 0) + (chat?.entryBonus ?? 0),
    xpMultiplier: Math.max(patron?.xpMultiplier ?? 1, 1) * Math.max(chat?.xpMultiplier ?? 1, 1),
  };
}
