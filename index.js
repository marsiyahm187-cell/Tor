import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import express from "express";

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const BEARER = process.env.X_BEARER_TOKEN;

let users = {}; // telegram_user_id -> monitored accounts

// ===== HELPER: GET USER DATA FROM X =====
async function getUserProfile(username) {
  try {
    const res = await axios.get(
      `https://api.x.com/2/users/by/username/${username}?user.fields=public_metrics`,
      {
        headers: {
          Authorization: `Bearer ${BEARER}`,
        },
      }
    );

    return res.data.data;
  } catch (err) {
    return null;
  }
}

// ===== HELPER: GET LATEST TWEETS =====
async function getLatestTweets(userId) {
  try {
    const res = await axios.get(
      `https://api.x.com/2/users/${userId}/tweets?max_results=5&tweet.fields=referenced_tweets,created_at`,
      {
        headers: {
          Authorization: `Bearer ${BEARER}`,
        },
      }
    );

    return res.data.data || [];
  } catch {
    return [];
  }
}

// ===== START COMMAND =====
bot.start((ctx) => {
  ctx.reply(
    "🚀 X Monitor Bot Ready\n\n/add username\n/remove username"
  );
});

// ===== ADD USER =====
bot.command("add", async (ctx) => {
  const username = ctx.message.text.split(" ")[1];
  if (!username) return ctx.reply("Masukkan username.");

  const profile = await getUserProfile(username);

  if (!profile) return ctx.reply("Username tidak ditemukan.");

  const followers = profile.public_metrics.followers_count;
  const following = profile.public_metrics.following_count;
  const tweets = profile.public_metrics.tweet_count;

  users[ctx.from.id] = {
    username,
    userId: profile.id,
    options: {},
    lastTweetId: null,
    lastFollowers: followers,
  };

  ctx.reply(
    `Profile found: @${username}
Followers: ${followers}
Following: ${following}
Tweets: ${tweets}

Select notification:`,
    Markup.keyboard([
      ["Tweet"],
      ["Retweet"],
      ["Reply"],
      ["Follow"],
      ["Unfollow"],
      ["Done"],
    ]).resize()
  );
});

// ===== OPTION HANDLER =====
bot.hears(
  ["Tweet", "Retweet", "Reply", "Follow", "Unfollow"],
  (ctx) => {
    const user = users[ctx.from.id];
    if (!user) return;

    user.options[ctx.message.text] = true;
    ctx.reply(`✅ ${ctx.message.text} enabled`);
  }
);

bot.hears("Done", (ctx) => {
  ctx.reply("✅ Monitoring started.");
});

// ===== REMOVE =====
bot.command("remove", (ctx) => {
  delete users[ctx.from.id];
  ctx.reply("❌ Monitoring removed.");
});

// ===== MONITOR LOOP (10 detik) =====
setInterval(async () => {
  for (let telegramId in users) {
    const data = users[telegramId];

    // CHECK TWEETS
    if (data.options["Tweet"] || data.options["Reply"] || data.options["Retweet"]) {
      const tweets = await getLatestTweets(data.userId);

      if (tweets.length > 0) {
        const latest = tweets[0];

        if (latest.id !== data.lastTweetId) {
          data.lastTweetId = latest.id;

          bot.telegram.sendMessage(
            telegramId,
            `🐦 New Activity from @${data.username}\n\n${latest.text}\n\nhttps://x.com/${data.username}/status/${latest.id}`
          );
        }
      }
    }

    // CHECK FOLLOWERS CHANGE
    if (data.options["Follow"] || data.options["Unfollow"]) {
      const profile = await getUserProfile(data.username);
      const newFollowers = profile.public_metrics.followers_count;

      if (newFollowers !== data.lastFollowers) {
        const diff = newFollowers - data.lastFollowers;
        data.lastFollowers = newFollowers;

        bot.telegram.sendMessage(
          telegramId,
          `👥 Follower change for @${data.username}\nChange: ${diff}\nNow: ${newFollowers}`
        );
      }
    }
  }
}, 10000);

// ===== WEB SERVER FOR RAILWAY =====
app.get("/", (req, res) => {
  res.send("Bot Running");
});

app.listen(process.env.PORT || 3000);

bot.launch();
