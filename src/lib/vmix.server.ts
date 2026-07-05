// Server-only helpers for the vMix broadcast integration.
// Scrapes a team roster from swehockey and packs it into the slot-based
// VmixLineupSlots shape the vMix GT Designer graphic expects.

import type { Season } from "./seasons.config";
import {
  emptySlots,
  type VmixLineupSlots,
  type SlotPlayer,
} from "./vmix.functions";

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
): Promise<VmixLineupSlots> {
  const url = `${STATS_BASE_URL}/Teams/Info/TeamRoster/${season.competitionId}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
  const html = await res.text();

  const escapedName = teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRe = new RegExp(
    `<h[1-6][^>]*>\\s*(?:<[^>]+>\\s*)*${escapedName}\\s*(?:<[^>]+>\\s*)*<\\/h[1-6]>`,
    "i",
  );
  const startMatch = headingRe.exec(html);
  let block: string;
  if (startMatch) {
    const startIdx = startMatch.index;
    const rest = html.slice(startIdx + startMatch[0].length);
    const nextHeading = rest.search(/<h[1-6][^>]*>/i);
    block = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  } else {
    const anchorRe = new RegExp(
      `${escapedName}[\\s\\S]{0,20000}?<\\/table>`,
      "i",
    );
    const m = anchorRe.exec(html);
    if (!m) return emptySlots(teamName, "");
    block = m[0];
  }

  const goalies: RawPlayer[] = [];
  const leftDefense: RawPlayer[] = [];
  const rightDefense: RawPlayer[] = [];
  const leftWings: RawPlayer[] = [];
  const centers: RawPlayer[] = [];
  const rightWings: RawPlayer[] = [];
  const otherForwards: RawPlayer[] = [];

  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((rm = rowRe.exec(block)) !== null) {
    const cells = extractTds(rm[1]);
    if (cells.length < 2) continue;

    let number: number | string = "";
    let name = "";
    let position: string | null = null;

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

    // Scan ALL cells for a known hockey position code rather than relying
    // on a fixed column index. The swehockey.se table can have extra columns
    // (nationality flag image, birthdate, handedness L/R) at varying positions
    // depending on the page and season, making a fixed index unreliable.
    // Position codes GK/MV/LD/RD/LW/CE/RW cannot appear in any other column
    // (names have spaces/commas, dates have dashes, numbers are digits-only,
    // nationality codes like SWE/FIN/CAN don't overlap with position codes).
    const knownPositionPat = /^(GK|MV|LD|RD|LW|CE|RW)$/i;
    position = cells.find((c) => knownPositionPat.test(c.trim())) ?? null;

    if (!name || name.length < 2) continue;
    if (/^(nr|name|namn|pos|position|player|spelare)$/i.test(name)) continue;

    const key = `${number}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const formatted = toLastnameFirstname(name);
    const player: RawPlayer = {
      number,
      name: formatted,
      position: position ? position.trim() : null,
    };
    if (isGoalie(position)) {
      goalies.push(player);
    } else if (isLeftDefense(position)) {
      leftDefense.push(player);
    } else if (isRightDefense(position)) {
      rightDefense.push(player);
    } else if (isGenericDefense(position)) {
      // Generic defense code (D, B, etc.) – split evenly between LD and RD
      if (leftDefense.length <= rightDefense.length) leftDefense.push(player);
      else rightDefense.push(player);
    } else if (isLeftWing(position)) {
      leftWings.push(player);
    } else if (isCenter(position)) {
      centers.push(player);
    } else if (isRightWing(position)) {
      rightWings.push(player);
    } else {
      // Unknown position – treat as forward, fill remaining slots later
      otherForwards.push(player);
    }
  }

 const slots = emptySlots(teamName, "");

  // Goalies → GK1, GK2
  goalies.slice(0, 2).forEach((p, i) => {
    slots[`GK${i + 1}` as keyof VmixLineupSlots] =
      { name: p.name, number: p.number } as SlotPlayer as never;
  });

  // Left defensemen → LD1..LD5 (in roster order)
  leftDefense.slice(0, 5).forEach((p, i) => {
    slots[`LD${i + 1}` as keyof VmixLineupSlots] =
      { name: p.name, number: p.number } as SlotPlayer as never;
  });

  // Right defensemen → RD1..RD5 (in roster order)
  rightDefense.slice(0, 5).forEach((p, i) => {
    slots[`RD${i + 1}` as keyof VmixLineupSlots] =
      { name: p.name, number: p.number } as SlotPlayer as never;
  });

  // Left wings → LW1..LW5 (in roster order)
  leftWings.slice(0, 5).forEach((p, i) => {
    slots[`LW${i + 1}` as keyof VmixLineupSlots] =
      { name: p.name, number: p.number } as SlotPlayer as never;
  });

  // Centers → C1..C5 (in roster order)
  centers.slice(0, 5).forEach((p, i) => {
    slots[`C${i + 1}` as keyof VmixLineupSlots] =
      { name: p.name, number: p.number } as SlotPlayer as never;
  });

  // Right wings → RW1..RW5 (in roster order)
  rightWings.slice(0, 5).forEach((p, i) => {
    slots[`RW${i + 1}` as keyof VmixLineupSlots] =
      { name: p.name, number: p.number } as SlotPlayer as never;
  });

  // Unknown-position forwards → fill any remaining empty forward slots
  // scanning left-to-right, top-to-bottom (LW1, C1, RW1, LW2, C2, RW2, ...)
  const fwdSlotOrder = (["LW", "C", "RW"] as const).flatMap((col) =>
    [1, 2, 3, 4, 5].map((row) => `${col}${row}` as keyof VmixLineupSlots),
  );
  // Sort so we fill row-by-row: LW1,C1,RW1, LW2,C2,RW2, ...
  const fwdByRow = [1, 2, 3, 4, 5].flatMap((row) =>
    (["LW", "C", "RW"] as const).map(
      (col) => `${col}${row}` as keyof VmixLineupSlots,
    ),
  );
  void fwdSlotOrder; // keep the column-order array around for reference
  let fwdIdx = 0;
  for (const key of fwdByRow) {
    if (fwdIdx >= otherForwards.length) break;
    if (!slots[key]) {
      const p = otherForwards[fwdIdx++];
      slots[key] = { name: p.name, number: p.number } as SlotPlayer as never;
    }
  }

  return slots;
}
