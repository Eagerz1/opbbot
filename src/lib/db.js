/**
 * Database driver selection.
 *
 * Prefers Node's built-in `node:sqlite` (Node >= 22.5) so a normal install has
 * NO native modules and nothing to compile - the usual way a Discord bot
 * install dies on Windows is a node-gyp/MSBuild error, and this avoids it.
 *
 * `better-sqlite3` is supported as a fallback for older Node versions, but it
 * is NOT a dependency. Install it yourself only if you're stuck below Node
 * 22.5:  npm install better-sqlite3
 *
 * Each candidate is *probed* by actually opening an in-memory database before
 * we commit to it. Importing better-sqlite3 succeeds even when its native
 * binding is missing or built for the wrong Node version - the failure only
 * surfaces on first use. Probing turns that late crash into a clean fallback.
 */

let impl = null;
let driverName = '';
const notes = [];

async function tryNodeSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const Wrapped = wrapNodeSqlite(DatabaseSync);
  new Wrapped(':memory:').close(); // probe
  return Wrapped;
}

async function tryBetterSqlite() {
  const mod = await import('better-sqlite3');
  const Ctor = mod.default;
  new Ctor(':memory:').close(); // probe - throws if the native binding is broken
  return Ctor;
}

async function load() {
  if (impl) return impl;

  // 1. Built in, no compilation, always matches the running Node.
  try {
    impl = await tryNodeSqlite();
    driverName = 'node:sqlite';
    return impl;
  } catch (err) {
    notes.push(`node:sqlite unavailable (${firstLine(err)})`);
  }

  // 2. Only if someone installed it deliberately (e.g. Node < 22.5).
  try {
    impl = await tryBetterSqlite();
    driverName = 'better-sqlite3';
    return impl;
  } catch (err) {
    notes.push(`better-sqlite3 unavailable (${firstLine(err)})`);
  }

  throw new Error(
    [
      `No working SQLite driver found. This bot needs Node 22.5 or newer.`,
      `You are running ${process.version}.`,
      ``,
      `Fix: install Node 22 LTS (or newer) from https://nodejs.org`,
      `Or, to stay on this Node version: npm install better-sqlite3`,
      ``,
      `Details:`,
      ...notes.map((n) => `  - ${n}`),
    ].join('\n'),
  );
}

const firstLine = (err) => String(err?.message ?? err).split('\n')[0].slice(0, 120);

/**
 * Adapt node:sqlite's DatabaseSync to the slice of the better-sqlite3 API
 * this project uses (prepare/run/get/all, exec, pragma, close).
 */
function wrapNodeSqlite(DatabaseSync) {
  return class Database {
    constructor(path) {
      this.db = new DatabaseSync(path);
      try {
        this.db.exec('PRAGMA journal_mode = WAL');
      } catch {
        /* WAL isn't available on every filesystem - not fatal */
      }
    }

    prepare(sql) {
      const stmt = this.db.prepare(sql);
      return {
        run: (...args) => stmt.run(...normalize(args)),
        get: (...args) => plain(stmt.get(...normalize(args))),
        all: (...args) => stmt.all(...normalize(args)).map(plain),
      };
    }

    exec(sql) {
      return this.db.exec(sql);
    }

    pragma(str) {
      return this.db.exec(`PRAGMA ${str}`);
    }

    close() {
      return this.db.close();
    }
  };
}

/** node:sqlite rejects booleans and undefined - coerce them. */
function normalize(args) {
  return args.map((arg) => {
    if (arg === undefined) return null;
    if (typeof arg === 'boolean') return arg ? 1 : 0;
    if (arg && typeof arg === 'object' && !Array.isArray(arg) && !Buffer.isBuffer(arg)) {
      const out = {};
      for (const [k, v] of Object.entries(arg)) {
        out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v;
      }
      return out;
    }
    return arg;
  });
}

/** node:sqlite returns null-prototype rows; make them ordinary objects. */
function plain(row) {
  return row == null ? row : { ...row };
}

export const Database = await load();
export const driver = driverName;
export const driverNotes = notes;
