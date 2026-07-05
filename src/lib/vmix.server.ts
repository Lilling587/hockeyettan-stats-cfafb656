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
      position = cells[2] ?? null;
    } else {
      name = cells[0];
      position = cells[1] ?? null;
    }

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
  const gkKeys = ["GK1", "GK2"] as const;
  goalies.slice(0, 2).forEach((p, i) => {
    slots[gkKeys[i]] = { name: p.name, number: p.number } as SlotPlayer;
  });

  // Defense → alternate LD/RD row by row (rows 1..5)
  for (let row = 0; row < 5; row++) {
    const ld = defense[row * 2];
    const rd = defense[row * 2 + 1];
    if (ld) slots[`LD${row + 1}` as keyof VmixLineupSlots] = { name: ld.name, number: ld.number } as SlotPlayer as never;
    if (rd) slots[`RD${row + 1}` as keyof VmixLineupSlots] = { name: rd.name, number: rd.number } as SlotPlayer as never;
  }

  // Forwards → LW/C/RW across each row (rows 1..5)
  for (let row = 0; row < 5; row++) {
    const lw = forwards[row * 3];
    const c = forwards[row * 3 + 1];
    const rw = forwards[row * 3 + 2];
    if (lw) slots[`LW${row + 1}` as keyof VmixLineupSlots] = { name: lw.name, number: lw.number } as SlotPlayer as never;
    if (c)  slots[`C${row + 1}` as keyof VmixLineupSlots]  = { name: c.name,  number: c.number  } as SlotPlayer as never;
    if (rw) slots[`RW${row + 1}` as keyof VmixLineupSlots] = { name: rw.name, number: rw.number } as SlotPlayer as never;
  }

  return slots;
}
