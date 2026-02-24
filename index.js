// =============================
// X (Twitter) Monitor Bot FULL
// Telegram Notification Bot
// Interval: 10 seconds realtime-ish
// Deploy: Railway
// Source: FXTwitter/Nitter RSS
// Features:
// - Add/remove monitored accounts
// - Telegram dashboard UI modern
// - User stats monitoring (total users, accounts tracked)
// - Public shareable bot ready
// =============================

import fs from "fs";
import express from "express";
import Parser from "rss-parser";
import { Telegraf, Markup } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN env");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const parser = new Parser();
const app = express();

const DB_FILE = "accounts.json";
let db = { users: {} };

// ===== LOAD DB =====
if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===== HELPERS =====
function ensureUser(id) {
  if (!db.users[id]) {
    db.users[id] = { accounts: [], lastTweets: {} };
  }
}

function getStats() {
  const totalUsers = Object.keys(db.users).length;
  let totalAccounts = 0;

  for (const u in db.users) {
    totalAccounts += db.users[u].accounts.length;
  }

  return { totalUsers, totalAccounts };
}

async function fetchTweets(username) {
  try {
    const feed = await parser.parseURL(
      `https://nitter.net/${username}/rss`
    );
    return feed.items.slice(0, 2);
  } catch {
    return [];
  }
}

// ===== TELEGRAM COMMANDS =====
bot.start((ctx) => {
  ctx.reply(
    "🚀 X Monitor Bot Ready\n\n/add username\n/remove username",
    Markup.inlineKeyboard([
      [Markup.button.callback("📊 Dashboard", "dashboard")],
      [Markup.button.callback("📈 Bot Stats", "stats")]
    ])
  );
});

bot.command("add", (ctx) => {
  const username = ctx.message.text.split(" ")[1];
  if (!username) return ctx.reply("Username required");

  ensureUser(ctx.from.id);

  if (!db.users[ctx.from.id].accounts.includes(username)) {
    db.users[ctx.from.id].accounts.push(username);
    saveDB();
  }

  ctx.reply(`✅ Added @${username}`);
});

bot.command("remove", (ctx) => {
  const username = ctx.message.text.split(" ")[1];
  if (!username) return ctx.reply("Username required");

  ensureUser(ctx.from.id);

  db.users[ctx.from.id].accounts = db.users[
    ctx.from.id
  ].accounts.filter((a) => a !== username);

  saveDB();

  ctx.reply(`❌ Removed @${username}`);
});

bot.action("dashboard", (ctx) => {
  ensureUser(ctx.from.id);

  const list =
    db.users[ctx.from.id].accounts.join("\n") || "No accounts yet";

  ctx.editMessageText(`📊 Monitoring List:\n\n${list}`);
});

bot.action("stats", (ctx) => {
  const s = getStats();

  ctx.editMessageText(
    `📈 Bot Public Stats\n\n👥 Users: ${s.totalUsers}\n🐦 Accounts tracked: ${s.totalAccounts}`
  );
});

// ===== MONITOR LOOP =====
async function monitor() {
  for (const uid in db.users) {
    const user = db.users[uid];

    for (const acc of user.accounts) {
      const tweets = await fetchTweets(acc);

      for (const t of tweets) {
        if (user.lastTweets[acc] === t.link) continue;

        user.lastTweets[acc] = t.link;
        saveDB();

        bot.telegram.sendMessage(
          uid,
          `🐦 @${acc}\n${t.title}\n${t.link}`
        );
      }
    }
  }
}

// ===== 10 SECOND INTERVAL =====
setInterval(monitor, 10000);

// ===== WEB UI HEALTH CHECK =====
app.get("/", (_, res) => {
  const s = getStats();

  res.send(`
    <h1>X Monitor Bot Running</h1>
    <p>Users: ${s.totalUsers}</p>
    <p>Accounts tracked: ${s.totalAccounts}</p>
  `);
});

app.listen(PORT, () => console.log("Web UI running"));

bot.launch();
