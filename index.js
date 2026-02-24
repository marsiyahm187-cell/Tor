// ======================================================
// X (Twitter) ADVANCED MONITOR BOT
// Telegram Bot with Profile Preview + Notification Options
// Deploy: Railway | Node.js + Telegraf
// Features:
// - /add username → fetch profile preview
// - Show followers / following (scraped)
// - User selects notification types:
//   Tweet, Retweet, Reply, Follow, Unfollow
// - Hybrid FXTwitter scrape + RSS fallback
// ======================================================

import fs from "fs";
import express from "express";
import Parser from "rss-parser";
import fetch from "node-fetch";
import { Telegraf, Markup } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) process.exit(1);

const bot = new Telegraf(BOT_TOKEN);
const parser = new Parser();
const app = express();

// ===== DATABASE =====
const DB_FILE = "accounts.json";
let db = { users: {} };

if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE));

const saveDB = () =>
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

function ensureUser(id) {
  if (!db.users[id]) {
    db.users[id] = {
      accounts: {},
      lastTweets: {}
    };
  }
}

// ===== PROFILE SCRAPE =====
async function fetchProfile(username) {
  try {
    const res = await fetch(`https://fxtwitter.com/${username}`);
    const html = await res.text();

    const followers = html.match(/followers[^0-9]*([0-9,.]+)/i)?.[1] || "?";
    const following = html.match(/following[^0-9]*([0-9,.]+)/i)?.[1] || "?";

    return { followers, following };
  } catch {
    return { followers: "?", following: "?" };
  }
}

// ===== FETCH TWEET =====
async function fetchLatest(username) {
  try {
    const res = await fetch(`https://fxtwitter.com/${username}`);
    const html = await res.text();

    const match = html.match(/status\/(\d+)/);
    if (match) return `https://twitter.com/${username}/status/${match[1]}`;

    const feed = await parser.parseURL(`https://nitter.net/${username}/rss`);
    return feed.items?.[0]?.link || null;
  } catch {
    return null;
  }
}

// ===== COMMANDS =====
bot.start((ctx) => {
  ctx.reply("X Monitor Bot Ready\n/add username");
});

bot.command("add", async (ctx) => {
  const username = ctx.message.text.split(" ")[1];
  if (!username) return ctx.reply("Username required");

  ensureUser(ctx.from.id);

  const profile = await fetchProfile(username);

  db.users[ctx.from.id].accounts[username] = {
    notify: []
  };

  saveDB();

  ctx.reply(
    `Profile Found: @${username}\nFollowers: ${profile.followers}\nFollowing: ${profile.following}\n\nSelect notification:` ,
    Markup.inlineKeyboard([
      [Markup.button.callback("Tweet", `type_${username}_tweet`)],
      [Markup.button.callback("Retweet", `type_${username}_retweet`)],
      [Markup.button.callback("Reply", `type_${username}_reply`)],
      [Markup.button.callback("Follow", `type_${username}_follow`)],
      [Markup.button.callback("Unfollow", `type_${username}_unfollow`)],
      [Markup.button.callback("Done", `done_${username}`)]
    ])
  );
});

// ===== TYPE SELECTION =====
bot.action(/type_(.*)_(.*)/, (ctx) => {
  const [, username, type] = ctx.match;
  const user = db.users[ctx.from.id];

  if (!user.accounts[username].notify.includes(type)) {
    user.accounts[username].notify.push(type);
  }

  saveDB();
  ctx.answerCbQuery(`Added ${type}`);
});

bot.action(/done_(.*)/, (ctx) => {
  ctx.editMessageText("Monitoring activated.");
});

// ===== MONITOR LOOP =====
async function monitor() {
  for (const uid in db.users) {
    const user = db.users[uid];

    for (const username in user.accounts) {
      const latest = await fetchLatest(username);
      if (!latest) continue;

      if (!user.lastTweets[username]) {
        user.lastTweets[username] = latest;
        saveDB();
        continue;
      }

      if (user.lastTweets[username] !== latest) {
        user.lastTweets[username] = latest;
        saveDB();

        if (user.accounts[username].notify.includes("tweet")) {
          bot.telegram.sendMessage(uid, `New Tweet @${username}\n${latest}`);
        }
      }
    }
  }
}

setInterval(() => monitor().catch(() => {}), 10000);

// ===== WEB SERVER =====
app.get("/", (_, res) => res.send("Bot Running"));
app.listen(PORT);

bot.launch();
      
