// Known HockeyEttan Södra seasons on stats.swehockey.se.
// To add a new season (e.g. 2026-27), find the competition page URL on
// stats.swehockey.se for that season and add a new entry at the TOP of this
// array. The first entry is treated as the current/default season.
//
// Example URL: https://stats.swehockey.se/ScheduleAndResults/Standings/18271
// -> competitionId = "18271", label = "2025-26".

export type Season = {
  label: string; // e.g. "2025-26"
  competitionId: string; // swehockey competition ID
};

export const SEASONS: Season[] = [
  { label: "2026-27", competitionId: "21044" },
  { label: "2025-26", competitionId: "18271" },
];

export const DEFAULT_SEASON = SEASONS[0];

export function getSeason(label?: string | null): Season {
  if (!label) return DEFAULT_SEASON;
  return SEASONS.find((s) => s.label === label) ?? DEFAULT_SEASON;
}
