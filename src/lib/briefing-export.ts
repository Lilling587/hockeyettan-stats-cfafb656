import type { Briefing } from "./stats.functions";
import { storylinesToText, topStorylines } from "./storylines";


function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n as number)) return "—";
  return String(n);
}

function formStrip(team: Briefing["home"]): string {
  if (!team.lastFive?.length) return "—";
  return team.lastFive.map((g) => g.result).join(" ");
}

function topScorerLine(team: Briefing["home"]): string {
  const top = team.topScorers?.[0];
  if (!top) return "—";
  return `${top.name} (${fmtNum(top.goals)}+${fmtNum(top.assists)}=${fmtNum(top.points)})`;
}

function topGoalieLine(team: Briefing["home"]): string {
  const best = (team.goalies ?? [])
    .filter((g) => g.savePct != null)
    .sort((a, b) => (b.savePct ?? 0) - (a.savePct ?? 0))[0]
    ?? team.goalies?.[0];
  if (!best) return "—";
  return `${best.name} (SV% ${fmtPct(best.savePct)}, GAA ${fmtNum(best.gaa)})`;
}

/**
 * TV-grafikvänlig text — fasta etiketter, en kolumn per lag, lätt att klistra
 * in i en grafik-prompt eller manus.
 */
export function briefingToTvText(b: Briefing): string {
  const sections = (side: "home" | "away") => {
    const t = b[side];
    const label = side === "home" ? "HEMMA" : "BORTA";
    return [
      `── ${label}: ${t.name} ──`,
      `PLATS:        ${fmtNum(t.position)} (${fmtNum(t.points)} p på ${fmtNum(t.gamesPlayed)} m)`,
      `FORM (5):     ${formStrip(t)}`,
      `TOPPSCORER:   ${topScorerLine(t)}`,
      `MÅLVAKT:      ${topGoalieLine(t)}`,
      `PP%:          ${fmtPct(t.powerPlayPct)}`,
      `BOX%:         ${fmtPct(t.penaltyKillPct)}`,
      `PIM/match:    ${
        t.discipline ? t.discipline.perGame.toFixed(1) : "—"
      }`,
    ].join("\n");
  };

  const h2h = b.headToHead.length
    ? b.headToHead
        .slice(-3)
        .map((g) => `  ${g.date}  ${g.homeTeam} ${g.score} ${g.awayTeam}`)
        .join("\n")
    : "  (inga möten denna säsong)";

  return [
    `${b.home.name} vs ${b.away.name}`,
    b.league,
    "",
    sections("home"),
    "",
    sections("away"),
    "",
    "── INBÖRDES (senaste 3) ──",
    h2h,
    b.notes ? `\nNOTERA: ${b.notes}` : "",
  ].join("\n");
}

/**
 * Markdown-version av briefingen — lämplig för urklipp till Notion, Slack,
 * mail eller en docs-sida.
 */
export function briefingToMarkdown(b: Briefing): string {
  const teamBlock = (side: "home" | "away") => {
    const t = b[side];
    const sideLabel = side === "home" ? "Hemma" : "Borta";
    const scorers = (t.topScorers ?? [])
      .slice(0, 5)
      .map(
        (s, i) =>
          `${i + 1}. **${s.name}** — ${fmtNum(s.goals)}+${fmtNum(s.assists)}=${fmtNum(s.points)} (${fmtNum(s.gamesPlayed)} m)`,
      )
      .join("\n");
    const goalies = (t.goalies ?? [])
      .filter((g) => g.savePct != null)
      .sort((a, b) => (b.savePct ?? 0) - (a.savePct ?? 0))
      .slice(0, 3)
      .map(
        (g) =>
          `- ${g.name} — SV% ${fmtPct(g.savePct)}, GAA ${fmtNum(g.gaa)}, ${fmtNum(g.wins)}W/${fmtNum(g.losses)}L`,
      )
      .join("\n");

    return `### ${sideLabel}: ${t.name}

- Plats: **${fmtNum(t.position)}** · ${fmtNum(t.points)} p på ${fmtNum(t.gamesPlayed)} m
- Form (5 senaste): \`${formStrip(t)}\`
- PP%: ${fmtPct(t.powerPlayPct)} · Box%: ${fmtPct(t.penaltyKillPct)}
${t.discipline ? `- PIM/match: ${t.discipline.perGame.toFixed(1)}` : ""}

**Toppscorers**

${scorers || "_Inga noterade_"}

**Målvakter**

${goalies || "_Inga noterade_"}`;
  };

  const h2h = b.headToHead.length
    ? b.headToHead
        .map((g) => `- ${g.date} — ${g.homeTeam} **${g.score}** ${g.awayTeam}`)
        .join("\n")
    : "_Inga möten denna säsong._";

  return `# ${b.home.name} vs ${b.away.name}

_${b.league}_

${teamBlock("home")}

${teamBlock("away")}

## Inbördes möten

${h2h}
${b.notes ? `\n> ${b.notes}\n` : ""}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
