/**
 * Telegram (primary) and Discord webhook (secondary). Both respect rate limits:
 * ≈1 msg/s per chat, and on HTTP 429 wait `retry_after` seconds then retry.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ChannelError extends Error {
  constructor(public channel: string, message: string, public permanent = false) {
    super(`${channel}: ${message}`);
  }
}

// ── Telegram ────────────────────────────────────────────────────────────────
export const telegramConfigured = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

let lastTelegramSend = 0;
const TELEGRAM_GAP_MS = 1100;

export async function telegramApi<T = any>(method: string, body?: unknown, token = process.env.TELEGRAM_BOT_TOKEN): Promise<T> {
  if (!token) throw new ChannelError("telegram", "TELEGRAM_BOT_TOKEN not set", true);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return data.result as T;
    if (res.status === 429) {
      const wait = Number(data?.parameters?.retry_after ?? 5);
      await sleep(Math.min(wait, 60) * 1000 + 250);
      continue;
    }
    if (res.status >= 500) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    // 400/401/403: bad token, bad chat id, bot blocked — retrying won't help
    throw new ChannelError("telegram", `${res.status} ${data?.description ?? "request failed"}`, true);
  }
  throw new ChannelError("telegram", "gave up after retries");
}

export async function sendTelegram(msg: { text: string; reply_markup?: unknown }, chatId = process.env.TELEGRAM_CHAT_ID): Promise<void> {
  const wait = lastTelegramSend + TELEGRAM_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastTelegramSend = Date.now();
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: msg.text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: msg.reply_markup,
  });
}

// ── Discord ─────────────────────────────────────────────────────────────────
export const discordConfigured = () => !!process.env.DISCORD_WEBHOOK_URL;

export async function sendDiscord(payload: unknown, url = process.env.DISCORD_WEBHOOK_URL): Promise<void> {
  if (!url) throw new ChannelError("discord", "DISCORD_WEBHOOK_URL not set", true);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "RadarX", ...(payload as object) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      await sleep(600); // webhooks allow ~5 req / 2 s
      return;
    }
    if (res.status === 429) {
      const data: any = await res.json().catch(() => ({}));
      await sleep(Math.min(Number(data.retry_after ?? 2), 60) * 1000 + 250);
      continue;
    }
    if (res.status >= 500) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    throw new ChannelError("discord", `${res.status} ${await res.text().catch(() => "")}`.slice(0, 200), true);
  }
  throw new ChannelError("discord", "gave up after retries");
}
