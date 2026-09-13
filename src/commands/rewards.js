import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { chatRewardsEmbed, okEmbed, errEmbed } from '../lib/embeds.js';
import { getGuildConfig } from '../lib/store.js';

export const data = new SlashCommandBuilder()
  .setName('rewards')
  .setDescription('Show the chat rewards ladder')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('show').setDescription('Show the chat rewards embed'))
  .addSubcommand((s) =>
    s
      .setName('post')
      .setDescription('[Staff] Post the chat rewards embed into a channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post it (defaults to here)')),
  );

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guild.id);
  const payload = chatRewardsEmbed(cfg);

  if (interaction.options.getSubcommand() === 'show') {
    return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ embeds: [errEmbed('Staff only', 'You need **Manage Server** to post panels.')], flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  if (!channel.isTextBased()) {
    return interaction.reply({ embeds: [errEmbed('Bad channel', 'Pick a text channel.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const msg = await channel.send(payload);
    await interaction.editReply({ embeds: [okEmbed('Posted', `Chat rewards embed is live in ${channel}.\n${msg.url}`)] });
  } catch (err) {
    await interaction.editReply({ embeds: [errEmbed('Could not post', err.message)] });
  }
}
