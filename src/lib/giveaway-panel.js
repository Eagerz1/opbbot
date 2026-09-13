/**
 * The /giveaway create panel.
 *
 * Discord's newer modal system (ComponentType.Label, v14.27+) lets us put a
 * real role picker inside a modal, so the whole giveaway is defined in one
 * popup - no follow-up messages, no typing role names by hand:
 *
 *   Title              text
 *   Prize              text
 *   Winners            text
 *   Duration           text
 *   Required roles     native role select (optional, up to 5)
 *
 * If a client/API ever rejects the Label layout we fall back to the classic
 * ActionRow + TextInput modal and a follow-up role picker, so creation never
 * hard-fails. See buildLegacyModal() / roleStepComponents().
 */
import {
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  RoleSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { IDS } from '../config/constants.js';

export const MAX_REQUIRED_ROLES = 5;

/** Field ids inside the modal. */
export const FIELDS = {
  title: 'title',
  prize: 'prize',
  winners: 'winners',
  duration: 'duration',
  roles: 'roles',
};

/**
 * The modal shown by /giveaway create and the create-giveaway button.
 * @param {object} [defaults] pre-filled values (used when re-opening after a validation error)
 */
export function buildGiveawayModal(defaults = {}) {
  const modal = new ModalBuilder().setCustomId(IDS.giveawayModal).setTitle('Create a Giveaway');

  const title = new TextInputBuilder()
    .setCustomId(FIELDS.title)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Nitro Drop #12')
    .setRequired(true)
    .setMaxLength(100);
  if (defaults.title) title.setValue(String(defaults.title).slice(0, 100));

  const prize = new TextInputBuilder()
    .setCustomId(FIELDS.prize)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('1x Discord Nitro (1 month) — gifted directly to the winner')
    .setRequired(true)
    .setMaxLength(500);
  if (defaults.prize) prize.setValue(String(defaults.prize).slice(0, 500));

  const winners = new TextInputBuilder()
    .setCustomId(FIELDS.winners)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('1')
    .setRequired(true)
    .setMaxLength(2);
  winners.setValue(String(defaults.winners ?? 1));

  const duration = new TextInputBuilder()
    .setCustomId(FIELDS.duration)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('24h')
    .setRequired(true)
    .setMaxLength(16);
  if (defaults.duration) duration.setValue(String(defaults.duration).slice(0, 16));

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(FIELDS.roles)
    .setPlaceholder('Anyone can enter — pick a role to restrict it')
    .setRequired(false)
    .setMinValues(0)
    .setMaxValues(MAX_REQUIRED_ROLES);
  if (defaults.roleIds?.length) {
    roleSelect.setDefaultRoles(defaults.roleIds.slice(0, MAX_REQUIRED_ROLES));
  }

  modal.addLabelComponents(
    new LabelBuilder().setLabel('Giveaway title').setDescription('The headline on the embed').setTextInputComponent(title),
    new LabelBuilder().setLabel('What do you win?').setDescription('Describe the prize').setTextInputComponent(prize),
    new LabelBuilder().setLabel('Number of winners').setDescription('1-20').setTextInputComponent(winners),
    new LabelBuilder().setLabel('Duration').setDescription('30m · 2h · 3d · 1w · 1d12h').setTextInputComponent(duration),
    new LabelBuilder()
      .setLabel('Required role (optional)')
      .setDescription('Leave empty for everyone. e.g. @Booster for a booster-only giveaway.')
      .setRoleSelectMenuComponent(roleSelect),
  );

  return modal;
}

/**
 * Fallback modal for any client that can't render Label components.
 * Text only - the role is then chosen from a follow-up select menu.
 */
export function buildLegacyModal(defaults = {}) {
  const modal = new ModalBuilder().setCustomId(IDS.giveawayModalLegacy).setTitle('Create a Giveaway');

  const mk = (id, label, style, placeholder, required, max, value) => {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setPlaceholder(placeholder)
      .setRequired(required)
      .setMaxLength(max);
    if (value) input.setValue(String(value).slice(0, max));
    return new ActionRowBuilder().addComponents(input);
  };

  modal.addComponents(
    mk(FIELDS.title, 'Giveaway title', TextInputStyle.Short, 'Nitro Drop #12', true, 100, defaults.title),
    mk(FIELDS.prize, 'What do you win?', TextInputStyle.Paragraph, '1x Discord Nitro (1 month)', true, 500, defaults.prize),
    mk(FIELDS.winners, 'Number of winners (1-20)', TextInputStyle.Short, '1', true, 2, defaults.winners ?? 1),
    mk(FIELDS.duration, 'Duration (30m, 2h, 3d, 1w)', TextInputStyle.Short, '24h', true, 16, defaults.duration),
  );

  return modal;
}

/**
 * Step 2 of the fallback flow: pick optional roles, then publish.
 * @param {string} draftId key of the pending draft
 */
export function roleStepComponents(draftId) {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`${IDS.giveawayRoleSelect}:${draftId}`)
        .setPlaceholder('Optional — restrict entry to a role')
        .setMinValues(0)
        .setMaxValues(MAX_REQUIRED_ROLES),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.giveawayPublish}:${draftId}`).setLabel('Publish giveaway').setEmoji('🎁').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${IDS.giveawayDiscard}:${draftId}`).setLabel('Discard').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/**
 * Read every field back out of a submitted modal.
 * Works for both the Label modal and the legacy one.
 * @returns {{title:string, prize:string, winnersRaw:string, durationRaw:string, roleIds:string[]}}
 */
export function readModal(interaction) {
  const get = (id) => {
    try {
      return interaction.fields.getTextInputValue(id)?.trim() ?? '';
    } catch {
      return '';
    }
  };

  let roleIds = [];
  try {
    const selected = interaction.fields.getSelectedRoles(FIELDS.roles);
    if (selected) roleIds = [...selected.keys()];
  } catch {
    roleIds = []; // legacy modal has no role field
  }

  return {
    title: get(FIELDS.title),
    prize: get(FIELDS.prize),
    winnersRaw: get(FIELDS.winners),
    durationRaw: get(FIELDS.duration),
    roleIds,
  };
}

/** Does this modal payload contain Label components? (used by tests) */
export function usesLabelComponents(modal) {
  const json = modal.toJSON();
  return json.components.every((c) => c.type === ComponentType.Label);
}
