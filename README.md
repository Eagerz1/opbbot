# 🎁 OPB Giveaways

A Discord bot that builds your whole server with one command, then runs the giveaways, Patreon tiers and chat rewards on top of it.

`/setup` creates **19 roles**, **7 categories** and **31 channels** — every channel named in `emoji │ channel` format — and posts the rules, FAQ, Patreon and chat-rewards embeds automatically.

---

## Quick start

Needs **Node 22+** ([download](https://nodejs.org)). Check with `node -v`.

```bash
git clone -b arena/01a09aab-opbbot https://github.com/Eagerz1/opbbot.git
cd opbbot
npm install
npm run doctor
```

`npm run doctor` creates your `.env` for you and tells you exactly what to fill in.
Open `.env` in a text editor, paste your `DISCORD_TOKEN` and `CLIENT_ID`, then:

```bash
npm run doctor            # re-check — should be all green
npm run deploy            # register the slash commands
npm start                 # run the bot
```

Then in Discord: **`/setup`**

📖 **[Full step-by-step guide → SETUP.md](SETUP.md)** — creating the bot, getting your token, inviting it, and hosting it 24/7.

> Want to see the whole server layout before running anything?
> `npm run preview` → <http://localhost:3000>

### No native compilation

Two dependencies, both pure JavaScript: `discord.js` and `dotenv`. The database uses Node's built-in SQLite, so `npm install` never invokes a C++ compiler — no `node-gyp` failures and no Visual Studio Build Tools on Windows.

---

## Commands

| Command | Who | What it does |
|---|---|---|
| `/setup` | Admin | Builds every role, category and channel, then posts all info panels |
| `/setup preview:true` | Admin | Shows the full plan **without creating anything** |
| `/setup separator:` | Admin | Pick the name style: `🎁│general`, `🎁｜general`, `🎁-general`, `🎁\|general` |
| `/giveaway create` | 💰 Funder | **Opens the giveaway panel** — title, prize, winners, duration, optional role |
| `/giveaway quick` | 💰 Funder | Same thing as command options, no popup |
| `/giveaway list` | Anyone | Every running giveaway |
| `/giveaway end · reroll · cancel` | Host / Manager | Manage a running giveaway |
| `/rank` | Anyone | Your level, XP, entry count and active buffs |
| `/leaderboard` | Anyone | Top chatters |
| `/patreon tiers` | Anyone | All five tiers and their perks |
| `/patreon grant · revoke` | Staff | Assign or clear a patron tier |
| `/rewards show · post` | Anyone / Staff | The chat-rewards embed |
| `/help` | Anyone | Everything at a glance |

---

## What `/setup` builds

Channel names use `emoji│name`. The `│` is a box-drawing bar, not a pipe — Discord converts spaces around a real `|` into dashes (`🎁-|-general`), which looks broken. Use `/setup separator:` if you want a different style.

```
📋 INFORMATION          👋│welcome  📜│rules  📢│announcements
                        📌│server-updates  ❓│faq  🎭│get-roles

💬 COMMUNITY            💬│general  🖼️│media  😂│memes
                        🤖│bot-commands  🔢│counting

🔊 VOICE CHANNELS       🔊│General VC   🎮│Gaming VC (10)   🎵│Chill VC (5)

🎁 OPB GIVEAWAYS        🎁│opb-giveaways      ← live giveaways, read-only
                        🛠️│create-giveaway   ← 🔒 Giveaway Funder only
                        🏆│giveaway-winners  📜│giveaway-rules  📸│winner-proof

⭐ PATREON              ⭐│patreon-perks
                        💎│patron-chat        ← 🔒 patrons
                        🎁│patron-giveaways   ← 🔒 patrons
                        💎│Patron VC          ← 🔒 patrons

🏅 CHAT REWARDS         📈│chat-rewards  🎊│level-ups  🏅│leaderboard

🛡️ STAFF                🛡️│staff-chat  📋│giveaway-logs  📝│mod-logs
                        🤖│bot-logs  🔒│Staff VC
```

---

## Creating a giveaway

`/giveaway create` (or the **Create Giveaway** button in `🛠️│create-giveaway`) opens a single popup:

```
┌─ Create a Giveaway ─────────────────────────────┐
│ GIVEAWAY TITLE                                  │
│ The headline on the embed                       │
│ [ Nitro Drop #12                              ] │
│                                                 │
│ WHAT DO YOU WIN?                                │
│ Describe the prize                              │
│ [ 1x Discord Nitro (1 month)                  ] │
│                                                 │
│ NUMBER OF WINNERS                               │
│ 1-20                                            │
│ [ 1                                           ] │
│                                                 │
│ DURATION                                        │
│ 30m · 2h · 3d · 1w · 1d12h                      │
│ [ 24h                                         ] │
│                                                 │
│ REQUIRED ROLE (OPTIONAL)                        │
│ Leave empty for everyone.                       │
│ [ 🔽 Anyone can enter — pick a role…          ] │
└─────────────────────────────────────────────────┘
```

That last field is a **native role picker**, not a text box — you scroll and click the role, so there's nothing to spell wrong. Leave it empty and anyone can enter; pick `@Booster` and only boosters can. You can select up to **5 roles**, and holding *any* of them grants entry.

On submit the bot posts an embed with an **Enter** button and a live entry counter:

> 🎁 **Booster Bonanza #7**
> ⏰ Ends in 24 hours
> ✨ **Prize** — 1x Steam Deck OLED
> 🏆 **Winners** 2  ·  👥 **Entries** 342  ·  👑 **Hosted by** @you
> ⚠️ **Requirements** — 🛡️ You need @Booster
>
> `[ 🎁 Enter ]` `[ 👥 Entries: 342 ]`

Anyone without the role who presses **Enter** gets a private "you need @Booster to enter" reply instead of a silent failure. Pressing **Enter** twice removes your entry.

### `/giveaway quick`

Same result without the popup — handy for repeat drops:

```
/giveaway quick title:Nitro Drop #12 prize:1x Nitro duration:24h winners:1 required_role:@Booster
```

### The funder gate

`🛠️│create-giveaway` is **invisible** to everyone who doesn't hold **💰 Giveaway Funder**. It's enforced twice — once with channel permissions, and again in code, so even a leaked link or a stray `/giveaway create` elsewhere is rejected with a clear message.

Give the role to anyone who pays for prizes:
**Server Settings → Members → pick user → add 💰 Giveaway Funder**

---

## Patreon tiers

Tiers are earned by **how many giveaways you have funded**, not by a subscription.

| Tier | Earned at | Entries | XP |
|---|---|---|---|
| 💗 Patron | 1 giveaway funded | +0.1 | 1.1× |
| 💖 Patron + | 3 giveaways funded | +0.2 | 1.2× |
| 💝 Patron ++ | 5 giveaways funded | +0.3 | 1.3× |
| 💜 Patron +++ | 10 giveaways funded | +0.4 | 1.4× |
| 👑 Patron ++++ | 20 giveaways funded | +0.5 | 1.5× |

Grant with `/patreon grant user:@someone tier:...` — it clears any existing tier first, so nobody ends up holding two. Thresholds and perks live in `src/config/blueprint.js` (`PATRON_TIERS`); edit them there and every embed updates itself.

Using the official Patreon–Discord integration instead? Just point each Patreon tier at the matching role and skip `/patreon grant`.

## Self-assignable roles

The `🎭│get-roles` channel gets a panel with a button per role. Members click to
add a role, click again to remove it — no reaction-role bot needed.

| Button | Role | What it does |
|---|---|---|
| 🔔 | Giveaway Ping | Pinged when a giveaway goes live |
| 🎮 | Event Ping | Game nights, movie nights, community events |
| 📢 | Announcement Ping | Server announcements and big news |
| 📈 | Bump Squad | Reminders to bump the server |
| 🎬 | Content Ping | New videos / streams |

Edit `SELF_ROLES` in `src/config/blueprint.js` to change the list, the emoji or
the wording. Only cosmetic opt-in roles belong here — earned roles (Giveaway
Funder, patron tiers, chat levels) are deliberately excluded.

## Chat rewards

Members earn **15–25 XP** per message, once a minute. Info, staff and giveaway channels are excluded so nobody can farm.

| Role | Unlocks at | Entries | XP | Extra |
|---|---|---|---|---|
| 🗨️ Chat Lvl 5 | level 5 | +0.1 | 1.1× | Embed links, external emoji |
| 💬 Chat Lvl 10 | level 10 | +0.2 | 1.2× | Attach files |
| 🔊 Chat Lvl 25 | level 25 | +0.3 | 1.3× | Threads + soundboard |
| 🔥 Chat Lvl 50 | level 50 | +0.4 | 1.4× | Hoisted in member list |
| 🌟 Chat Lvl 100 | level 100 | +0.5 | 1.5× | Change own nickname |

Multipliers stay inside a deliberate **1.1× – 1.5×** band. In a small community a 2× rate lets one heavy chatter dominate every draw.

Roles are granted **automatically** on level-up and announced in `🎊│level-ups`.

### How buffs stack

Base **1 entry** + your highest Patron tier (+0.1 → +0.5) + your highest Chat Level role (+0.1 → +0.5) → **up to 2 entries**. XP multipliers multiply (up to **2.25×**). `/rank` shows a member their exact numbers.

---

## Everything lives in one file

`src/config/blueprint.js` is the single source of truth for roles, categories, channels, permissions, tiers and buffs. Change it and `/setup`, every embed, the tests and the preview site all follow. To add a channel:

```js
{ key: 'clips', emoji: '🎬', name: 'clips', type: 'text', topic: 'Your best plays' }
```

Re-run `/setup` — it **adopts** anything that already exists instead of duplicating it, so it's always safe to run again.

---

## Notes on behaviour

- **Idempotent setup.** Existing roles/channels are matched by name (ignoring emoji and separators) and reused. Re-running after a failure only creates what's missing.
- **Crash-safe giveaways.** Everything is in SQLite. If the bot restarts mid-giveaway it resumes on boot and immediately resolves anything that expired while it was down.
- **Toggle entries.** Pressing **Enter** again removes the entry.
- **Role requirements are enforced on entry**, not just displayed — and `@everyone` or bot roles picked by mistake are dropped with a note rather than silently locking everyone out.
- **Nothing is written before it can be posted.** The bot checks it has View/Send/Embed permission in the target channel first, so a failed post never leaves an orphaned giveaway in the database.
- **Weighted draws.** Bonus entries are real weight in the draw, and winners are always distinct.
- **Partial failure is survivable.** One channel failing (rate limit, hitting the 500-channel cap) doesn't abort the run; `/setup` reports exactly what failed and why.

---

## Project layout

```
src/
  index.js               bot entry point
  deploy-commands.js     slash command registration
  config/
    blueprint.js         ★ the entire server definition
    constants.js         branding, colours, XP tuning
  commands/              setup, giveaway, rank, leaderboard, patreon, rewards, help
  events/                ready, interactionCreate, messageCreate, guildMemberAdd
  lib/
    setup-engine.js      blueprint → real Discord server
    giveaway-panel.js    the /giveaway create modal (+ legacy fallback)
    giveaway-create.js   validation & publishing, shared by every entry point
    drafts.js            short-lived drafts for the fallback flow
    giveaways.js         lifecycle, draws, rerolls
    levels.js            XP, level curve, reward roles
    store.js             SQLite persistence + schema migrations
    db.js                driver shim: node:sqlite, or better-sqlite3 if present
    embeds.js            every embed
    permissions.js       overwrite resolution + safe merging
  preview/               the local preview site
scripts/
  doctor.js              pre-flight check for Node, .env, driver and token
tests/
  setup.test.js          23 tests against a mocked Discord API
  giveaway.test.js       26 tests for the panel, validation and entry gating
  mock-discord.js
```

## Tests

```bash
npm test
```

49 tests, no token required. `setup.test.js` runs the real setup engine against an in-memory fake of the Discord API and asserts the resulting server tree: naming format, category contents, the funder gate, idempotency, panel posting, partial-failure recovery, buff stacking, the level curve and weighted draws. `giveaway.test.js` covers the creation panel: field layout, that the role field really is a role picker, every validation rule, `@everyone`/bot-role filtering, embed rendering, database round-trips and who is allowed to enter.

---

## Troubleshooting

Run **`npm run doctor`** first — it checks your Node version, dependencies, `.env`, database driver and token, and names the exact problem.

| Problem | Fix |
|---|---|
| A slash command says "The application did not respond" | The bot is not running or crashed at login — check the `npm start` window. Usually the **Privileged Gateway Intents** (Server Members, Message Content) are off: Developer Portal → Bot → enable both → Save Changes. `npm run doctor` checks this. |
| "DISCORD_TOKEN is not set" but you did set it | `npm run doctor` — it finds the real cause (`.env.txt`, UTF-16 encoding, value on the wrong line, still commented out) and repairs most of them automatically. |
| `npm install` fails with `node-gyp` errors | You're on Node < 22.5. Upgrade to Node 22 LTS, delete `node_modules`, install again. |
| Commands don't appear | Run `npm run deploy`. Set `GUILD_ID` in `.env` for instant registration; global takes up to an hour. |
| "Missing Permissions" during setup | Drag the bot's role to the top of **Server Settings → Roles**. |
| Reward roles aren't granted | Same thing — the bot's role must sit **above** the roles it assigns. |
| No XP being earned | Enable **Message Content Intent** in the Developer Portal. |
| Channels look like `🎁-\|-general` | You picked the `|` separator. Re-run `/setup separator:` and choose the bar `│`. |
| Setup stopped partway | Just run `/setup` again — it resumes and only creates what's missing. |
| The panel won't open | Only 💰 Giveaway Funder, Giveaway Manager and admins can open it. Check the role. |
| Role picker missing in the panel | Very old Discord clients can't render it; the bot automatically falls back to a text-only form plus a role dropdown afterwards. Updating the app restores the one-popup flow. |
