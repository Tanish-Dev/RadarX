/**
 * Rule-based classification — fast, deterministic, testable.
 * Bump CLASSIFIER_VERSION whenever rules change; the worker then reclassifies every stored job.
 */
import { extractSkills } from "./skills";

export const CLASSIFIER_VERSION = 4;

export type Level = "intern" | "newgrad" | "research" | "experienced";
export type Region = "india" | "remote" | "global";

export interface Classification {
  is_tech: boolean;
  level: Level;
  region: Region;
  skills: string[];
  /** skills found in the title (weighted higher when scoring) */
  titleSkills: string[];
  domain: Domain | null;
}

export type Domain = "ai" | "software" | "data" | "hardware" | "quant" | "security" | "design";

// ── is_tech ─────────────────────────────────────────────────────────────────
// Broad on purpose. Non-tech wins only when no strong tech signal is present,
// except for roles that are non-tech even with a techy word ("sales engineer", "technical recruiter").
const ALWAYS_NON_TECH =
  /\b(sales engineer|presales|pre-sales|technical recruit\w*|tech recruit\w*|recruit\w*|talent acquisition|sourcer|account (executive|manager|director)|customer success|customer support|support specialist|business development|bdr|sdr|paralegal|counsel|attorney|lawyer|legal|payroll|accountant|accounting|bookkeep\w*|tax (manager|analyst|associate)|audit(or)?|human resources|\bhr\b|people partner|people operations|office manager|executive assistant|administrative|receptionist|facilities|janitor|custodian|delivery driver|truck driver|warehouse|cashier|retail|store (manager|associate)|barista|chef|cook|nurse|physician|pharmac\w*|marketing|brand|copywriter|content writer|social media|public relations|communications (manager|specialist)|event(s)? (manager|coordinator)|procurement|purchasing|buyer|merchandis\w*|real estate|leasing|insurance agent|underwriter|claims)\b/i;

const TECH =
  /\b(software|developer|programmer|engineer(ing)?|sde|swe|sdet|devops|sre|site reliability|machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|llm|nlp|computer vision|data (scien\w*|engineer\w*|analy\w*|platform|infrastructure)|analytics|research (scientist|engineer|intern|fellow|assistant)|scientist|backend|back-end|frontend|front-end|full[- ]?stack|web|mobile|ios|android|cloud|platform|infrastructure|security|infosec|information security|cyber|appsec|formal methods|formal verification|research (and|&) development|r&d|embedded|firmware|hardware|asic|fpga|vlsi|silicon|rtl|verification|dft|physical design|chip|semiconductor|robotic\w*|autonomy|perception|quant\w*|algorithmic|trading (intern|engineer|developer)|systems|network(ing)? engineer|database|dba|qa engineer|test engineer|automation|blockchain|game (developer|programmer)|graphics|compiler|kernel|ux|ui|product design\w*|interaction design\w*|it support|technical)\b/i;

/** Engineering disciplines that aren't what this app is for. */
const NON_SOFTWARE_ENGINEERING =
  /\b(civil|structural|construction|hvac|plumbing|mechanical design|chemical|process engineer|manufacturing engineer|quality engineer|field service|maintenance|environmental|geotechnical|petroleum|mining|sales)\b/i;

const STRONG_TECH = /\b(software|machine learning|\bml\b|\bai\b|data scien\w*|developer|sde|swe|full[- ]?stack|backend|frontend|firmware|embedded|fpga|asic|quant\w*|security engineer)\b/i;

export function isTech(title: string): boolean {
  if (ALWAYS_NON_TECH.test(title) && !/\b(software|machine learning|data scien\w*)\b/i.test(title)) return false;
  if (!TECH.test(title)) return false;
  if (NON_SOFTWARE_ENGINEERING.test(title) && !STRONG_TECH.test(title)) return false;
  return true;
}

// ── level ───────────────────────────────────────────────────────────────────
const SENIOR = /\b(senior|sr\.?|staff|principal|lead|manager|director|head of|vp|vice president|architect|distinguished|fellow\b(?! ?ship)|expert|ii|iii|iv|level [3-9]|l[4-9]|e[4-9])\b/i;
const STRONG_SENIOR = /\b(senior|sr\.?|staff|principal|lead|manager|director|head of|vp|vice president|architect|distinguished)\b/i;
const EXPLICIT_NEWGRAD = /\b(new grad\w*|new college grad\w*|university grad\w*|early[- ]career|entry[- ]level|campus)\b/i;
const RESEARCH = /\b(research (intern|fellow|assistant|associate|internship)|student researcher|phd (intern|resident|residency)|ai resident|residency|research scholar|\bra\b|visiting researcher|summer research)\b/i;
const INTERN = /\b(intern|interns|internship|co-?op|trainee|apprentice\w*|summer (analyst|associate|student|engineer|program)|industrial placement|placement year|working student|werkstudent|stagiaire)\b/i;
const NEWGRAD =
  /\b(new grad\w*|graduate (engineer|software|developer|program\w*|scheme|analyst|trainee|role)|grad(uate)? 20\d\d|university (grad\w*|hire|program)|campus|early[- ]career|entry[- ]level|fresher|freshers|junior|jr\.?|associate (software|engineer|developer|data)|engineer i\b|developer i\b|scientist i\b|analyst i\b|engineer 1\b|level 1|0-[12] years?|0 ?- ?2 yrs)\b/i;
