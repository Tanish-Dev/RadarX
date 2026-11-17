/**
 * Stock watchlist — companies whose hiring matters to RadarX's user. Quotes come from Twelve Data's
 * official API (free key, "free for a lifetime"; Stooq blocks bots in robots.txt and Yahoo's terms
 * forbid automated use, so neither is used). Indian IT is covered twice: US-listed ADRs (INFY, WIT —
 * on the free US plan) and NSE listings, which may need a paid plan; a failing symbol shows as such.
 */
export interface Stock {
  symbol: string;
  /** Twelve Data exchange code when not a US listing */
  exchange?: string;
  name: string;
  domain: string;
  group: "AI & chips" | "Big Tech" | "India";
}

export const WATCHLIST: Stock[] = [
  { symbol: "NVDA", name: "NVIDIA", domain: "nvidia.com", group: "AI & chips" },
  { symbol: "AMD", name: "AMD", domain: "amd.com", group: "AI & chips" },
  { symbol: "TSM", name: "TSMC", domain: "tsmc.com", group: "AI & chips" },
  { symbol: "AVGO", name: "Broadcom", domain: "broadcom.com", group: "AI & chips" },
  { symbol: "MSFT", name: "Microsoft", domain: "microsoft.com", group: "Big Tech" },
  { symbol: "GOOGL", name: "Alphabet", domain: "google.com", group: "Big Tech" },
  { symbol: "AAPL", name: "Apple", domain: "apple.com", group: "Big Tech" },
  { symbol: "AMZN", name: "Amazon", domain: "amazon.com", group: "Big Tech" },
  { symbol: "META", name: "Meta", domain: "meta.com", group: "Big Tech" },
  { symbol: "INFY", name: "Infosys (ADR)", domain: "infosys.com", group: "India" },
  { symbol: "WIT", name: "Wipro (ADR)", domain: "wipro.com", group: "India" },
  { symbol: "TCS", exchange: "NSE", name: "TCS", domain: "tcs.com", group: "India" },
  { symbol: "HCLTECH", exchange: "NSE", name: "HCLTech", domain: "hcltech.com", group: "India" },
  { symbol: "RELIANCE", exchange: "NSE", name: "Reliance", domain: "ril.com", group: "India" },
];

export const stockKey = (s: Pick<Stock, "symbol" | "exchange">) => (s.exchange ? `${s.symbol}:${s.exchange}` : s.symbol);
