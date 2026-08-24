// AUTOGENERERAD — kör `node scripts/update-team-short-names.mjs` för att uppdatera.
//
// ⚠️ VIKTIGT: Detta script hämtar bara det AKTUELLA säsongens lag och
// SKRIVER ÖVER hela filen. Jämför alltid diffen manuellt mot legend-listan
// på https://stats.swehockey.se/Teams/Statistics/ScoringAndGoalkeeping/{id}
// innan commit — annars försvinner lag som bara spelade tidigare säsonger,
// och hotPlayer/backup-vMix för gamla matcher går sönder tyst.
//
// En klubbs kod kan även SKILJA sig mellan säsonger om seriesammansättningen
// ändras. Exempel: Borås HC var "BRS" 2025-26 men är "BOR" 2026-27.
// Karlskrona HK var "KHK" 2025-26 men är "KAR" 2026-27.
// Sådana skillnader hanteras i SEASON_CODE_OVERRIDES nedan — lägg ALDRIG
// bara in den gamla säsongens kod i huvudlistan (det bryter live vMix).
//
// Källa 2026-27 (komp. 21044), auto-scrapad: 2026-08-07T19:30:10.293Z
// Källa 2025-26 (komp. 18271), verifierad manuellt mot sidans legend: 2026-08-24
const SHORT_NAMES: Record<string, string> = {
  "Boro/Vetlanda HC": "BVE",
  "Borås HC": "BOR",
  "Grums IK": "GRU",
  "Grästorps IK": "GRÄ",
  "Halmstad Hammers HC": "HHHC",
  "Hanvikens SK": "HAN",
  "HC Dalen": "DAL",
  "HC Vita Hästen": "VIT",
  "Huddinge IK": "HDG",
  "IF Troja-Ljungby": "TRO",
  "Järfälla HC": "JÄR",
  "Karlskrona HK": "KAR",
  "Kungälvs IK": "KUN",
  "Mariestad BoIS HC": "MAR",
  "Mjölby HC": "MHC",
  "Mörrums GoIS IK": "MÖR",
  "Nyköpings SK": "NSK",
  "Tingsryds AIF": "TAIF",
  "Tranås AIF": "TRA",
  "Tyringe SoSS": "TYR",
  "Visby/Roma HK": "VIS",
  "Västerviks IK": "VÄS",
};

// Per-season overrides, keyed by swehockey competitionId, for teams whose
// short code differs from the base (current-season) map above. Used when
// parsing historical pages for a specific past season — NOT used for
// live/current vMix operations, which always want the base map's code.
const SEASON_CODE_OVERRIDES: Record<string, Record<string, string>> = {
  "18271": {
    // 2025-26 Hockeyettan Södra
    "Borås HC": "BRS",
    "Karlskrona HK": "KHK",
  },
};

/**
 * Returns a team's short code. Pass `competitionId` when parsing pages
 * belonging to a specific past season, so season-specific code overrides
 * apply (e.g. Borås HC's 2025-26 code "BRS" vs current "BOR"). Omit it for
 * live/current-season use (vMix admin, backup endpoints) — those should
 * always resolve to the base map's current code.
 */
export function shortTeamName(name: string, competitionId?: string): string {
  if (competitionId) {
    const override = SEASON_CODE_OVERRIDES[competitionId]?.[name];
    if (override) return override;
  }
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
