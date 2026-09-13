/**
 * SQLite persistence. One file, synchronous, zero-config.
 * Survives restarts so live giveaways and XP are never lost.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = process.env.DATABASE_PATH || resolve(process.cwd(), 'data/opb.sqlite');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id     TEXT PRIMARY KEY,
  role_map     TEXT NOT NULL DEFAULT '{}',
  channel_map  TEXT NOT NULL DEFAULT '{}',
  separator    TEXT NOT NULL DEFAULT '│',
  setup_at     INTEGER,
  setup_by     TEXT
);

CREATE TABLE IF NOT EXISTS giveaways (
  id            TEXT PRIMARY KEY,
  guild_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  message_id    TEXT,
  host_id       TEXT NOT NULL,
  prize         TEXT NOT NULL,
  description   TEXT,
  winner_count  INTEGER NOT NULL DEFAULT 1,
  ends_at       INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  ended         INTEGER NOT NULL DEFAULT 0,
  cancelled     INTEGER NOT NULL DEFAULT 0,
  patron_only   INTEGER NOT NULL DEFAULT 0,
  required_role TEXT,
  winners       TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS entries (
  giveaway_id TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  weight      INTEGER NOT NULL DEFAULT 1,
  entered_at  INTEGER NOT NULL,
  PRIMARY KEY (giveaway_id, user_id)
);

CREATE TABLE IF NOT EXISTS levels (
  guild_id  TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  xp        INTEGER NOT NULL DEFAULT 0,
  level     INTEGER NOT NULL DEFAULT 0,
  messages  INTEGER NOT NULL DEFAULT 0,
  last_xp   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gw_active ON giveaways (guild_id, ended, cancelled);
CREATE INDEX IF NOT EXISTS idx_levels_xp ON levels (guild_id, xp DESC);
`);

/* ---------------------------- migrations ---------------------------- */
/**
 * Additive migrations so an existing database keeps its live giveaways.
 * `title` splits the giveaway headline from the prize text, and
 * `required_roles` supersedes the single `required_role` column.
 */
function columns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
}

{
  const cols = columns('giveaways');
  if (!cols.has('title')) db.exec(`ALTER TABLE giveaways ADD COLUMN title TEXT`);
  if (!cols.has('required_roles')) db.exec(`ALTER TABLE giveaways ADD COLUMN required_roles TEXT NOT NULL DEFAULT '[]'`);
  if (!cols.has('required_mode')) db.exec(`ALTER TABLE giveaways ADD COLUMN required_mode TEXT NOT NULL DEFAULT 'any'`);

  // Fold the legacy single-role column into the new array.
  if (cols.has('required_role')) {
    db.prepare(
      `UPDATE giveaways SET required_roles = json_array(required_role)
       WHERE required_role IS NOT NULL AND required_roles = '[]'`,
    ).run();
  }
  // Backfill a title for rows created before the column existed.
  db.prepare(`UPDATE giveaways SET title = prize WHERE title IS NULL`).run();
}

/* --------------------------- guild config --------------------------- */

const qGetGuild = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
const qUpsertGuild = db.prepare(`
  INSERT INTO guild_config (guild_id, role_map, channel_map, separator, setup_at, setup_by)
  VALUES (@guild_id, @role_map, @channel_map, @separator, @setup_at, @setup_by)
  ON CONFLICT(guild_id) DO UPDATE SET
    role_map = excluded.role_map,
    channel_map = excluded.channel_map,
    separator = excluded.separator,
    setup_at = excluded.setup_at,
    setup_by = excluded.setup_by
`);

export function getGuildConfig(guildId) {
  const row = qGetGuild.get(guildId);
  if (!row) return { guildId, roles: {}, channels: {}, separator: '│', setupAt: null, setupBy: null };
  return {
    guildId,
    roles: JSON.parse(row.role_map),
    channels: JSON.parse(row.channel_map),
    separator: row.separator,
    setupAt: row.setup_at,
    setupBy: row.setup_by,
  };
}

export function saveGuildConfig(guildId, { roles, channels, separator, setupBy }) {
  const prev = getGuildConfig(guildId);
  qUpsertGuild.run({
    guild_id: guildId,
    role_map: JSON.stringify({ ...prev.roles, ...(roles ?? {}) }),
    channel_map: JSON.stringify({ ...prev.channels, ...(channels ?? {}) }),
    separator: separator ?? prev.separator ?? '│',
    setup_at: Date.now(),
    setup_by: setupBy ?? prev.setupBy,
  });
  return getGuildConfig(guildId);
}

/* ----------------------------- giveaways ---------------------------- */

const qInsertGw = db.prepare(`
  INSERT INTO giveaways (id, guild_id, channel_id, message_id, host_id, title, prize, description,
                         winner_count, ends_at, created_at, patron_only, required_role,
                         required_roles, required_mode)
  VALUES (@id, @guild_id, @channel_id, @message_id, @host_id, @title, @prize, @description,
          @winner_count, @ends_at, @created_at, @patron_only, @required_role,
          @required_roles, @required_mode)
`);

