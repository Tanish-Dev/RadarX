/**
 * npm run telegram:setup
 * 1. Create a bot with @BotFather, put TELEGRAM_BOT_TOKEN in .env.local
 * 2. Send any message to your bot in Telegram
 * 3. Run this — it prints your chat ID (and sends a hello message to confirm)
 */
import "../src/worker/env";
import { telegramApi } from "../src/alerts/channels";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.log("TELEGRAM_BOT_TOKEN is not set.\n\n1. Open Telegram → @BotFather → /newbot\n2. Copy the token into .env.local:\n     TELEGRAM_BOT_TOKEN=123456:ABC...\n3. Send your bot any message, then run this again.");
  process.exit(1);
}

const me = await telegramApi<{ username: string }>("getMe");
console.log(`Bot: @${me.username}`);
const updates = await telegramApi<any[]>("getUpdates");
const chats = new Map<number, string>();
for (const u of updates) {
  const chat = (u.message ?? u.channel_post ?? u.my_chat_member)?.chat;
  if (chat) chats.set(chat.id, chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" ") ?? chat.username);
}
if (!chats.size) {
  console.log(`\nNo messages yet. Open https://t.me/${me.username}, press Start / send "hi", then run this again.`);
  process.exit(1);
}
for (const [id, name] of chats) console.log(`Chat: ${name}  →  TELEGRAM_CHAT_ID=${id}`);
const [firstId] = chats.keys();
await telegramApi("sendMessage", { chat_id: firstId, text: "✅ RadarX is connected. New postings will arrive here." });
console.log(`\nSent a confirmation message. Add this to .env.local:\n  TELEGRAM_CHAT_ID=${firstId}\nthen run: npm run alert:test`);
