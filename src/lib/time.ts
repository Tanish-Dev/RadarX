/** "just now" / "12 min ago" / "3 h ago" / "2 d ago" */
export function ago(ts: number | null | undefined, now = Date.now()): string {
  if (ts == null) return "unknown";
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Compact form for chips and rings: "12m", "3h", "2d". */
export function agoShort(ts: number | null | undefined, now = Date.now()): string {
  if (ts == null) return "–";
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
