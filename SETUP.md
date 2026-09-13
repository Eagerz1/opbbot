# Getting OPB Giveaways running

Start to finish, about 10 minutes. Nothing here needs a paid service.

---

## 1. Install Node.js

You need **Node 22 or newer**.

- Download the **LTS** build from <https://nodejs.org> and install it.
- Confirm it worked — open a terminal (Windows: **PowerShell**, Mac: **Terminal**) and run:

```bash
node -v
```

You want `v22.x.x` or higher. If you see `v18` or `v20`, install the newer version first — the bot uses Node's built-in database, which older versions don't have.

> **Why it matters:** on Node 22+ there is nothing to compile. Older setups often fail at `npm install` with `node-gyp` errors about missing C++ build tools. This project avoids that entirely.

---

## 2. Get the code

```bash
git clone -b arena/01a09aab-opbbot https://github.com/Eagerz1/opbbot.git
cd opbbot
npm install
```

<details>
<summary>No Git installed? (click)</summary>

Download the ZIP instead:
<https://github.com/Eagerz1/opbbot/archive/refs/heads/arena/01a09aab-opbbot.zip>

Unzip it, then `cd` into the folder and run `npm install`.
</details>

---

## 3. Create the Discord bot

1. Go to <https://discord.com/developers/applications> and click **New Application**. Name it `OPB Giveaways`.

2. Open the **Bot** tab:
   - Click **Reset Token**, then **Copy**. This is your `DISCORD_TOKEN`.
     ⚠️ Treat it like a password. Anyone with it controls your bot. It is shown **once** — if you lose it, just reset it again.
   - Scroll to **Privileged Gateway Intents** and turn **ON**:
     - ✅ **Server Members Intent** — for auto-roles and welcome messages
     - ✅ **Message Content Intent** — for chat XP
   - Click **Save Changes**.

3. Open **General Information** and copy the **Application ID**. This is your `CLIENT_ID`.

4. Get your **server ID** (optional but recommended):
   In Discord: **User Settings → Advanced → Developer Mode ON**. Then right-click your server icon → **Copy Server ID**.

---

## 4. Fill in your `.env`

Copy the template:

```bash
cp .env.example .env          # Windows: copy .env.example .env
```

Open `.env` in any text editor and paste your values:

```ini
DISCORD_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4.GxYzAb.your-real-token-here
CLIENT_ID=1234567890123456789
GUILD_ID=9876543210987654321
```

- `GUILD_ID` is optional. **With** it, slash commands appear instantly in that one server. **Without** it, they register globally and can take up to an hour.
- `.env` is already in `.gitignore`, so your token will never be committed.

### Check everything before you start

```bash
npm run doctor
```

This verifies your Node version, dependencies, `.env` values, database driver, and asks Discord whether your token actually works:

```
OPB Giveaways — setup check

  ✓ Node v22.22.3
  ✓ discord.js 14.27.0
  ✓ SQLite driver: node:sqlite  (built in — nothing to compile)
  ✓ .env file found
  ✓ DISCORD_TOKEN present  MTIzND…hZWY
  ✓ CLIENT_ID present  1234567890123456789
  ✓ Token valid — logged in as OPB Giveaways  id 1234567890123456789

All good. Next: npm run deploy then npm start
```

---

## 5. Invite the bot to your server

On the Developer Portal: **OAuth2 → URL Generator**

- **Scopes:** `bot` and `applications.commands`
- **Bot Permissions:** `Administrator`

Copy the URL at the bottom, open it, pick your server, authorise.

> `Administrator` is the simple option because `/setup` creates roles and channels. If you'd rather be precise, the minimum is: Manage Roles, Manage Channels, View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Mention Everyone, Add Reactions, Manage Messages.

### ⚠️ The one step people miss

**Server Settings → Roles** → drag the **OPB Giveaways** role to the **very top** of the list.

Discord will not let a bot manage any role positioned above its own. Skip this and `/setup` still runs, but reward roles and patron tiers silently fail to be assigned.

---

## 6. Start it

```bash
npm run deploy    # registers the slash commands (run again only when commands change)
npm start         # starts the bot — leave this running
```

You should see:

```
INFO  Starting OPB Giveaways…
INFO  Loaded 7 commands: /giveaway /help /leaderboard /patreon /rank /rewards /setup
INFO  Loaded 4 event handlers
 OK   OPB Giveaways online as OPB Giveaways#1234
```

Then in Discord:

```
/setup
```

It builds 19 roles, 7 categories and 31 channels, and posts all the info panels. Takes about 30–60 seconds.

**Want to look before you leap?** `/setup preview:true` prints the full plan and creates nothing.

---

## 7. First things to do after setup

1. Give your prize sponsors the **💰 Giveaway Funder** role — that's what unlocks `🛠️│create-giveaway`.
2. Try it: `/giveaway create` → fill in the panel → pick a required role or leave it empty.
3. Link your Patreon tiers to the five **Patron** roles (or hand them out with `/patreon grant`).

---

## Keeping it running

`npm start` only runs while your terminal is open. For a bot that stays up:

**On your own machine / a VPS** — use [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start src/index.js --name opb-giveaways
pm2 save
pm2 startup          # follow the printed instruction to survive reboots
pm2 logs opb-giveaways
```

**Free/cheap hosting** that works well for Discord bots: [Railway](https://railway.app), [Fly.io](https://fly.io), [Bot-Hosting.net](https://bot-hosting.net). Set `DISCORD_TOKEN`, `CLIENT_ID` and `GUILD_ID` as environment variables in their dashboard instead of uploading `.env`.

⚠️ Whatever you use, keep the `data/` folder on a **persistent disk**. That's where giveaways and XP live — on a host with an ephemeral filesystem it's wiped on every redeploy.

---

## Updating later

```bash
git pull
npm install
npm run deploy     # only needed if commands changed
```

Your `.env` and `data/` are untouched by `git pull`.

---

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `npm install` fails with `node-gyp` / `MSBuild` errors | You're on Node < 22.5 so it's trying to compile the optional native database. Upgrade Node to 22 LTS and delete `node_modules`, then `npm install` again. |
| `DISCORD_TOKEN is missing` | No `.env`, or it's in the wrong folder. It must sit next to `package.json`. Run `npm run doctor`. |
| `An invalid token was provided` | Token is wrong or was reset. Reset it again in the Developer Portal and paste the new one. |
| Slash commands don't appear | Run `npm run deploy`. Set `GUILD_ID` for instant registration; global takes up to an hour. Fully quit and reopen Discord. |
| `Used disallowed intents` | You didn't enable **Server Members** + **Message Content** in the Bot tab. |
| `Missing Permissions` during `/setup` | The bot's role isn't at the top of **Server Settings → Roles**. |
| Reward roles never get assigned | Same cause — bot role must sit **above** the roles it hands out. |
| No XP is earned | **Message Content Intent** is off, or you're chatting in a channel excluded from XP (info, staff, giveaway channels). |
| Bot stops when I close the terminal | Expected. Use PM2 or a host — see *Keeping it running*. |
| Giveaways/XP reset after redeploy | The `data/` folder isn't persistent on your host. Attach a volume. |

Still stuck? Run `npm run doctor` — it names the exact problem in most cases.
