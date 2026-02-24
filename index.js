// ======================================================
// X (Twitter) REALTIME Monitor Bot PRO
// Railway Ready | Telegram Notification Bot
// Hybrid Monitor:
// 1. FXTwitter HTML scrape (realtime fast)
// 2. Nitter RSS fallback (backup)
// Interval: 10 seconds stable
// ======================================================

import fs from "fs";
import express from "express";
import Parser from "rss-parser";
import fetch from "node-fetch";
import { Telegraf, Markup } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("BOT TOKEN MISSING");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const parser = new Parser();
const app = express();

// ================= DATABASE =================
const DB_FILE = "accounts.json";
let db = { users: {} };

if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function ensureUser(id) {
  if (!db.users[id]) {
    db.users[id] = { accounts: [], lastTweets: {} };
  }
}

// ================= FETCH REALTIME FXTWITTER =================
async function fetchFXTwitter(username) {
  try {
    const res = await fetch(`https://fxtwitter.com/${username}`);
    const html = await res.text();

    const match = html.match(/status\/(\d+)/);
    if (!match) return null;

    return `https://twitter.com/${username}/status/${match[1]}`;
  } catch {
    return null;
  }
}

// ================= FALLBACK RSS =================
async function fetchRSS(username) {
  try {
    const feed = await parser.parseURL(
      `https://nitter.net/${username}/rss`
    );

    if (!feed.items.length) return null;
    return feed.items[0].link;
  } catch {
    return null;
  }
}

// ================= TELEGRAM COMMANDS =================
bot.start((ctx) => {
  ctx.reply(
    "🚀 Realtime X Monitor Ready\n\n/add username\n/remove username",
    Markup.inlineKeyboard([
      [Markup.button.callback("📊 Dashboard", "dashboard")]
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

  ctx.reply(`Tracking @${username}`);
});

bot.command("remove", (ctx) => {
  const username = ctx.message.text.split(" ")[1];
  if (!username) return ctx.reply("Username required");

  ensureUser(ctx.from.id);

  db.users[ctx.from.id].accounts = db.users[
    ctx.from.id
  ].accounts.filter((a) => a !== username);

  saveDB();

  ctx.reply(`Stopped tracking @${username}`);
});

bot.action("dashboard", (ctx) => {
  ensureUser(ctx.from.id);

  const list =
    db.users[ctx.from.id].accounts.join("\n") || "No accounts yet";

  ctx.editMessageText(`Monitoring:\n\n${list}`);
});

// ================= MONITOR =================
async function monitor() {
  for (const uid in db.users) {
    const user = db.users[uid];

    for (const acc of user.accounts) {
      let latest = await fetchFXTwitter(acc);

      if (!latest) latest = await fetchRSS(acc);
      if (!latest) continue;

      if (!user.lastTweets[acc]) {
        user.lastTweets[acc] = latest;
        saveDB();
        continue;
      }

      if (user.lastTweets[acc] !== latest) {
        user.lastTweets[acc] = latest;
        saveDB();

        bot.telegram.sendMessage(
          uid,
          `🐦 NEW TWEET @${acc}\n${latest}`
        );
      }
    }
  }
}

async function safeMonitor() {
  try {
    await monitor();
  } catch (err) {
    console.log("Monitor error:", err.message);
  }
}

setInterval(safeMonitor, 10000);

// ================= WEB =================
app.get("/", (_, res) => {
  res.send("Realtime X Monitor Running");
});

app.listen(PORT, () => console.log("Web UI running"));

bot.launch().then(() => console.log("Telegram Bot Started"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
    
