# 🎁 OPB Giveaways

A Discord bot that builds your whole server with one command, then runs the giveaways, Patreon tiers and chat rewards on top of it.

`/setup` creates **19 roles**, **7 categories** and **31 channels** — every channel named in `emoji │ channel` format — and posts the rules, FAQ, Patreon and chat-rewards embeds automatically.

---

## Quick start

```bash
npm install
cp .env.example .env      # add your DISCORD_TOKEN + CLIENT_ID
npm run deploy            # register the slash commands
npm start                 # run the bot
```

Then in Discord: **`/setup`**

> Want to see the whole server layout before running anything?
> `npm run preview` → <http://localhost:3000>

---

## Creating the bot (5 minutes)

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**, name it `OPB Giveaways`.
2. **Bot** tab → **Reset Token** → copy it into `DISCORD_TOKEN` in `.env`.
3. Still on the **Bot** tab, enable these **Privileged Gateway Intents**:
   - ✅ **Server Members Intent** — needed for auto-roles and welcome messages
   - ✅ **Message Content Intent** — needed for chat XP
4. **General Information** → copy the **Application ID** into `CLIENT_ID`.
5. **OAuth2 → URL Generator** → scopes `bot` + `applications.commands`, permission **Administrator**, then open the generated URL and invite the bot.
6. ⚠️ **Server Settings → Roles** → drag the **OPB Giveaways** role to the very top. Discord will not let a bot manage roles above its own.

---

## Commands

| Command | Who | What it does |
|---|---|---|
| `/setup` | Admin | Builds every role, category and channel, then posts all info panels |
| `/setup preview:true` | Admin | Shows the full plan **without creating anything** |
| `/setup separator:` | Admin | Pick the name style: `🎁│general`, `🎁｜general`, `🎁-general`, `🎁\|general` |
| `/giveaway create` | 💰 Funder | Start a giveaway (prize, duration, winners, patron-only…) |
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

### The funder gate

`🛠️│create-giveaway` is **invisible** to everyone who doesn't hold **💰 Giveaway Funder**. It's enforced twice — once with channel permissions, and again in code, so even a leaked link or a stray `/giveaway create` elsewhere is rejected with a clear message.

Give the role to anyone who pays for prizes:
**Server Settings → Members → pick user → add 💰 Giveaway Funder**

---

## Patreon tiers

| Tier | Price | Entries | XP |
|---|---|---|---|
| 💗 Patron | $3/mo | +1 | 1.1× |
| 💖 Patron + | $5/mo | +2 | 1.25× |
| 💝 Patron ++ | $10/mo | +3 | 1.5× |
| 💜 Patron +++ | $25/mo | +5 | 1.75× |
| 👑 Patron ++++ | $50/mo | +8 | 2× |

Grant with `/patreon grant user:@someone tier:...` — it clears any existing tier first, so nobody ends up holding two. Prices and perks live in `src/config/blueprint.js` (`PATRON_TIERS`); edit them there and every embed updates itself.

Using the official Patreon–Discord integration instead? Just point each Patreon tier at the matching role and skip `/patreon grant`.

## Chat rewards

Members earn **15–25 XP** per message, once a minute. Info, staff and giveaway channels are excluded so nobody can farm.

| Role | Unlocks at | Entries | XP | Extra |
|---|---|---|---|---|
| 🗨️ Chat Lvl 5 | level 5 | +1 | 1.05× | Embed links, external emoji |
| 💬 Chat Lvl 10 | level 10 | +2 | 1.1× | Attach files |
| 🔊 Chat Lvl 25 | level 25 | +3 | 1.2× | Threads + soundboard |
| 🔥 Chat Lvl 50 | level 50 | +5 | 1.35× | Hoisted in member list |
| 🌟 Chat Lvl 100 | level 100 | +8 | 1.5× | Change own nickname |

Roles are granted **automatically** on level-up and announced in `🎊│level-ups`.

### How buffs stack

Base **1 entry** + your highest Patron tier + your highest Chat Level role → **up to 17 entries**. XP multipliers multiply (up to **3×**). `/rank` shows a member their exact numbers.

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
    giveaways.js         lifecycle, draws, rerolls
    levels.js            XP, level curve, reward roles
    store.js             SQLite persistence
    embeds.js            every embed
    permissions.js       overwrite resolution + safe merging
  preview/               the local preview site
tests/
  setup.test.js          23 tests against a mocked Discord API
  mock-discord.js
```

## Tests

```bash
npm test
```

23 tests run the real setup engine against an in-memory fake of the Discord API and assert the resulting server tree: naming format, category contents, the funder gate, idempotency, panel posting, partial-failure recovery, buff stacking, the level curve and weighted draws.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Commands don't appear | Run `npm run deploy`. Set `GUILD_ID` in `.env` for instant registration; global takes up to an hour. |
| "Missing Permissions" during setup | Drag the bot's role to the top of **Server Settings → Roles**. |
| Reward roles aren't granted | Same thing — the bot's role must sit **above** the roles it assigns. |
| No XP being earned | Enable **Message Content Intent** in the Developer Portal. |
| Channels look like `🎁-\|-general` | You picked the `|` separator. Re-run `/setup separator:` and choose the bar `│`. |
| Setup stopped partway | Just run `/setup` again — it resumes and only creates what's missing. |