export function createGiveaway(g) {
  const roles = (g.requiredRoles ?? (g.requiredRole ? [g.requiredRole] : [])).filter(Boolean);
  qInsertGw.run({
    id: g.id,
    guild_id: g.guildId,
    channel_id: g.channelId,
    message_id: g.messageId ?? null,
    host_id: g.hostId,
    title: g.title ?? g.prize,
    prize: g.prize,
    description: g.description ?? null,
    winner_count: g.winnerCount,
    ends_at: g.endsAt,
    created_at: Date.now(),
    patron_only: g.patronOnly ? 1 : 0,
    required_role: roles[0] ?? null, // kept in sync for backwards compatibility
    required_roles: JSON.stringify(roles),
    required_mode: g.requiredMode === 'all' ? 'all' : 'any',
  });
  return getGiveaway(g.id);
}

const qGetGw = db.prepare('SELECT * FROM giveaways WHERE id = ?');
const qGetGwByMsg = db.prepare('SELECT * FROM giveaways WHERE message_id = ?');

function hydrate(row) {
  if (!row) return null;
  let requiredRoles = [];
  try {
    requiredRoles = JSON.parse(row.required_roles ?? '[]');
  } catch {
    requiredRoles = [];
  }
  if (!requiredRoles.length && row.required_role) requiredRoles = [row.required_role];

  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    hostId: row.host_id,
    title: row.title ?? row.prize,
    prize: row.prize,
    description: row.description,
    winnerCount: row.winner_count,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    ended: !!row.ended,
    cancelled: !!row.cancelled,
    patronOnly: !!row.patron_only,
    requiredRoles,
    requiredMode: row.required_mode === 'all' ? 'all' : 'any',
    /** @deprecated use requiredRoles */
    requiredRole: requiredRoles[0] ?? null,
    winners: JSON.parse(row.winners),
  };
}

export const getGiveaway = (id) => hydrate(qGetGw.get(id));
export const getGiveawayByMessage = (messageId) => hydrate(qGetGwByMsg.get(messageId));

export function setGiveawayMessage(id, messageId) {
  db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(messageId, id);
}

export function listActiveGiveaways(guildId) {
  const rows = guildId
    ? db.prepare('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 0 AND cancelled = 0 ORDER BY ends_at ASC').all(guildId)
    : db.prepare('SELECT * FROM giveaways WHERE ended = 0 AND cancelled = 0 ORDER BY ends_at ASC').all();
  return rows.map(hydrate);
}

export function markEnded(id, winners) {
  db.prepare('UPDATE giveaways SET ended = 1, winners = ? WHERE id = ?').run(JSON.stringify(winners), id);
}

export function markCancelled(id) {
  db.prepare('UPDATE giveaways SET cancelled = 1, ended = 1 WHERE id = ?').run(id);
}

/* ------------------------------ entries ----------------------------- */

const qEnter = db.prepare(`
  INSERT INTO entries (giveaway_id, user_id, weight, entered_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(giveaway_id, user_id) DO UPDATE SET weight = excluded.weight
`);

export function addEntry(giveawayId, userId, weight) {
  qEnter.run(giveawayId, userId, weight, Date.now());
}

export function removeEntry(giveawayId, userId) {
  return db.prepare('DELETE FROM entries WHERE giveaway_id = ? AND user_id = ?').run(giveawayId, userId).changes > 0;
}

export function hasEntry(giveawayId, userId) {
  return !!db.prepare('SELECT 1 FROM entries WHERE giveaway_id = ? AND user_id = ?').get(giveawayId, userId);
}

export function getEntries(giveawayId) {
  return db.prepare('SELECT user_id AS userId, weight FROM entries WHERE giveaway_id = ?').all(giveawayId);
}

export function countEntries(giveawayId) {
  const r = db.prepare('SELECT COUNT(*) AS people, COALESCE(SUM(weight), 0) AS weight FROM entries WHERE giveaway_id = ?').get(giveawayId);
  return { people: r.people, weight: r.weight };
}

/* ------------------------------- levels ----------------------------- */

const qGetLevel = db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?');

export function getLevel(guildId, userId) {
  return (
    qGetLevel.get(guildId, userId) ?? { guild_id: guildId, user_id: userId, xp: 0, level: 0, messages: 0, last_xp: 0 }
  );
}

export function saveLevel(guildId, userId, { xp, level, messages, lastXp }) {
  db.prepare(`
    INSERT INTO levels (guild_id, user_id, xp, level, messages, last_xp)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      xp = excluded.xp, level = excluded.level, messages = excluded.messages, last_xp = excluded.last_xp
  `).run(guildId, userId, xp, level, messages, lastXp);
}

export function topLevels(guildId, limit = 10) {
  return db.prepare('SELECT user_id AS userId, xp, level, messages FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ?').all(guildId, limit);
}

export function rankOf(guildId, userId) {
  const row = db
    .prepare('SELECT COUNT(*) + 1 AS rank FROM levels WHERE guild_id = ? AND xp > (SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?)')
    .get(guildId, guildId, userId);
  return row?.rank ?? null;
}
