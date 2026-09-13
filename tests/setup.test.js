import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_PATH = join(tmpdir(), `opb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);

const { MockGuild, ChannelType } = await import('./mock-discord.js');
const { PermissionFlagsBits } = await import('discord.js');
const { runSetup, normalizeName, summarize } = await import('../src/lib/setup-engine.js');
const { CATEGORIES, ROLES, countPlan, channelName, buffsForRoleKeys, PATRON_TIERS, CHAT_LEVEL_ROLES } = await import('../src/config/blueprint.js');
const { parseDuration, formatDuration, pickWinners } = await import('../src/lib/util.js');
const { levelFromXp, totalXpFor } = await import('../src/lib/levels.js');

/* ----------------------------- /setup ------------------------------- */

test('setup creates every role, category and channel from the blueprint', async () => {
  const guild = new MockGuild();
  const report = await runSetup(guild, { postPanels: true });
  const plan = countPlan();

  assert.equal(report.roles.created.length, plan.roles, 'all roles created');
  assert.equal(report.categories.created.length, plan.categories, 'all categories created');
  assert.equal(report.channels.created.length, plan.channels, 'all channels created');
  assert.equal(report.roles.failed.length + report.categories.failed.length + report.channels.failed.length, 0, 'no failures');
});

test('channels use the emoji | channel format', async () => {
  const guild = new MockGuild();
  await runSetup(guild, { separator: '│' });

  for (const name of guild.channelNames()) {
    assert.match(name, /^\p{Extended_Pictographic}[\uFE0F]?│/u, `"${name}" should start with emoji + separator`);
  }
  assert.ok(guild.findChannel('💬│general'), 'general exists');
  assert.ok(guild.findChannel('🎁│opb-giveaways'), 'opb giveaways channel exists');
  assert.ok(guild.findChannel('🛠️│create-giveaway'), 'create-giveaway exists');
});

test('separator option changes the naming style', async () => {
  const guild = new MockGuild();
  await runSetup(guild, { separator: '-' });
  assert.ok(guild.findChannel('💬-general'), 'dash separator applied');
});

test('all requested categories exist', async () => {
  const guild = new MockGuild();
  await runSetup(guild);
  const names = guild.categoryNames();
  for (const cat of CATEGORIES) assert.ok(names.includes(cat.name), `category ${cat.name}`);
});

test('community has general, media and memes; voice category has 3 VCs', async () => {
  const guild = new MockGuild();
  await runSetup(guild);

  const community = guild.childrenOf('💬 COMMUNITY').map((c) => c.name);
  assert.ok(community.some((n) => n.endsWith('general')), 'general');
  assert.ok(community.some((n) => n.endsWith('media')), 'media');
  assert.ok(community.some((n) => n.endsWith('memes')), 'memes');

  const vcs = guild.childrenOf('🔊 VOICE CHANNELS').filter((c) => c.type === ChannelType.GuildVoice);
  assert.equal(vcs.length, 3, 'exactly 3 voice channels in the VC category');
});

test('information category has announcements and rules', async () => {
  const guild = new MockGuild();
  await runSetup(guild);
  const info = guild.childrenOf('📋 INFORMATION').map((c) => c.name);
  assert.ok(info.some((n) => n.includes('announcements')), 'announcements');
  assert.ok(info.some((n) => n.includes('rules')), 'rules');
});

test('OPB category has the giveaways channel and the funder-gated create channel', async () => {
  const guild = new MockGuild();
  await runSetup(guild);
  const opb = guild.childrenOf('🎁 OPB GIVEAWAYS').map((c) => c.name);
  assert.ok(opb.some((n) => n.includes('opb-giveaways')), 'opb-giveaways channel');
  assert.ok(opb.some((n) => n.includes('create-giveaway')), 'create-giveaway channel');
});

test('create-giveaway is hidden from @everyone and visible to Giveaway Funder', async () => {
  const guild = new MockGuild();
  await runSetup(guild);

  const chan = guild.findChannel('🛠️│create-giveaway');
  assert.ok(chan, 'channel exists');

  const funder = [...guild.rolesCache.values()].find((r) => r.name === '💰 Giveaway Funder');
  assert.ok(funder, 'funder role exists');

  const everyoneOw = chan.permissionOverwrites.find((o) => o.id === guild.id);
  const funderOw = chan.permissionOverwrites.find((o) => o.id === funder.id);

  const VIEW = PermissionFlagsBits.ViewChannel;
  assert.ok(everyoneOw?.deny?.includes(VIEW), '@everyone denied ViewChannel');
  assert.ok(funderOw?.allow?.includes(VIEW), 'funder allowed ViewChannel');
  assert.ok(!everyoneOw?.allow?.includes(VIEW), '@everyone is not also allowed');

  // The public giveaway feed stays visible to everyone.
  const feed = guild.findChannel('🎁│opb-giveaways');
  const feedEveryone = feed.permissionOverwrites.find((o) => o.id === guild.id);
  assert.ok(feedEveryone?.allow?.includes(VIEW), 'giveaway feed is public');
  assert.ok(feedEveryone?.deny?.includes(PermissionFlagsBits.SendMessages), 'but read-only');
});

test('setup is idempotent - re-running adopts instead of duplicating', async () => {
  const guild = new MockGuild();
  await runSetup(guild);
  const rolesAfterFirst = guild.roleNames().length;
  const channelsAfterFirst = guild.channelsCache.size;

  const second = await runSetup(guild);

  assert.equal(guild.roleNames().length, rolesAfterFirst, 'no duplicate roles');
  assert.equal(guild.channelsCache.size, channelsAfterFirst, 'no duplicate channels');
  assert.equal(second.roles.created.length, 0, 'everything adopted');
  assert.equal(second.channels.created.length, 0, 'everything adopted');
});

test('panels are posted into the right channels and pinned', async () => {
  const guild = new MockGuild();
  const report = await runSetup(guild, { postPanels: true });

  assert.ok(report.panels.posted.length >= 8, `expected >=8 panels, got ${report.panels.posted.length}`);

  const rewards = guild.findChannel('📈│chat-rewards');
  assert.equal(rewards.sent.length, 1, 'chat rewards embed posted');
  assert.equal(rewards.pinned.length, 1, 'and pinned');

  const create = guild.findChannel('🛠️│create-giveaway');
  assert.ok(create.sent[0].components.length > 0, 'create panel has a button');

  const patreon = guild.findChannel('⭐│patreon-perks');
  const fields = patreon.sent[0].embeds[0].data.fields;
  assert.equal(fields.length, 5, 'all 5 patron tiers listed');
});

test('re-running setup edits the existing panel rather than double posting', async () => {
  const guild = new MockGuild();
  await runSetup(guild, { postPanels: true });
  await runSetup(guild, { postPanels: true });
  const rewards = guild.findChannel('📈│chat-rewards');
  assert.equal(rewards.sent.length, 1, 'still only one panel message');
});

test('preview mode touches nothing', async () => {
  const guild = new MockGuild();
  const report = await runSetup(guild, { dryRun: true });
  assert.equal(guild.roleNames().length, 0, 'no roles created');
  assert.equal(guild.channelsCache.size, 0, 'no channels created');
  assert.equal(report.roles.created.length, countPlan().roles, 'but the plan is reported');
});

test('warns when the bot role sits below the roles it made', async () => {
  const guild = new MockGuild({ botTop: false });
  const report = await runSetup(guild);
  assert.ok(report.warnings.length > 0, 'produced a warning');
  assert.match(report.warnings[0], /top of Server Settings/i);
});

test('a failing channel does not abort the run', async () => {
  const guild = new MockGuild();
  let failed = 0;
  const realCreate = guild.channels.create;
  guild.channels.create = async (data) => {
    if (data.name.includes('memes') && failed === 0) {
      failed++;
      throw new Error('simulated API error');
    }
    return realCreate(data);
  };

  const report = await runSetup(guild);
  assert.equal(report.channels.failed.length, 1, 'one failure recorded');
  assert.equal(report.channels.created.length, countPlan().channels - 1, 'everything else still created');
});

/* --------------------------- blueprint ------------------------------ */

test('5 patron tiers ascend from Patron to Patron ++++', () => {
  assert.equal(PATRON_TIERS.length, 5);
  assert.equal(PATRON_TIERS[0].name, '💗 Patron');
  assert.equal(PATRON_TIERS[4].name, '👑 Patron ++++');
  for (let i = 1; i < PATRON_TIERS.length; i++) {
    assert.ok(PATRON_TIERS[i].entryBonus > PATRON_TIERS[i - 1].entryBonus, 'entry bonus ascends');
    assert.ok(PATRON_TIERS[i].xpMultiplier > PATRON_TIERS[i - 1].xpMultiplier, 'xp multiplier ascends');
  }
});

test('5 chat level roles each grant a real buff', () => {
  assert.equal(CHAT_LEVEL_ROLES.length, 5);
  assert.deepEqual(CHAT_LEVEL_ROLES.map((c) => c.level), [5, 10, 25, 50, 100]);
  for (const c of CHAT_LEVEL_ROLES) {
    assert.ok(c.entryBonus > 0, `${c.name} gives entries`);
    assert.ok(c.xpMultiplier > 1, `${c.name} gives an xp boost`);
    assert.ok(c.perks.length >= 2, `${c.name} lists perks`);
  }
});

test('patron and chat buffs stack', () => {
  assert.equal(buffsForRoleKeys([]).entries, 1);
  assert.equal(buffsForRoleKeys(['patron5', 'chat100']).entries, 17);
  assert.equal(buffsForRoleKeys(['patron1', 'chat5']).entries, 3);
  // only the highest of each family counts
  assert.equal(buffsForRoleKeys(['patron1', 'patron5']).entries, 9);
});

test('every blueprint permission name is a real discord flag', async () => {
  const { PermissionFlagsBits } = await import('discord.js');
  for (const role of ROLES) {
    for (const p of role.permissions) assert.ok(PermissionFlagsBits[p] !== undefined, `role perm ${p}`);
  }
  const walk = (spec) => {
    for (const rule of Object.values(spec ?? {})) {
      for (const p of [...(rule.allow ?? []), ...(rule.deny ?? [])]) {
        assert.ok(PermissionFlagsBits[p] !== undefined, `overwrite perm ${p}`);
      }
    }
  };
  for (const cat of CATEGORIES) {
    walk(cat.overwrites);
    for (const ch of cat.channels) walk(ch.overwrites);
  }
});

test('normalizeName ignores emoji and separators', () => {
  assert.equal(normalizeName('🎁│general'), normalizeName('general'));
  assert.equal(normalizeName('🎁 | General'), normalizeName('general'));
  assert.equal(normalizeName('🛠️│create-giveaway'), normalizeName('create giveaway'));
});

/* ----------------------------- helpers ------------------------------ */

test('parseDuration handles the documented formats', () => {
  assert.equal(parseDuration('30m'), 1800000);
  assert.equal(parseDuration('2h'), 7200000);
  assert.equal(parseDuration('3d'), 259200000);
  assert.equal(parseDuration('1w'), 604800000);
  assert.equal(parseDuration('1d12h'), 129600000);
  assert.equal(parseDuration('45'), 2700000, 'bare number = minutes');
  assert.equal(parseDuration('banana'), null);
  assert.equal(parseDuration(''), null);
});

test('formatDuration is human readable', () => {
  assert.equal(formatDuration(3723000), '1h 2m');
  assert.equal(formatDuration(86400000), '1d');
});

test('pickWinners returns distinct winners and respects weight', () => {
  const entries = [
    { userId: 'a', weight: 1 },
    { userId: 'b', weight: 1 },
    { userId: 'c', weight: 1 },
  ];
  const w = pickWinners(entries, 2);
  assert.equal(w.length, 2);
  assert.equal(new Set(w).size, 2, 'no duplicate winners');

  assert.equal(pickWinners(entries, 10).length, 3, 'never more winners than entrants');
  assert.deepEqual(pickWinners([], 3), [], 'empty pool is safe');

  // heavy weighting should dominate over many trials
  const heavy = [
    { userId: 'whale', weight: 100 },
    { userId: 'minnow', weight: 1 },
  ];
  let whaleWins = 0;
  for (let i = 0; i < 400; i++) if (pickWinners(heavy, 1)[0] === 'whale') whaleWins++;
  assert.ok(whaleWins > 300, `weighted pick favours the whale (got ${whaleWins}/400)`);
});

test('level curve is monotonic and round-trips', () => {
  assert.equal(levelFromXp(0).level, 0);
  let last = -1;
  for (let l = 0; l <= 30; l++) {
    const need = totalXpFor(l);
    assert.ok(need > last, 'total xp increases with level');
    assert.equal(levelFromXp(need).level, l, `xp ${need} maps back to level ${l}`);
    last = need;
  }
});
