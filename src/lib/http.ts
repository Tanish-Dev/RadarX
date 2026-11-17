export const USER_AGENT =
  "RadarX/0.1 (personal job-alert bot; polls public job board APIs politely)";

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
  }
}

export interface FetchOpts {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** Don't retry these statuses (e.g. 404 during discovery). */
  noRetryOn?: number[];
}

export interface FetchResult<T> {
  status: number;
  data: T | null; // null on 304
  headers: Headers;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with a 20s timeout, polite UA and exponential backoff on 429/5xx/network errors.
 * 4xx (except 429) are thrown immediately.
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<FetchResult<T>> {
  const { method = "GET", body, headers = {}, timeoutMs = 20_000, retries = 2 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 304) return { status: 304, data: null, headers: res.headers };
      if (res.ok) {
        const text = await res.text();
        return { status: res.status, data: JSON.parse(text) as T, headers: res.headers };
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || opts.noRetryOn?.includes(res.status)) throw new HttpError(res.status, url);
      lastErr = new HttpError(res.status, url);
      const ra = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 500 * 2 ** attempt);
    } catch (e) {
      if (e instanceof HttpError && !(e.status === 429 || e.status >= 500)) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchText(url: string, opts: Omit<FetchOpts, "body" | "method"> = {}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*", ...opts.headers },
      redirect: "follow",
    });
    if (!res.ok) throw new HttpError(res.status, url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
