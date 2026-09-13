/**
 * Database driver.
 *
 * Uses Node's built-in `node:sqlite` (Node >= 22.5) so a fresh clone needs
 * NO native compilation - `npm install` can't fail on missing build tools,
 * which is the usual way a Discord bot install dies on Windows.
 *
 * If `better-sqlite3` happens to be installed we prefer it (it's stable
 * rather than experimental), so existing deployments keep working unchanged.
 * Both expose the same prepare/run/get/all/exec surface we rely on.
 */

let impl = null;
let driverName = '';

/** Try better-sqlite3 first, then fall back to the built-in module. */
async function load() {
  if (impl) return impl;

  try {
    const mod = await import('better-sqlite3');
    impl = mod.default;
    driverName = 'better-sqlite3';
    return impl;
  } catch {
    // not installed - that's the normal case now
  }

  try {
    const { DatabaseSync } = await import('node:sqlite');
    impl = wrapNodeSqlite(DatabaseSync);
    driverName = 'node:sqlite';
    return impl;
  } catch (err) {
    throw new Error(
      `No SQLite driver available. This bot needs Node 22.5+ (you have ${process.version}).\n` +
        `Either upgrade Node, or run: npm install better-sqlite3\n` +
        `Original error: ${err.message}`,
    );
  }
}

/**
 * Adapt node:sqlite's DatabaseSync to the small slice of the
 * better-sqlite3 API this project uses.
 */
function wrapNodeSqlite(DatabaseSync) {
  return class Database {
    constructor(path) {
      this.db = new DatabaseSync(path);
      // better-sqlite3 returns plain objects; node:sqlite returns
      // null-prototype objects, which break `{...row}` spreads in some libs.
      try {
        this.db.exec('PRAGMA journal_mode = WAL');
      } catch {
        /* WAL is unavailable on some filesystems - not fatal */
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
      // better-sqlite3 style: db.pragma('journal_mode = WAL')
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

/** Convert null-prototype rows into ordinary objects. */
function plain(row) {
  return row == null ? row : { ...row };
}

export const Database = await load();
export const driver = driverName;
