// AUTOGENERERAD — kör `node scripts/update-team-short-names.mjs` för att uppdatera.
// Källa: https://stats.swehockey.se/Teams/Statistics/ScoringAndGoalkeeping/21044
// Senast hämtad: 2026-08-07T19:30:10.293Z
const SHORT_NAMES: Record<string, string> = {
  "Boro/Vetlanda HC": "BVE",
  "Borås HC": "BOR",
  "Grums IK": "GRU",
  "Grästorps IK": "GRÄ",
  "Halmstad Hammers HC": "HHHC",
  "Hanvikens SK": "HAN",
  "HC Dalen": "DAL",
  "HC Vita Hästen": "VIT",
  "Huddinge IK": "HUD",
  "IF Troja-Ljungby": "TLJ",
  "Karlskrona HK": "KAR",
  "Kungälvs IK": "KUN",
  "Mariestad BoIS HC": "MAR",
  "Mjölby HC": "MHC",
  "Mörrums GoIS IK": "MÖR",
  "Nyköpings SK": "NSK",
  "Tingsryds AIF": "TAIF",
  "Tranås AIF": "TRA",
  "Tyringe SoSS": "TYR",
  "Västerviks IK": "VÄS",
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
