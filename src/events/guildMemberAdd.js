import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../lib/store.js';
import { BRAND, COLORS, EMOJI } from '../config/constants.js';

export const name = Events.GuildMemberAdd;

export async function execute(member, client) {
  const cfg = getGuildConfig(member.guild.id);

  // Auto-grant the base Member role.
  const memberRoleId = cfg.roles?.member;
  if (memberRoleId) {
    const role = member.guild.roles.cache.get(memberRoleId);
    const me = member.guild.members.me;
    if (role && me?.permissions.has('ManageRoles') && me.roles.highest.comparePositionTo(role) > 0) {
      await member.roles.add(role, 'OPB auto-role').catch(() => {});
    }
  }

  const welcomeId = cfg.channels?.welcome;
  if (!welcomeId) return;
  const channel = await member.guild.channels.fetch(welcomeId).catch(() => null);
  if (!channel?.isTextBased()) return;

  await channel
    .send({
      content: `<@${member.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setAuthor({ name: `${member.user.username} joined`, iconURL: member.user.displayAvatarURL() })
          .setDescription(
            [
              `${EMOJI.gift} Welcome to **${member.guild.name}**!`,
              cfg.channels?.rules ? `Read <#${cfg.channels.rules}>, then jump into chat.` : null,
              cfg.channels?.giveaways ? `Live giveaways are in <#${cfg.channels.giveaways}>.` : null,
              cfg.channels?.chatRewards ? `Talking earns XP and buffs — see <#${cfg.channels.chatRewards}>.` : null,
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .setFooter({ text: `${BRAND.footer} · member #${member.guild.memberCount}` })
          .setTimestamp(),
      ],
    })
    .catch(() => {});
}
