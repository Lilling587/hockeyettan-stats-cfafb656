#!/usr/bin/env node
/**
 * Hämtar officiella kortnamn för Hockeyettan Södra från stats.swehockey.se
 * och uppdaterar src/lib/team-short-names.ts.
 *
 * Cache: .cache/team-short-names.json (sparas alltid, används som fallback
 * om nätverket inte svarar).
 *
 * Användning:
 *   node scripts/update-team-short-names.mjs
 *   node scripts/update-team-short-names.mjs --competition=18271
 *   node scripts/update-team-short-names.mjs --force   (ignorera cache-TTL)
 */
import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "team-short-names.json");
const OUTPUT_FILE = path.join(ROOT, "src/lib/team-short-names.ts");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const competitionId = args.get("competition") ?? "18271";
const force = args.get("force") === "true";

const URL = `https://stats.swehockey.se/Teams/Statistics/ScoringAndGoalkeeping/${competitionId}`;

async function loadCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCache(payload) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

/** Parsar legend-blocket: "BRS\n\n- Borås HC" → { "Borås HC": "BRS" } */
function parseShortNames(html) {
  // Plocka bort taggar men behåll radbrytningar
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    .replace(/<\/(p|div|td|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#246;/g, "ö")
    .replace(/&#228;/g, "ä")
    .replace(/&#229;/g, "å");

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const map = {};
  // Regex: rad med endast versaler (2-5 tecken inkl ÅÄÖ) följt av en rad
  // som börjar med "-" eller "–" och själva lagnamnet.
  const codeRe = /^[A-ZÅÄÖ]{2,5}$/;
  for (let i = 0; i < lines.length - 1; i++) {
    if (!codeRe.test(lines[i])) continue;
    const next = lines[i + 1];
    const m = next.match(/^[-–]\s*(.+)$/);
    if (!m) continue;
    const name = m[1].trim();
    // Sanity: lagnamn bör innehålla en bokstav och vara > 2 tecken
    if (name.length < 3) continue;
    map[name] = lines[i];
  }
  return map;
}

function renderFile(shortNames, meta) {
  const entries = Object.entries(shortNames).sort(([a], [b]) =>
    a.localeCompare(b, "sv"),
  );
  const lines = entries.map(([name, code]) => `  ${JSON.stringify(name)}: ${JSON.stringify(code)},`);
  return `// AUTOGENERERAD — kör \`node scripts/update-team-short-names.mjs\` för att uppdatera.
// Källa: ${URL}
// Senast hämtad: ${meta.fetchedAt}
const SHORT_NAMES: Record<string, string> = {
${lines.join("\n")}
};

export function shortTeamName(name: string): string {
  if (SHORT_NAMES[name]) return SHORT_NAMES[name];
  const trimmed = name.trim();
  if (SHORT_NAMES[trimmed]) return SHORT_NAMES[trimmed];
  const upper = trimmed.replace(/[^A-ZÅÄÖ]/g, "");
  if (upper.length >= 2 && upper.length <= 5) return upper;
  return trimmed.slice(0, 4).toUpperCase();
}

export const KNOWN_TEAM_NAMES: ReadonlySet<string> = new Set(
  Object.keys(SHORT_NAMES),
);
`;
}

async function main() {
  const cache = await loadCache();
  const fresh =
    cache &&
    !force &&
    cache.competitionId === competitionId &&
    Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_TTL_MS;

  let shortNames;
  let fetchedAt;

  if (fresh) {
    console.log(`✓ Cache färsk (< 24h), använder ${CACHE_FILE}`);
    shortNames = cache.shortNames;
    fetchedAt = cache.fetchedAt;
  } else {
    console.log(`→ Hämtar ${URL}`);
    try {
      const res = await fetch(URL, {
        headers: { "user-agent": "lovable-team-short-names/1.0" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      shortNames = parseShortNames(html);
      if (Object.keys(shortNames).length < 5) {
        throw new Error(
          `Hittade endast ${Object.keys(shortNames).length} kortnamn — parser sannolikt trasig`,
        );
      }
      fetchedAt = new Date().toISOString();
      await saveCache({ competitionId, fetchedAt, shortNames });
      console.log(`✓ Sparade cache (${Object.keys(shortNames).length} lag)`);
    } catch (err) {
      console.error(`✗ Hämtning misslyckades: ${err.message}`);
      if (!cache) {
        console.error("  Ingen cache att falla tillbaka på. Avbryter.");
        process.exit(1);
      }
      console.warn("  Använder befintlig cache som fallback.");
      shortNames = cache.shortNames;
      fetchedAt = cache.fetchedAt;
    }
  }

  const out = renderFile(shortNames, { fetchedAt });
  await writeFile(OUTPUT_FILE, out, "utf8");
  console.log(`✓ Skrev ${path.relative(ROOT, OUTPUT_FILE)} (${Object.keys(shortNames).length} lag)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