const NEWGRAD_DESC = /\b(0\s*[-–to]+\s*[12]\+? years|new grad(uate)?s?|recent graduates?|graduating in 20\d\d|class of 20\d\d)\b/i;

export function classifyLevel(title: string, description = "", hint?: Level): Level {
  if (RESEARCH.test(title)) return "research";
  if (INTERN.test(title)) return /\bresearch\b/i.test(title) ? "research" : "intern";
  // "Staff Engineer I" is not entry level, but "New Grad, Senior Team" still is
  if (STRONG_SENIOR.test(title) && !EXPLICIT_NEWGRAD.test(title)) return "experienced";
  if (NEWGRAD.test(title)) return "newgrad";
  if (SENIOR.test(title)) return "experienced";
  if (hint) return hint;
  if (NEWGRAD_DESC.test(description.slice(0, 6000))) return "newgrad";
  return "experienced";
}

// ── region ──────────────────────────────────────────────────────────────────
const INDIA =
  /\b(india|bharat|bengaluru|bangalore|hyderabad|pune|mumbai|bombay|delhi|new delhi|ncr|gurgaon|gurugram|noida|chennai|madras|kolkata|calcutta|ahmedabad|gandhinagar|jaipur|kochi|cochin|trivandrum|thiruvananthapuram|coimbatore|indore|chandigarh|mohali|mysore|mysuru|mangalore|mangaluru|bhubaneswar|nagpur|vadodara|surat|lucknow|goa|visakhapatnam|vizag|kanpur|bhopal|nashik|guwahati|karnataka|maharashtra|telangana|tamil nadu|kerala|haryana|uttar pradesh|gujarat|west bengal)\b/i; // not ", IN" — that's also Indiana
const REMOTE = /\b(remote|anywhere|work from home|wfh|distributed|virtual)\b/i;

const COUNTRY =
  "(?:us|usa|u\\.s\\.?|united states|america|north america|canada|uk|united kingdom|england|ireland|germany|france|spain|portugal|italy|netherlands|poland|romania|europe|eu|emea|latam|brazil|mexico|argentina|australia|new zealand|japan|singapore|israel|uae|switzerland|sweden|apac|[a-z]{2}\\b(?=\\s*(?:only|$|\\)|/)))";
/** "Remote in USA", "Remote - Canada", "Virtual US", "US Remote", "Remote (UK)" → country-locked remote */
const COUNTRY_LOCKED_REMOTE = new RegExp(
  `\\b(?:remote|virtual)\\b[\\s,:(\\-–]*(?:in\\s+|only\\s+)?${COUNTRY}|\\b${COUNTRY}[\\s,(\\-–]*(?:-\\s*)?(?:remote|virtual)\\b`,
  "i",
);

export function classifyRegion(location: string): Region {
  if (INDIA.test(location)) return "india"; // \bindia\b never matches "Indiana"
  if (!REMOTE.test(location)) return "global";
  // a remote role locked to another country isn't open from India → treat as abroad,
  // unless some other part of the location is plain "Remote" / "Anywhere"
  const parts = location.split(/\s*[\/;|]\s*/);
  const openRemote = parts.some((p) => REMOTE.test(p) && !COUNTRY_LOCKED_REMOTE.test(p));
  return openRemote ? "remote" : "global";
}

// ── domain (for filter pills) ───────────────────────────────────────────────
export function classifyDomain(title: string, skills: string[]): Domain | null {
  const t = title.toLowerCase();
  if (/\b(quant\w*|trading|trader|market making)\b/.test(t)) return "quant";
  if (/\b(machine learning|\bml\b|\bai\b|deep learning|llm|nlp|computer vision|perception|applied scientist|research scientist|generative)\b/.test(t)) return "ai";
  if (/\b(security|cyber|appsec|penetration)\b/.test(t)) return "security";
  if (/\b(hardware|asic|fpga|vlsi|silicon|rtl|verification|dft|embedded|firmware|chip|circuit|robotic\w*|physical design)\b/.test(t)) return "hardware";
  if (/\b(data (scien\w*|engineer\w*|analy\w*)|analytics|business intelligence|bi )\b/.test(t)) return "data";
  if (/\b(ux|ui|product design\w*|interaction design\w*|visual design\w*)\b/.test(t)) return "design";
  if (/\b(software|developer|engineer|sde|swe|backend|frontend|full[- ]?stack|mobile|ios|android|devops|sre|cloud|platform)\b/.test(t)) return "software";
  if (skills.some((s) => ["Machine learning", "Deep learning", "LLMs", "PyTorch"].includes(s))) return "ai";
  return null;
}

export function classify(
  job: { title: string; description: string; location: string },
  hint?: Level,
): Classification {
  const titleSkills = extractSkills(job.title);
  const skills = [...new Set([...titleSkills, ...extractSkills(job.description)])];
  return {
    is_tech: isTech(job.title),
    level: classifyLevel(job.title, job.description, hint),
    region: classifyRegion(job.location),
    skills,
    titleSkills,
    domain: classifyDomain(job.title, skills),
  };
}
