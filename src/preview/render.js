/**
 * Renders the blueprint + every embed as a Discord-like HTML page.
 * Reads straight from the blueprint, so the preview can never drift from
 * what /setup actually creates.
 */
import { CATEGORIES, ROLES, PATRON_TIERS, CHAT_LEVEL_ROLES, countPlan, channelName } from '../config/blueprint.js';
import { BRAND, COLORS } from '../config/constants.js';
import { buildGiveawayModal } from '../lib/giveaway-panel.js';
import {
  welcomeEmbed,
  rulesEmbed,
  faqEmbed,
  createGiveawayPanel,
  giveawayRulesEmbed,
  patreonEmbed,
  chatRewardsEmbed,
  giveawayEmbed,
} from '../lib/embeds.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const hex = (n) => `#${(n ?? 0).toString(16).padStart(6, '0')}`;

/** Turn Discord markdown-ish text into small HTML. */
function md(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/&lt;#(\w+)&gt;/g, '<span class="mention">#channel</span>')
    .replace(/&lt;@&amp;(\w+)&gt;/g, '<span class="mention">@role</span>')
    .replace(/&lt;@(\w+)&gt;/g, '<span class="mention">@user</span>')
    .replace(/&lt;t:(\d+):[Rf]&gt;/g, '<span class="ts">in 24 hours</span>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

/** Render a discord.js EmbedBuilder as HTML. */
function embedHtml(builder, { components = [] } = {}) {
  const e = builder.data ?? builder;
  const color = hex(e.color ?? COLORS.primary);
  const fields = (e.fields ?? [])
    .map(
      (f) => `
    <div class="field ${f.inline ? 'inline' : ''}">
      ${f.name && f.name !== '\u200b' ? `<div class="field-name">${md(f.name)}</div>` : ''}
      <div class="field-value">${md(f.value)}</div>
    </div>`,
    )
    .join('');

  const buttons = components
    .flatMap((row) => row.components ?? row.data?.components ?? [])
    .map((c) => {
      const d = c.data ?? c;
      const styles = { 1: 'primary', 2: 'secondary', 3: 'success', 4: 'danger' };
      return `<button class="btn ${styles[d.style] ?? 'secondary'}">${d.emoji?.name ?? ''} ${esc(d.label ?? '')}</button>`;
    })
    .join('');

  return `
  <div class="embed" style="border-left-color:${color}">
    ${e.author ? `<div class="embed-author">${esc(e.author.name)}</div>` : ''}
    ${e.title ? `<div class="embed-title">${md(e.title)}</div>` : ''}
    ${e.description ? `<div class="embed-desc">${md(e.description)}</div>` : ''}
    ${fields ? `<div class="fields">${fields}</div>` : ''}
    ${e.footer ? `<div class="embed-footer">${esc(e.footer.text)}</div>` : ''}
  </div>
  ${buttons ? `<div class="btn-row">${buttons}</div>` : ''}`;
}

const CHANNEL_ICON = {
  text: '#',
  announcement: '📣',
  voice: '🔊',
  forum: '💬',
  stage: '🎙️',
};

export function renderPage() {
  const plan = countPlan();
  const sep = '│';

  // Fake ids so mentions render as pills.
  const ctx = {
    roles: Object.fromEntries(ROLES.map((r) => [r.key, `r_${r.key}`])),
    channels: Object.fromEntries(CATEGORIES.flatMap((c) => c.channels.map((ch) => [ch.key, `c_${ch.key}`]))),
  };

  const tree = CATEGORIES.map(
    (cat) => `
    <div class="cat">
      <div class="cat-name">${esc(cat.name)}</div>
      ${cat.channels
        .map((ch) => {
          const name = channelName(ch.emoji, ch.name, sep, { lower: !ch.preserveCase });
          const locked = ch.overwrites || cat.staffOnly;
          const gate =
            ch.key === 'createGiveaway'
              ? '<span class="gate funder">Funder only</span>'
              : ch.key?.startsWith('patron') || ch.key === 'vcPatron'
                ? '<span class="gate patron">Patron</span>'
                : cat.staffOnly
                  ? '<span class="gate staff">Staff</span>'
                  : '';
          return `<div class="ch ${locked ? 'locked' : ''}">
            <span class="ch-icon">${CHANNEL_ICON[ch.type] ?? '#'}</span>
            <span class="ch-name">${esc(name)}</span>
            ${gate}
          </div>`;
        })
        .join('')}
    </div>`,
  ).join('');

  const roleGroups = ROLES.reduce((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  const roleHtml = Object.entries(roleGroups)
    .map(
      ([group, roles]) => `
      <div class="role-group">
        <h4>${esc(group)}</h4>
        ${roles
          .map(
            (r) => `<div class="role">
              <span class="dot" style="background:${hex(r.color)}"></span>
              <span class="role-name" style="color:${hex(r.color)}">${esc(r.name)}</span>
              <span class="role-desc">${esc(r.description ?? '')}</span>
            </div>`,
          )
          .join('')}
      </div>`,
    )
    .join('');

  const fakeGiveaway = {
    id: 'gw_demo1234',
    title: 'Booster Bonanza #7',
    prize: '1x Steam Deck OLED 1TB — shipped anywhere in the EU/UK',
    description: 'Our biggest drop yet. Boosters only.',
    winnerCount: 2,
    hostId: '1',
    endsAt: Date.now() + 86400000,
    patronOnly: false,
    requiredRoles: ['r_booster'],
    requiredMode: 'any',
    winners: [],
  };

  const createPanel = createGiveawayPanel(ctx);

  // Render the real modal definition so the preview can't drift from the code.
  const modalJson = buildGiveawayModal().toJSON();
  const modalHtml = modalJson.components
    .map((label) => {
      const c = label.component;
      const isSelect = c.type === 6;
      const body = isSelect
        ? `<div class="select">${esc(c.placeholder ?? 'Select…')}<span class="caret">▾</span></div>`
        : c.style === 2
          ? `<div class="input area">${esc(c.placeholder ?? '')}</div>`
          : `<div class="input">${esc(c.placeholder ?? '')}</div>`;
      return `<div class="mfield">
        <div class="mlabel">${esc(label.label)}${c.required === false && !/optional/i.test(label.label) ? '<span class="opt">optional</span>' : ''}</div>
        ${label.description ? `<div class="mdesc">${esc(label.description)}</div>` : ''}
        ${body}
      </div>`;
    })
    .join('');
  const rewardsPanel = chatRewardsEmbed(ctx);

  const tierTable = PATRON_TIERS.map(
    (t) => `<tr>
      <td><span class="dot" style="background:${hex(t.color)}"></span> ${esc(t.name)}</td>
      <td>${esc(t.requirement)}</td>
      <td class="num">+${t.entryBonus}</td>
      <td class="num">${t.xpMultiplier}×</td>
    </tr>`,
  ).join('');

  const chatTable = CHAT_LEVEL_ROLES.map(
    (c) => `<tr>
      <td><span class="dot" style="background:${hex(c.color)}"></span> ${esc(c.name)}</td>
      <td>Level ${c.level}</td>
      <td class="num">+${c.entryBonus}</td>
      <td class="num">${c.xpMultiplier}×</td>
    </tr>`,
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(BRAND.name)} — server preview</title>
<style>
  :root{
    --bg:#1e1f22; --bg2:#2b2d31; --bg3:#313338; --txt:#dbdee1; --muted:#949ba4;
    --accent:#5865f2; --gold:#f1c40f; --green:#2ecc71; --pink:#eb459e;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);
    font-family:"gg sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5}
  header{padding:32px 24px;background:linear-gradient(135deg,#5865f2 0%,#eb459e 100%);}
  header h1{margin:0;font-size:30px;font-weight:800;color:#fff;letter-spacing:-.4px}
  header p{margin:6px 0 0;color:rgba(255,255,255,.9);font-size:15px}
  .stats{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
  .stat{background:rgba(0,0,0,.28);border-radius:9px;padding:8px 14px;color:#fff;font-size:13px}
  .stat b{font-size:18px;display:block;line-height:1.2}
  .wrap{max-width:1240px;margin:0 auto;padding:24px}
  .grid{display:grid;grid-template-columns:300px 1fr;gap:24px;align-items:start}
  @media(max-width:900px){.grid{grid-template-columns:1fr}}
  .panel{background:var(--bg2);border-radius:12px;padding:16px;margin-bottom:20px}
  .panel h3{margin:0 0 14px;font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)}
  .sidebar{background:var(--bg2);border-radius:12px;padding:14px;position:sticky;top:20px;max-height:92vh;overflow:auto}
  .cat{margin-bottom:14px}
  .cat-name{font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);
    letter-spacing:.6px;padding:4px 6px;margin-bottom:2px}
  .ch{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:5px;
    font-size:14px;color:var(--muted);cursor:default}
  .ch:hover{background:var(--bg3);color:#fff}
  .ch-icon{opacity:.65;font-size:13px;width:15px;text-align:center;flex:none}
  .ch-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ch.locked .ch-name{opacity:.85}
  .gate{margin-left:auto;font-size:9px;font-weight:700;padding:2px 6px;border-radius:20px;
    text-transform:uppercase;letter-spacing:.3px;flex:none}
  .gate.funder{background:rgba(46,204,113,.18);color:#2ecc71}
  .gate.patron{background:rgba(235,69,158,.18);color:#eb459e}
  .gate.staff{background:rgba(237,66,69,.18);color:#ed4245}
  .embed{background:var(--bg3);border-left:4px solid var(--accent);border-radius:4px;
    padding:14px 16px;margin:10px 0;max-width:560px;font-size:14px}
  .embed-title{font-weight:700;color:#f2f3f5;margin-bottom:7px;font-size:15px}
  .embed-author{font-size:13px;font-weight:600;margin-bottom:6px}
  .embed-desc{color:var(--txt);white-space:normal}
  .fields{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}
  .field{flex:1 1 100%;min-width:0}
  .field.inline{flex:1 1 30%}
  .field-name{font-weight:700;font-size:13px;color:#f2f3f5;margin-bottom:2px}
  .field-value{font-size:13px;color:var(--txt)}
  .embed-footer{margin-top:12px;font-size:11px;color:var(--muted)}
  code{background:rgba(0,0,0,.35);padding:1px 4px;border-radius:3px;font-size:12px;
    font-family:Consolas,monospace}
  .mention{background:rgba(88,101,242,.25);color:#c9cdfb;padding:0 3px;border-radius:3px;font-weight:500}
  .ts{background:rgba(255,255,255,.08);padding:0 3px;border-radius:3px}
  .btn-row{display:flex;gap:8px;margin:8px 0 18px;flex-wrap:wrap}
  .btn{border:none;border-radius:4px;padding:8px 16px;font-size:14px;font-weight:500;
    color:#fff;cursor:default;font-family:inherit}
  .btn.success{background:#248046}.btn.primary{background:#5865f2}
  .btn.secondary{background:#4e5058}.btn.danger{background:#da373c}
  .role-group{margin-bottom:16px}
  .role-group h4{margin:0 0 7px;font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:.6px}
  .role{display:flex;align-items:center;gap:8px;padding:5px 9px;background:var(--bg3);
    border-radius:6px;margin-bottom:4px;font-size:13px}
  .dot{width:10px;height:10px;border-radius:50%;flex:none}
  .role-name{font-weight:600;flex:none}
  .role-desc{color:var(--muted);font-size:12px;margin-left:auto;text-align:right}
  @media(max-width:700px){.role-desc{display:none}}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)}
  th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td.num{font-variant-numeric:tabular-nums;font-weight:600}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  @media(max-width:800px){.two{grid-template-columns:1fr}}
  .modal{background:#313338;border-radius:8px;padding:18px;max-width:520px;
    box-shadow:0 8px 24px rgba(0,0,0,.4)}
  .modal-title{font-size:19px;font-weight:700;color:#f2f3f5;margin-bottom:16px}
  .mfield{margin-bottom:16px}
  .mlabel{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;
    color:#dbdee1;margin-bottom:3px}
  .opt{margin-left:6px;color:#949ba4;font-weight:500;text-transform:none;letter-spacing:0}
  .mdesc{font-size:12px;color:#949ba4;margin-bottom:6px}
  .input{background:#1e1f22;border:1px solid #1e1f22;border-radius:4px;padding:10px;
    color:#87898c;font-size:14px}
  .input.area{min-height:64px}
  .select{background:#1e1f22;border:1px solid #1e1f22;border-radius:4px;padding:10px;
    color:#87898c;font-size:14px;display:flex;justify-content:space-between;align-items:center}
  .caret{color:#b5bac1}
  .modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
  .note{background:rgba(88,101,242,.1);border:1px solid rgba(88,101,242,.3);
    border-radius:8px;padding:12px 14px;font-size:13px;color:#c9cdfb;margin-bottom:18px}
  .cmd{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px}
  .cmd code{flex:none;min-width:230px;color:#f0b132}
</style>
</head>
<body>
<header>
  <h1>${BRAND.icon} ${esc(BRAND.name)}</h1>
  <p>${esc(BRAND.tagline)} — this is exactly what <code style="color:#fff">/setup</code> builds.</p>
  <div class="stats">
    <div class="stat"><b>${plan.roles}</b>roles</div>
    <div class="stat"><b>${plan.categories}</b>categories</div>
    <div class="stat"><b>${plan.channels}</b>channels</div>
    <div class="stat"><b>${plan.voice}</b>voice</div>
    <div class="stat"><b>5</b>patron tiers</div>
    <div class="stat"><b>5</b>chat levels</div>
  </div>
</header>

<div class="wrap">
  <div class="note">
    This is a static preview rendered from the same blueprint the bot uses, so it always matches reality.
    Channels follow the <strong>emoji │ channel</strong> format. Locked channels show who can see them.
  </div>

  <div class="grid">
    <div class="sidebar">${tree}</div>

    <div>
      <div class="panel">
        <h3>🎁 Giveaway post (what members see)</h3>
        ${embedHtml(giveawayEmbed(fakeGiveaway, { entries: { people: 342, weight: 891 } }), {
          components: [
            { components: [{ data: { label: 'Enter', style: 3, emoji: { name: '🎁' } } }, { data: { label: 'Entries: 342', style: 2, emoji: { name: '👥' } } }] },
          ],
        })}
      </div>

      <div class="panel">
        <h3>🧾 /giveaway create — the panel</h3>
        <div class="modal">
          <div class="modal-title">Create a Giveaway</div>
          ${modalHtml}
          <div class="modal-actions"><button class="btn secondary">Cancel</button><button class="btn primary">Submit</button></div>
        </div>
      </div>

      <div class="panel">
        <h3>🛠️ create-giveaway — Giveaway Funder only</h3>
        ${embedHtml(createPanel.embeds[0], { components: createPanel.components })}
      </div>

      <div class="panel">
        <h3>📈 chat-rewards embed</h3>
        ${embedHtml(rewardsPanel.embeds[0], { components: rewardsPanel.components })}
      </div>

      <div class="panel">
        <h3>⭐ patreon-perks embed</h3>
        ${embedHtml(patreonEmbed(ctx))}
      </div>

      <div class="panel">
        <h3>👋 welcome · 📜 rules · ❓ faq · 📜 giveaway-rules</h3>
        ${embedHtml(welcomeEmbed(ctx))}
        ${embedHtml(rulesEmbed())}
        ${embedHtml(faqEmbed(ctx))}
        ${embedHtml(giveawayRulesEmbed())}
      </div>

      <div class="panel">
        <h3>🎭 Roles created by /setup</h3>
        ${roleHtml}
      </div>

      <div class="panel">
        <h3>📊 Buff ladder</h3>
        <div class="two">
          <div>
            <table>
              <tr><th>Patron tier</th><th>Price</th><th>Entries</th><th>XP</th></tr>
              ${tierTable}
            </table>
          </div>
          <div>
            <table>
              <tr><th>Chat role</th><th>Unlock</th><th>Entries</th><th>XP</th></tr>
              ${chatTable}
            </table>
          </div>
        </div>
        <p style="color:var(--muted);font-size:13px;margin-top:14px">
          Bonuses <strong>stack</strong>: base 1 + highest patron tier + highest chat role =
          <strong>up to 17 entries</strong>. XP multipliers multiply (up to 2.25×).
        </p>
      </div>

      <div class="panel">
        <h3>⌨️ Commands</h3>
        <div class="cmd"><code>/setup</code><span>Build roles, categories, channels and post every panel</span></div>
        <div class="cmd"><code>/setup preview:true</code><span>Show the plan without touching the server</span></div>
        <div class="cmd"><code>/giveaway create</code><span>Host a giveaway (needs 💰 Giveaway Funder)</span></div>
        <div class="cmd"><code>/giveaway end · reroll · cancel · list</code><span>Manage running giveaways</span></div>
        <div class="cmd"><code>/rank</code><span>Your level, XP, entries and active buffs</span></div>
        <div class="cmd"><code>/leaderboard</code><span>Top chatters</span></div>
        <div class="cmd"><code>/patreon tiers · grant · revoke</code><span>Patron tier management</span></div>
        <div class="cmd"><code>/rewards show · post</code><span>The chat rewards embed</span></div>
        <div class="cmd"><code>/help</code><span>Everything at a glance</span></div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}
