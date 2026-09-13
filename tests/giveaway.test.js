import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_PATH = join(tmpdir(), `opb-gw-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);

const { ComponentType, TextInputStyle } = await import('discord.js');
const { buildGiveawayModal, buildLegacyModal, readModal, FIELDS, MAX_REQUIRED_ROLES, usesLabelComponents } = await import('../src/lib/giveaway-panel.js');
const { validateDraft, LIMITS } = await import('../src/lib/giveaway-create.js');
const { giveawayEmbed } = await import('../src/lib/embeds.js');
const store = await import('../src/lib/store.js');
const { saveDraft, getDraft, updateDraft, deleteDraft, _clearDrafts } = await import('../src/lib/drafts.js');
const { pickWinners } = await import('../src/lib/util.js');

/* --------------------------- the panel ------------------------------ */

test('the panel asks for title, prize, winners, duration and an optional role', () => {
  const json = buildGiveawayModal().toJSON();
  assert.equal(json.custom_id, 'gw:modal');
  assert.equal(json.title, 'Create a Giveaway');
  assert.equal(json.components.length, 5, 'five fields');

  const inner = json.components.map((c) => c.component);
  const ids = inner.map((c) => c.custom_id);
  assert.deepEqual(ids, [FIELDS.title, FIELDS.prize, FIELDS.winners, FIELDS.duration, FIELDS.roles]);

  // Everything required except the role picker.
  assert.equal(inner[0].required, true, 'title required');
  assert.equal(inner[1].required, true, 'prize required');
  assert.equal(inner[2].required, true, 'winners required');
  assert.equal(inner[3].required, true, 'duration required');
  assert.equal(inner[4].required, false, 'role is optional');
});

test('the role field is a native role picker, not a text box', () => {
  const json = buildGiveawayModal().toJSON();
  const roleField = json.components.find((c) => c.component.custom_id === FIELDS.roles).component;
  assert.equal(roleField.type, ComponentType.RoleSelect, 'uses a RoleSelect component');
  assert.equal(roleField.min_values, 0, 'can select nothing');
  assert.equal(roleField.max_values, MAX_REQUIRED_ROLES);
});

test('every field is wrapped in a Label component', () => {
  const modal = buildGiveawayModal();
  assert.ok(usesLabelComponents(modal));
  for (const c of modal.toJSON().components) {
    assert.equal(c.type, ComponentType.Label);
    assert.ok(c.label?.length > 0, 'label has text');
  }
});

test('the panel labels describe what to enter', () => {
  const json = buildGiveawayModal().toJSON();
  const labels = json.components.map((c) => c.label.toLowerCase());
  assert.ok(labels[0].includes('title'));
  assert.ok(labels[1].includes('win'), 'asks what you win');
  assert.ok(labels[2].includes('winners'));
  assert.ok(labels[3].includes('duration'));
  assert.ok(labels[4].includes('role') && labels[4].includes('optional'), 'role field is marked optional');
});

test('defaults are pre-filled when re-opening the panel', () => {
  const json = buildGiveawayModal({ title: 'Nitro Drop', prize: 'Nitro 1mo', winners: 3, duration: '2h', roleIds: ['111'] }).toJSON();
  const byId = Object.fromEntries(json.components.map((c) => [c.component.custom_id, c.component]));
  assert.equal(byId[FIELDS.title].value, 'Nitro Drop');
  assert.equal(byId[FIELDS.prize].value, 'Nitro 1mo');
  assert.equal(byId[FIELDS.winners].value, '3');
  assert.equal(byId[FIELDS.duration].value, '2h');
  assert.deepEqual(byId[FIELDS.roles].default_values, [{ id: '111', type: 'role' }]);
});

test('the legacy fallback modal is valid and text-only', () => {
  const json = buildLegacyModal().toJSON();
  assert.equal(json.custom_id, 'gw:modalLegacy');
  assert.equal(json.components.length, 4, 'four rows, under the 5-row cap');
  for (const row of json.components) {
    assert.equal(row.type, ComponentType.ActionRow);
    assert.equal(row.components[0].type, ComponentType.TextInput);
    assert.ok(row.components[0].label?.length > 0, 'legacy inputs need their own label');
  }
});

/* ------------------------- reading it back --------------------------- */

function fakeSubmit({ title = '', prize = '', winners = '', duration = '', roles = null }) {
  return {
    fields: {
      getTextInputValue(id) {
        const map = { [FIELDS.title]: title, [FIELDS.prize]: prize, [FIELDS.winners]: winners, [FIELDS.duration]: duration };
        if (!(id in map)) throw new Error('not found');
        return map[id];
      },
      getSelectedRoles() {
        if (roles === null) throw new Error('no role field');
        return new Map(roles.map((r) => [r, { id: r }]));
      },
    },
  };
}

test('readModal extracts all fields including selected roles', () => {
  const parsed = readModal(fakeSubmit({ title: ' Nitro Drop ', prize: ' 1x Nitro ', winners: '2', duration: '24h', roles: ['role1', 'role2'] }));
  assert.equal(parsed.title, 'Nitro Drop', 'trimmed');
  assert.equal(parsed.prize, '1x Nitro');
  assert.equal(parsed.winnersRaw, '2');
  assert.equal(parsed.durationRaw, '24h');
  assert.deepEqual(parsed.roleIds, ['role1', 'role2']);
});

test('readModal copes with the legacy modal that has no role field', () => {
  const parsed = readModal(fakeSubmit({ title: 'T', prize: 'P', winners: '1', duration: '1h', roles: null }));
  assert.deepEqual(parsed.roleIds, [], 'no roles, no crash');
});

/* ---------------------------- validation ----------------------------- */

const guild = {
  id: 'GUILD',
  roles: { cache: new Map([['managedRole', { id: 'managedRole', name: 'BotRole', managed: true }], ['booster', { id: 'booster', name: 'Booster', managed: false }]]) },
};

test('a complete panel submission validates', () => {
  const r = validateDraft({ title: 'Nitro Drop', prize: '1x Nitro', winnersRaw: '2', durationRaw: '24h', roleIds: ['booster'] }, { guild });
  assert.ok(r.ok);
  assert.equal(r.value.title, 'Nitro Drop');
  assert.equal(r.value.winnerCount, 2);
  assert.equal(r.value.durationMs, 86400000);
  assert.equal(r.value.durationLabel, '1d');
  assert.deepEqual(r.value.roleIds, ['booster']);
});

test('the role is genuinely optional', () => {
  const r = validateDraft({ title: 'T', prize: 'P', winnersRaw: '1', durationRaw: '1h' }, { guild });
  assert.ok(r.ok);
  assert.deepEqual(r.value.roleIds, [], 'no role = open to everyone');
});

test('missing title or prize is rejected', () => {
  const noTitle = validateDraft({ title: '   ', prize: 'P', winnersRaw: '1', durationRaw: '1h' }, { guild });
  assert.equal(noTitle.ok, false);
  assert.match(noTitle.errors.join(' '), /title/i);

  const noPrize = validateDraft({ title: 'T', prize: '', winnersRaw: '1', durationRaw: '1h' }, { guild });
  assert.equal(noPrize.ok, false);
  assert.match(noPrize.errors.join(' '), /prize/i);
});

test('winners must be a whole number in range', () => {
  for (const bad of ['abc', '1.5', '-2', '0', '21', '99']) {
    const r = validateDraft({ title: 'T', prize: 'P', winnersRaw: bad, durationRaw: '1h' }, { guild });
    assert.equal(r.ok, false, `"${bad}" should be rejected`);
    assert.match(r.errors.join(' '), /winners/i);
  }
  for (const good of ['1', '20', '7']) {
    assert.ok(validateDraft({ title: 'T', prize: 'P', winnersRaw: good, durationRaw: '1h' }, { guild }).ok, `"${good}" ok`);
  }
});

test('winners defaults to 1 when left blank', () => {
  const r = validateDraft({ title: 'T', prize: 'P', winnersRaw: '', durationRaw: '1h' }, { guild });
  assert.ok(r.ok);
  assert.equal(r.value.winnerCount, 1);
});

test('bad, too-short and too-long durations are rejected with a helpful message', () => {
  const bad = validateDraft({ title: 'T', prize: 'P', winnersRaw: '1', durationRaw: 'soon' }, { guild });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /30m/, 'suggests valid formats');

  assert.equal(validateDraft({ title: 'T', prize: 'P', winnersRaw: '1', durationRaw: '5s' }, { guild }).ok, false, 'too short');
  assert.equal(validateDraft({ title: 'T', prize: 'P', winnersRaw: '1', durationRaw: '100d' }, { guild }).ok, false, 'too long');
  assert.ok(validateDraft({ title: 'T', prize: 'P', winnersRaw: '1', durationRaw: '89d' }, { guild }).ok, '89d fine');
});

test('all errors are reported at once, not one at a time', () => {
  const r = validateDraft({ title: '', prize: '', winnersRaw: 'x', durationRaw: 'y' }, { guild });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 4, `expected 4+ errors, got ${r.errors.length}`);
});

test('@everyone and bot roles are dropped from the requirement', () => {
  const r = validateDraft({ title: 'T', prize: 'P', winnersRaw: '1', durationRaw: '1h', roleIds: ['GUILD', 'managedRole', 'booster'] }, { guild });
  assert.ok(r.ok);
  assert.deepEqual(r.value.roleIds, ['booster'], 'only the real role survives');
  assert.equal(r.value.droppedRoles.length, 2, 'and the user is told what was ignored');
});

test('duplicate role selections collapse', () => {
  const r = validateDraft({ title: 'T', prize: 'P', winnersRaw: '1', durationRaw: '1h', roleIds: ['booster', 'booster'] }, { guild });
  assert.deepEqual(r.value.roleIds, ['booster']);
});

/* ------------------------------ embed -------------------------------- */

test('the embed shows the title, prize, winners and required role', () => {
  const gw = {
    id: 'gw_1',
    title: 'Nitro Drop #12',
    prize: '1x Discord Nitro (1 month)',
    winnerCount: 2,
    hostId: 'host1',
    endsAt: Date.now() + 3600000,
    requiredRoles: ['booster'],
    requiredMode: 'any',
    patronOnly: false,
    winners: [],
  };
  const data = giveawayEmbed(gw, { entries: { people: 5, weight: 9 } }).toJSON();

  assert.match(data.title, /Nitro Drop #12/, 'title is the headline');
  const fields = Object.fromEntries(data.fields.map((f) => [f.name.replace(/[^\w ]/g, '').trim(), f.value]));
  assert.match(fields.Prize, /Discord Nitro/, 'prize shown');
  assert.match(fields.Winners, /2/);
  assert.match(fields.Entries, /5/);
  assert.match(JSON.stringify(data.fields), /<@&booster>/, 'required role mentioned');
});

test('an open giveaway shows no requirements block', () => {
  const gw = { id: 'g', title: 'T', prize: 'P', winnerCount: 1, hostId: 'h', endsAt: Date.now() + 1000, requiredRoles: [], patronOnly: false, winners: [] };
  const data = giveawayEmbed(gw, {}).toJSON();
  assert.ok(!JSON.stringify(data.fields).includes('Requirements'));
});

test('a giveaway with no explicit title falls back to the prize', () => {
  const gw = { id: 'g', prize: 'Steam Key', winnerCount: 1, hostId: 'h', endsAt: Date.now() + 1000, requiredRoles: [], winners: [] };
  assert.match(giveawayEmbed(gw, {}).toJSON().title, /Steam Key/);
});

test('an overlong prize is truncated to fit the embed field limit', () => {
  const gw = { id: 'g', title: 'T', prize: 'x'.repeat(3000), winnerCount: 1, hostId: 'h', endsAt: Date.now() + 1000, requiredRoles: [], winners: [] };
  const prizeField = giveawayEmbed(gw, {}).toJSON().fields.find((f) => f.name.includes('Prize'));
  assert.ok(prizeField.value.length <= 1024, `prize field is ${prizeField.value.length} chars`);
});

/* --------------------------- persistence ----------------------------- */

test('title and required roles round-trip through the database', () => {
  const gw = store.createGiveaway({
    id: 'gw_store_1',
    guildId: 'G',
    channelId: 'C',
    hostId: 'H',
    title: 'Booster Only Drop',
    prize: '3x Steam Keys',
    winnerCount: 3,
    endsAt: Date.now() + 60000,
    requiredRoles: ['booster', 'vip'],
    requiredMode: 'any',
  });
  assert.equal(gw.title, 'Booster Only Drop');
  assert.deepEqual(gw.requiredRoles, ['booster', 'vip']);

  const again = store.getGiveaway('gw_store_1');
  assert.equal(again.title, 'Booster Only Drop');
  assert.deepEqual(again.requiredRoles, ['booster', 'vip']);
  assert.equal(again.requiredRole, 'booster', 'legacy field still populated');
});

test('a giveaway with no roles stores an empty list, not null', () => {
  const gw = store.createGiveaway({ id: 'gw_store_2', guildId: 'G', channelId: 'C', hostId: 'H', title: 'Open', prize: 'P', winnerCount: 1, endsAt: Date.now() + 60000 });
  assert.deepEqual(gw.requiredRoles, []);
  assert.equal(gw.requiredRole, null);
});

/* ----------------------------- drafts -------------------------------- */

test('drafts are per-user and can be updated then deleted', () => {
  _clearDrafts();
  const id = saveDraft('user1', { title: 'T', prize: 'P', winnerCount: 1, durationMs: 1000, durationLabel: '1s', roleIds: [] });

  assert.ok(getDraft(id, 'user1'), 'owner can read it');
  assert.equal(getDraft(id, 'user2'), null, 'someone else cannot');

  updateDraft(id, { roleIds: ['booster'] });
  assert.deepEqual(getDraft(id, 'user1').roleIds, ['booster']);

  deleteDraft(id);
  assert.equal(getDraft(id, 'user1'), null, 'gone after delete');
});

/* ------------------------- end-to-end gating -------------------------- */

test('role gating decides who may enter', () => {
  // Mirrors the check in events/interactionCreate.js
  const passes = (required, mode, held) => {
    if (!required.length) return true;
    const have = required.filter((r) => held.includes(r));
    return mode === 'all' ? have.length === required.length : have.length > 0;
  };

  assert.equal(passes([], 'any', []), true, 'no requirement = anyone');
  assert.equal(passes(['booster'], 'any', []), false, 'non-booster blocked');
  assert.equal(passes(['booster'], 'any', ['booster']), true, 'booster allowed');
  assert.equal(passes(['booster', 'vip'], 'any', ['vip']), true, 'any-of passes with one');
  assert.equal(passes(['booster', 'vip'], 'all', ['vip']), false, 'all-of needs both');
  assert.equal(passes(['booster', 'vip'], 'all', ['vip', 'booster']), true, 'all-of satisfied');
});

test('full flow: create from panel input, enter, draw a winner', () => {
  const parsed = readModal(fakeSubmit({ title: 'Booster Drop', prize: 'Nitro', winners: '1', duration: '30m', roles: ['booster'] }));
  const v = validateDraft(parsed, { guild });
  assert.ok(v.ok);

  const gw = store.createGiveaway({
    id: 'gw_flow_1',
    guildId: 'G',
    channelId: 'C',
    hostId: 'H',
    title: v.value.title,
    prize: v.value.prize,
    winnerCount: v.value.winnerCount,
    endsAt: Date.now() + v.value.durationMs,
    requiredRoles: v.value.roleIds,
  });

  assert.equal(gw.title, 'Booster Drop');
  assert.deepEqual(gw.requiredRoles, ['booster']);

  store.addEntry(gw.id, 'boosterUser', 3);
  assert.deepEqual(store.countEntries(gw.id), { people: 1, weight: 3 });

  const winners = pickWinners(store.getEntries(gw.id), gw.winnerCount);
  assert.deepEqual(winners, ['boosterUser']);

  store.markEnded(gw.id, winners);
  assert.equal(store.getGiveaway(gw.id).ended, true);
});
