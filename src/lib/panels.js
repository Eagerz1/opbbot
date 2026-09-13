/**
 * Maps blueprint `panel:` keys to the message payload posted in that channel.
 */
import {
  welcomeEmbed,
  rulesEmbed,
  faqEmbed,
  rolesPanel,
  createGiveawayPanel,
  giveawayRulesEmbed,
  patreonEmbed,
  chatRewardsEmbed,
} from './embeds.js';
import { CATEGORIES } from '../config/blueprint.js';

/**
 * @param {{roles: Record<string,string>, channels: Record<string,string>}} ctx
 * @returns {Record<string, import('discord.js').MessagePayload>} keyed by channel key
 */
export function buildPanels(ctx) {
  const byPanel = {
    welcome: () => ({ embeds: [welcomeEmbed(ctx)] }),
    rules: () => ({ embeds: [rulesEmbed()] }),
    faq: () => ({ embeds: [faqEmbed(ctx)] }),
    roles: () => rolesPanel(ctx),
    createGiveaway: () => createGiveawayPanel(ctx),
    giveawayRules: () => ({ embeds: [giveawayRulesEmbed()] }),
    patreon: () => ({ embeds: [patreonEmbed(ctx)] }),
    chatRewards: () => chatRewardsEmbed(ctx),
  };

  const out = {};
  for (const cat of CATEGORIES) {
    for (const ch of cat.channels) {
      if (ch.panel && byPanel[ch.panel]) out[ch.key] = byPanel[ch.panel]();
    }
  }
  return out;
}
