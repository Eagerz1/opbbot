/**
 * Branding + shared constants for OPB Giveaways.
 */

export const BRAND = {
  name: 'OPB Giveaways',
  short: 'OPB',
  tagline: 'Giveaways, Patron perks & chat rewards',
  footer: 'OPB Giveaways',
  icon: '🎁',
};

/** Embed colours (hex ints). */
export const COLORS = {
  primary: 0x5865f2, // OPB blurple
  giveaway: 0xf1c40f, // gold
  success: 0x2ecc71,
  danger: 0xed4245,
  warning: 0xfaa61a,
  patron: 0xeb459e, // pink
  chat: 0x1abc9c, // teal
  info: 0x3498db,
  dark: 0x2b2d31,
};

export const EMOJI = {
  gift: '🎁',
  trophy: '🏆',
  sparkles: '✨',
  star: '⭐',
  gem: '💎',
  money: '💰',
  chart: '📈',
  crown: '👑',
  shield: '🛡️',
  check: '✅',
  cross: '❌',
  warn: '⚠️',
  clock: '⏰',
  people: '👥',
  fire: '🔥',
  ticket: '🎟️',
};

/** Custom interaction ids (prefix routed in events/interactionCreate.js). */
export const IDS = {
  giveawayEnter: 'gw:enter',
  giveawayEntries: 'gw:entries',
  giveawayCreateButton: 'gw:create',
  giveawayModal: 'gw:modal',
  rewardsRank: 'rw:rank',
  rewardsBoard: 'rw:board',
  rewardsHow: 'rw:how',
  patreonPerks: 'pt:perks',
};

/** Chat XP tuning. */
export const XP = {
  min: 15,
  max: 25,
  cooldownMs: 60_000,
  /** Level curve: xp needed to go from (level) -> (level + 1). */
  curve: (level) => 5 * level * level + 50 * level + 100,
};
