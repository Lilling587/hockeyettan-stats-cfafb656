// Server-only helpers for the vMix broadcast integration.
// Scrapes a team roster from swehockey and packs it into the slot-based
// VmixLineupSlots shape the vMix GT Designer graphic expects.

import type { Season } from "./seasons.config";
import type { RosterPlayer } from "./vmix.functions";

const STATS_BASE_URL = "https://stats.swehockey.se";

type RawPlayer = {
  number: number | string;
  name: string;
  position: string | null;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&aring;/g, "å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Aring;/g, "Å")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTds(row: string): string[] {
  const cells: string[] = [];
  const re = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(row)) !== null) cells.push(stripTags(m[1]));
  return cells;
}

/** LASTNAME, FIRSTNAME in uppercase. If already comma-formatted, keep. */
function toLastnameFirstname(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.includes(",")) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  return `${parts.slice(1).join(" ")}, ${parts[0]}`;
}

function isGoalie(pos: string | null): boolean {
  const p = (pos ?? "").toUpperCase().trim();
  return /^(G|GK|MV|GOALIE|MÅLVAKT|GOALKEEPER)$/i.test(p);
}

function isLeftDefense(pos: string | null): boolean {
  return (pos ?? "").toUpperCase().trim() === "LD";
}

function isRightDefense(pos: string | null): boolean {
  return (pos ?? "").toUpperCase().trim() === "RD";
}

function isGenericDefense(pos: string | null): boolean {
  const p = (pos ?? "").toUpperCase().trim();
  return /^(D|B|BACK|DEF|DEFENSE|DEFENCE|DEFENSEMAN)$/.test(p);
}

function isLeftWing(pos: string | null): boolean {
  return (pos ?? "").toUpperCase().trim() === "LW";
}

function isCenter(pos: string | null): boolean {
  const p = (pos ?? "").toUpperCase().trim();
  return p === "CE" || p === "C";
}

function isRightWing(pos: string | null): boolean {
  return (pos ?? "").toUpperCase().trim() === "RW";
}

export async function scrapeTeamRoster(
  teamName: string,
  season: Season,
): Promise<RosterPlayer[]> {
  const url = `${STATS_BASE_URL}/Teams/Info/TeamRoster/${season.competitionId}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
  const html = await res.text();

  // Locate the HTML block that belongs to this team.
  // Strategy: find a heading (<h1>–<h6>) containing the team name, then
  // grab everything from that heading to the next heading. If no heading
  // matches, try a looser anchor-based search (the page uses <a id="CODE">
  // fragments near team sections). Never fall back to matching the team
  // name in arbitrary data cells — that picks up Youth Club columns from
  // wrong teams.
  const escapedName = teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Primary: exact heading match
  const headingRe = new RegExp(
    `<h[1-6][^>]*>\\s*(?:<[^>]+>\\s*)*${escapedName}\\s*(?:<[^>]+>\\s*)*<\\/h[1-6]>`,
    "i",
  );
  let startMatch = headingRe.exec(html);

  // Secondary: team name in bold inside a table cell with colspan (some
  // competitions use <td colspan="..." class="tdTeamHeader"><b>Team</b></td>
  // instead of a proper heading tag).
  if (!startMatch) {
    const boldHeaderRe = new RegExp(
      `<td[^>]*>\\s*(?:<[^>]+>\\s*)*<b[^>]*>\\s*${escapedName}\\s*<\\/b>`,
      "i",
    );
    startMatch = boldHeaderRe.exec(html);
  }

  if (!startMatch) return [];

  const startIdx = startMatch.index;
  const rest = html.slice(startIdx + startMatch[0].length);
  // The next team section starts at the next heading or the next bold
  // team header. Use whichever comes first.
  const nextHeading = rest.search(/<h[1-6][^>]*>/i);
  const nextBoldHeader = rest.search(/<td[^>]*>\s*(?:<[^>]+>\s*)*<b[^>]*>/i);
  let endIdx = -1;
  if (nextHeading >= 0 && nextBoldHeader >= 0) {
    endIdx = Math.min(nextHeading, nextBoldHeader);
  } else if (nextHeading >= 0) {
    endIdx = nextHeading;
  } else if (nextBoldHeader >= 0) {
    endIdx = nextBoldHeader;
  }
  const block = endIdx === -1 ? rest : rest.slice(0, endIdx);

  // Parse every <tr> in the team block and collect player rows.
  const players: RosterPlayer[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const seen = new Set<string>();
  let rm: RegExpExecArray | null;

  while ((rm = rowRe.exec(block)) !== null) {
    const cells = extractTds(rm[1]);
    if (cells.length < 2) continue;

    let number: number | string = "";
    let name = "";

    // Determine if the first cell is a jersey number (1–99, max 3 chars).
    const firstNum = Number(cells[0].replace(/\D/g, ""));
    if (
      Number.isFinite(firstNum) &&
      firstNum > 0 &&
      firstNum < 100 &&
      cells[0].trim().length <= 3
    ) {
      number = firstNum;
      name = cells[1];
    } else {
      name = cells[0];
    }

    if (!name || name.length < 2) continue;
    if (/^(nr|name|namn|pos|position|player|spelare|avg\.?|genomsnitt|snitt|total)$/i.test(name)) continue;
    // Skip summary rows (averages at the bottom of the roster table).
    // These show up as rows with purely numeric "names" like "22.6".
    if (/^\d+([.,]\d+)?$/.test(name.trim())) continue;
    // Skip rows with too few meaningful cells — a real player row has
    // at minimum a name and usually number, position, birthdate, etc.
    // Summary/separator rows typically have ≤3 non-empty cells.
    const filledCells = cells.filter((c) => c.trim().length > 0).length;
    if (filledCells < 4) continue;

    // Deduplicate by number+name combination.
    const key = `${number}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Detect position by scanning all cells for a known hockey position code.
    // More robust than relying on a fixed column index since the table can
    // have extra columns (birthdate, nationality flag, handedness) at varying
    // positions depending on the page and season.
    const knownPositionPat = /^(GK|MV|LD|RD|LW|CE|RW)$/i;
    const position =
      cells.find((c) => knownPositionPat.test(c.trim())) ?? null;

    players.push({
      number,
      name: toLastnameFirstname(name),
      position: position ? position.trim().toUpperCase() : null,
    });
  }

  // Sort the pool: GK first, then LD, RD, LW, CE, RW, unknowns last.
  // Within each position group, sort by jersey number ascending.
  const positionOrder = (pos: string | null): number => {
    switch ((pos ?? "").toUpperCase()) {
      case "GK": case "MV": return 0;
      case "LD": return 1;
      case "RD": return 2;
      case "LW": return 3;
      case "CE": return 4;
      case "RW": return 5;
      default: return 6;
    }
  };

  return players.sort((a, b) => {
    const po = positionOrder(a.position) - positionOrder(b.position);
    if (po !== 0) return po;
    return Number(a.number) - Number(b.number);
  });
}
