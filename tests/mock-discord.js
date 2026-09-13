/**
 * A minimal in-memory fake of the slice of discord.js that setup-engine touches.
 * Lets us actually execute runSetup() and assert on the resulting server tree
 * without a bot token.
 */
import { ChannelType, PermissionFlagsBits } from 'discord.js';

let idSeq = 1000n;
const nextId = () => String(++idSeq);

class Cache extends Map {
  find(fn) {
    for (const v of this.values()) if (fn(v)) return v;
    return undefined;
  }
  filter(fn) {
    const out = new Cache();
    for (const [k, v] of this) if (fn(v)) out.set(k, v);
    return out;
  }
  map(fn) {
    return [...this.values()].map(fn);
  }
  get size() {
    return super.size;
  }
}

class MockRole {
  constructor(guild, data, position) {
    this.guild = guild;
    this.id = data.id ?? nextId();
    this.name = data.name;
    this.color = data.color ?? 0;
    this.hoist = data.hoist ?? false;
    this.mentionable = data.mentionable ?? false;
    this.permissions = { bitfield: (data.permissions ?? []).reduce((a, b) => a | BigInt(b), 0n) };
    this.managed = data.managed ?? false;
    this.position = position;
  }
  comparePositionTo(other) {
    return this.position - other.position;
  }
}

class MockChannel {
  constructor(guild, data) {
    this.guild = guild;
    this.client = guild.client;
    this.id = data.id ?? nextId();
    this.name = data.name;
    this.type = data.type;
    this.parentId = data.parent ?? null;
    this.topic = data.topic ?? null;
    this.rateLimitPerUser = data.rateLimitPerUser ?? 0;
    this.userLimit = data.userLimit ?? 0;
    this.permissionOverwrites = data.permissionOverwrites ?? [];
    this.sent = [];
    this.pinned = [];
  }
  isTextBased() {
    return this.type === ChannelType.GuildText || this.type === ChannelType.GuildAnnouncement;
  }
  get messages() {
    return {
      fetch: async () => {
        const c = new Cache();
        for (const m of this.sent) c.set(m.id, m);
        return c;
      },
    };
  }
  async send(payload) {
    const msg = {
      id: nextId(),
      author: { id: this.guild.client.user.id },
      embeds: payload.embeds ?? [],
      components: payload.components ?? [],
      content: payload.content ?? '',
      url: `https://discord.test/${this.id}/msg`,
      channel: this,
      pin: async () => {
        this.pinned.push(msg.id);
        return msg;
      },
      edit: async (p) => {
        Object.assign(msg, p);
        return msg;
      },
    };
    this.sent.push(msg);
    return msg;
  }
}

export class MockGuild {
  constructor({ name = 'Test Server', botTop = true } = {}) {
    this.id = nextId();
    this.name = name;
    this.client = { user: { id: 'BOT_USER' } };

    const rolesCache = new Cache();
    this.rolesCache = rolesCache;
    const everyone = new MockRole(this, { name: '@everyone', id: this.id }, 0);
    rolesCache.set(everyone.id, everyone);

    const botRole = new MockRole(this, { name: 'OPB Giveaways', managed: true }, botTop ? 9999 : 1);
    rolesCache.set(botRole.id, botRole);
    this.botRole = botRole;

    this.channelsCache = new Cache();
    this._rolePosition = 1;

    const self = this;
    this.roles = {
      everyone,
      cache: rolesCache,
      fetch: async () => rolesCache,
      create: async (data) => {
        if (rolesCache.size >= 250) throw new Error('Maximum number of guild roles reached (250)');
        const role = new MockRole(self, data, ++self._rolePosition);
        rolesCache.set(role.id, role);
        return role;
      },
    };

    this.channels = {
      cache: this.channelsCache,
      fetch: async (id) => (id ? (self.channelsCache.get(id) ?? null) : self.channelsCache),
      create: async (data) => {
        if (self.channelsCache.size >= 500) throw new Error('Maximum number of channels reached (500)');
        const ch = new MockChannel(self, data);
        self.channelsCache.set(ch.id, ch);
        return ch;
      },
    };

    this.members = {
      me: {
        permissions: {
          has: () => true,
        },
        roles: { highest: botRole, botRole },
      },
    };
  }

  /** Everything under a category, for assertions. */
  childrenOf(categoryName) {
    const cat = this.channelsCache.find((c) => c.type === ChannelType.GuildCategory && c.name === categoryName);
    if (!cat) return [];
    return [...this.channelsCache.values()].filter((c) => c.parentId === cat.id);
  }

  categoryNames() {
    return [...this.channelsCache.values()].filter((c) => c.type === ChannelType.GuildCategory).map((c) => c.name);
  }

  channelNames() {
    return [...this.channelsCache.values()].filter((c) => c.type !== ChannelType.GuildCategory).map((c) => c.name);
  }

  roleNames() {
    return [...this.rolesCache.values()].filter((r) => !r.managed && r.name !== '@everyone').map((r) => r.name);
  }

  findChannel(name) {
    return this.channelsCache.find((c) => c.name === name);
  }
}

export { PermissionFlagsBits, ChannelType };
