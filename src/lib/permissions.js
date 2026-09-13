/**
 * Resolve blueprint permission shorthands into discord.js overwrite objects.
 */
import { PermissionFlagsBits } from 'discord.js';

/** '@everyone' and '@bot' are pseudo role keys resolved from context. */
export function resolveOverwrites(spec, { guild, roleIds, botRoleId }) {
  if (!spec) return undefined;
  const out = [];

  for (const [key, rule] of Object.entries(spec)) {
    let id;
    if (key === '@everyone') id = guild.roles.everyone.id;
    else if (key === '@bot') id = botRoleId ?? guild.members.me?.roles?.botRole?.id ?? null;
    else id = roleIds[key];

    if (!id) continue; // role wasn't created (e.g. hit the 250 role cap) - skip quietly

    const entry = { id };
    if (rule.allow?.length) entry.allow = rule.allow.map(flag);
    if (rule.deny?.length) entry.deny = rule.deny.map(flag);
    out.push(entry);
  }
  return out;
}

function flag(name) {
  const f = PermissionFlagsBits[name];
  if (f === undefined) throw new Error(`Unknown permission flag in blueprint: ${name}`);
  return f;
}

export function resolvePermissions(names = []) {
  return names.map(flag);
}

/**
 * Merge a category-level spec with a channel-level override.
 *
 * The channel wins *per permission*, not per list. A naive `{...base, ...override}`
 * would leave a permission sitting in both `allow` and `deny` - e.g. a category
 * that allows @everyone ViewChannel merged with a private channel that denies it.
 * Discord resolves allow over deny, so that bug silently makes private channels
 * public. We strip conflicts on both sides.
 */
export function mergeOverwrites(base = {}, override = {}) {
  const merged = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(override)]);

  for (const key of keys) {
    const b = base[key] ?? {};
    const o = override[key] ?? {};

    const oAllow = new Set(o.allow ?? []);
    const oDeny = new Set(o.deny ?? []);

    // Inherited entries lose to anything the channel states explicitly.
    const allow = [...new Set([...(b.allow ?? []).filter((p) => !oDeny.has(p)), ...oAllow])];
    const deny = [...new Set([...(b.deny ?? []).filter((p) => !oAllow.has(p)), ...oDeny])];

    const entry = {};
    if (allow.length) entry.allow = allow;
    if (deny.length) entry.deny = deny;
    if (entry.allow || entry.deny) merged[key] = entry;
  }
  return merged;
}
