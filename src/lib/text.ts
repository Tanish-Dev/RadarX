const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+[0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML (possibly entity-escaped, as Greenhouse sends it) → plain text with line breaks. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = html;
  // Greenhouse double-escapes: decode once if it looks escaped
  if (/&lt;[a-z/]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(s)
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** "Jane Street Capital" → "jane-street-capital" */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Candidate ATS slugs derived from a company name. */
export function slugCandidates(name: string): string[] {
  const base = name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|technologies|technology|labs?|ai|group|holdings|plc|co)\b\.?/g, "")
    .trim();
  const words = base.split(/[^a-z0-9]+/).filter(Boolean);
  const full = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const set = new Set<string>([
    words.join(""),
    words.join("-"),
    full.join(""),
    full.join("-"),
    // a lone first word ("safe", "tiger") matches unrelated boards, so only for one-word names
    words.length === 1 ? words[0] : "",
    full.join("") + "hq",
  ]);
  return [...set].filter((s) => s.length >= 2);
}

/** Truncate long descriptions before storing. */
export function clip(s: string, n = 20_000): string {
  return s.length > n ? s.slice(0, n) : s;
}
