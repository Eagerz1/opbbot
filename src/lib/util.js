/**
 * Small shared helpers.
 */
import { buffsForRoleKeys } from '../config/blueprint.js';
import { getGuildConfig } from './store.js';

/** Parse "1d12h30m" / "2h" / "45s" / "1w" into ms. Returns null if invalid. */
export function parseDuration(input) {
  if (!input) return null;
  const str = String(input).trim().toLowerCase();
  const re = /(\d+(?:\.\d+)?)\s*(w|d|h|m|s)/g;
  const unit = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000 };
  let ms = 0;
  let matched = false;
  let m;
  while ((m = re.exec(str)) !== null) {
    matched = true;
    ms += parseFloat(m[1]) * unit[m[2]];
  }
  if (!matched) {
    // bare number = minutes
    const bare = Number(str);
    if (Number.isFinite(bare) && bare > 0) return bare * 60000;
    return null;
  }
  return ms > 0 ? Math.round(ms) : null;
}

/** 3723000 -> "1h 2m 3s" */
export function formatDuration(ms) {
  if (ms <= 0) return '0s';
  const units = [
    ['w', 604800000],
    ['d', 86400000],
    ['h', 3600000],
    ['m', 60000],
    ['s', 1000],
  ];
  const parts = [];
  let rest = ms;
  for (const [label, size] of units) {
    const n = Math.floor(rest / size);
    if (n > 0) {
      parts.push(`${n}${label}`);
      rest -= n * size;
    }
    if (parts.length === 2) break;
  }
  return parts.join(' ') || '0s';
}

/** Short unique id, sortable by creation time. */
export function makeId(prefix = 'gw') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Which blueprint role keys does this member hold?
 */
export function memberRoleKeys(member) {
  const cfg = getGuildConfig(member.guild.id);
  const byId = Object.entries(cfg.roles).reduce((acc, [key, id]) => {
    acc[id] = key;
    return acc;
  }, {});
  return member.roles.cache.map((r) => byId[r.id]).filter(Boolean);
}

/** Entry weight + xp multiplier for a member, from their patron/chat roles. */
export function memberBuffs(member) {
  return buffsForRoleKeys(memberRoleKeys(member));
}

/**
 * Weighted random pick of `count` distinct users.
 *
 * Weights are fractional (1 base + 0.1..0.5 per tier), so the floor is a small
 * epsilon rather than 1 - clamping to 1 would erase every bonus below a whole
 * entry and make the draw uniform.
 */
export function pickWinners(entries, count) {
  const w = (e) => (Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 0.0001);
  const pool = entries.map((e) => ({ ...e }));
  const winners = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((s, e) => s + w(e), 0);
    let roll = Math.random() * total;
    let idx = 0;
    for (let j = 0; j < pool.length; j++) {
      roll -= w(pool[j]);
      if (roll <= 0) {
        idx = j;
        break;
      }
      idx = j;
    }
    winners.push(pool[idx].userId);
    pool.splice(idx, 1);
  }
  return winners;
}

export const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
