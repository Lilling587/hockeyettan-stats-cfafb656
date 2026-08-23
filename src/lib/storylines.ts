import type { Briefing } from "@/lib/stats.functions";
import type { TeamData } from "@/lib/dashboard-utils";
import {
  currentStreak,
  daysSinceLast,
  parseGameDate,
  lastFivePpg,
  strongestPeriod,
  teamPpg,
  venueWinRate,
} from "@/lib/dashboard-utils";


export type Storyline = {
  id: string;
  priority: number;
  text: string;
};

export const MAX_STORYLINES = 6;

function num(v: number, decimals = 1): string {
  return v.toFixed(decimals).replace(".", ",");
}

function streakWord(type: string, count: number): string | null {
  if (count < 3) return null;
  if (type === "W") return `har vunnit ${count} raka matcher`;
  if (type === "L") return `har förlorat ${count} raka matcher`;
  return null;
}

function bestGoalie(team: TeamData) {
  return (team.goalies ?? [])
    .filter((g) => g.savePct != null)
    .sort((a, b) => (b.savePct ?? 0) - (a.savePct ?? 0))[0];
}

function recordFromResults(results: readonly string[]) {
  let w = 0;
  let l = 0;
  for (const r of results) {
    if (r === "W" || r === "OTW") w++;
    else if (r === "L" || r === "OTL") l++;
  }
  return { w, l, played: results.length };
}

/**
 * En match räknas som spelad först när den har ett riktigt resultat och
 * datumet inte ligger i framtiden. Kommande möten ska inte bli snackisar.
 */
export function isPlayedMeeting(
  m: { date: string; score: string },
  now: Date = new Date(),
): boolean {
  const score = (m.score ?? "").trim();
  if (!/^\d+\s*[-–:]\s*\d+/.test(score)) return false;
  return !isFutureDate(m.date, now);
}

function isFutureDate(date: string | null | undefined, now: Date): boolean {
  const d = date ? parseGameDate(date) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  const endOfDay = new Date(d);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime() > now.getTime();
}

/**
 * Samma speldatumsregel för lagens matchlistor: resultatet måste vara känt
 * (inte "?") och datumet får inte ligga i framtiden.
 */
export function isPlayedGame(
  g: { date: string; score: string; result: string },
  now: Date = new Date(),
): boolean {
  if (!g.result || g.result === "?") return false;
  return !isFutureDate(g.date, now);
}

/**
 * Ett gemensamt datumfilter för hela briefingen. Alla snackisar byggs på den
 * filtrerade kopian, så ingen textrad kan råka blanda in kommande matcher.
 */
export function filterBriefingToPlayed(b: Briefing, now: Date = new Date()): Briefing {
  const filterTeam = (t: TeamData): TeamData => ({
    ...t,
    lastFive: (t.lastFive ?? []).filter((g) => isPlayedGame(g, now)),
  });
  return {
    ...b,
    home: filterTeam(b.home),
    away: filterTeam(b.away),
    headToHead: b.headToHead.filter((m) => isPlayedMeeting(m, now)),
  };
}

/**
 * Deterministiska snackisar till kommentatorerna, härledda ur data som redan
 * finns i briefingen. Sorterade efter prioritet — lägre siffra = viktigare.
 */
export function buildStorylines(b: Briefing, now: Date = new Date()): Storyline[] {
  const out: Storyline[] = [];
  const filtered = filterBriefingToPlayed(b, now);
  const home = filtered.home;
  const away = filtered.away;


  // 1. Sviter
  for (const [team, side] of [
    [home, "home"],
    [away, "away"],
  ] as const) {
    const s = currentStreak(team.lastFive ?? []);
    if (!s) continue;
    const phrase = streakWord(s.type, s.count);
    if (phrase) {
      out.push({
        id: `streak-${side}`,
        priority: 1,
        text: `${team.name} ${phrase}.`,
      });
    }
  }

  // 2. Formkontrast senaste fem
  const homePpg = lastFivePpg(home);
  const awayPpg = lastFivePpg(away);
  if (homePpg != null && awayPpg != null && Math.abs(homePpg - awayPpg) >= 0.8) {
    const leader = homePpg > awayPpg ? home : away;
    const trailer = leader === home ? away : home;
    const leaderPpg = Math.max(homePpg, awayPpg);
    const trailerPpg = Math.min(homePpg, awayPpg);
    const trend = (t: TeamData, five: number) => {
      const season = teamPpg(t);
      if (season == null) return "";
      const d = five - season;
      if (Math.abs(d) < 0.3) return " (i nivå med säsongssnittet)";
      return d > 0
        ? ` (${num(d)} mer än säsongssnittet ${num(season)})`
        : ` (${num(-d)} under säsongssnittet ${num(season)})`;
    };
    out.push({
      id: "form-contrast",
      priority: 2,
      text: `Senaste fem: ${leader.name} tar ${num(leaderPpg)} poäng per match${trend(leader, leaderPpg)}, ${trailer.name} ${num(trailerPpg)}${trend(trailer, trailerPpg)}.`,
    });
  }


  // 3. Tabellavstånd
  if (
    home.position != null &&
    away.position != null &&
    home.points != null &&
    away.points != null
  ) {
    const posGap = Math.abs(home.position - away.position);
    const ptsGap = Math.abs(home.points - away.points);
    if (posGap >= 3) {
      const leader = home.position < away.position ? home : away;
      const chaser = leader === home ? away : home;
      out.push({
        id: "table-gap",
        priority: 3,
        text: `${leader.name} ligger på plats ${leader.position} och ${chaser.name} på plats ${chaser.position} — ${ptsGap} poäng skiljer lagen.`,
      });
    }
  }

  // 4. Special teams
  const ppDiff =
    home.powerPlayPct != null && away.powerPlayPct != null
      ? home.powerPlayPct - away.powerPlayPct
      : null;
  const pkDiff =
    home.penaltyKillPct != null && away.penaltyKillPct != null
      ? home.penaltyKillPct - away.penaltyKillPct
      : null;
  const biggest =
    ppDiff != null && (pkDiff == null || Math.abs(ppDiff) >= Math.abs(pkDiff))
      ? { kind: "powerplay" as const, diff: ppDiff }
      : pkDiff != null
        ? { kind: "boxplay" as const, diff: pkDiff }
        : null;
  if (biggest && Math.abs(biggest.diff) >= 4) {
    const better = biggest.diff > 0 ? home : away;
    const other = better === home ? away : home;
    const pick = (t: TeamData) =>
      biggest.kind === "powerplay" ? (t.powerPlayPct ?? 0) : (t.penaltyKillPct ?? 0);
    const label = biggest.kind === "powerplay" ? "Powerplay" : "Boxplay";
    out.push({
      id: `special-${biggest.kind}`,
      priority: 4,
      text: `${label}: ${better.name} är klart vassare med ${num(pick(better))}% mot ${other.name}s ${num(pick(other))}%.`,
    });
  }


  // 5. Tekningar
  const homeFo = home.faceoffs?.teamFoPct ?? null;
  const awayFo = away.faceoffs?.teamFoPct ?? null;
  if (homeFo != null && awayFo != null && Math.abs(homeFo - awayFo) >= 3) {
    const better = homeFo > awayFo ? home : away;
    const topTaker = (better.faceoffs?.players ?? [])[0];
    const extra = topTaker
      ? ` ${topTaker.name} vinner ${num(topTaker.foPct)}% av sina tekningar.`
      : "";
    out.push({
      id: "faceoffs",
      priority: 5,
      text: `${better.name} leder tekningarna med ${num(better === home ? homeFo : awayFo)}% mot ${num(
        better === home ? awayFo : homeFo,
      )}%.${extra}`,
    });
  }

  // 6. Målvaktsform
  const hg = bestGoalie(home);
  const ag = bestGoalie(away);
  if (hg?.savePct != null && ag?.savePct != null) {
    const diff = Math.abs(hg.savePct - ag.savePct);
    if (diff >= 1.5) {
      const better = hg.savePct > ag.savePct ? { g: hg, t: home } : { g: ag, t: away };
      const other = better.t === home ? { g: ag, t: away } : { g: hg, t: home };
      out.push({
        id: "goalies",
        priority: 6,
        text: `Målvaktsduellen: ${better.g.name} (${better.t.name}) håller ${num(
          better.g.savePct ?? 0,
        )}% räddningsprocent mot ${other.g.name}s ${num(other.g.savePct ?? 0)}%.`,
      });
    }
  }

  // 7. Hemma-/bortaform
  const homeRate = venueWinRate(home.venueForm?.home);
  if (homeRate != null && home.venueForm?.home) {
    const rec = recordFromResults(home.venueForm.home.results);
    if (rec.played >= 3 && (homeRate >= 0.66 || homeRate <= 0.34)) {
      out.push({
        id: "venue-home",
        priority: 7,
        text:
          homeRate >= 0.66
            ? `${home.name} är stabilt på hemmais: ${rec.w}-${rec.l} på ${rec.played} matcher i egen hall.`
            : `${home.name} har det tungt hemma: bara ${rec.w} vinster på ${rec.played} hemmamatcher.`,
      });
    }
  }
  const awayRate = venueWinRate(away.venueForm?.away);
  if (awayRate != null && away.venueForm?.away) {
    const rec = recordFromResults(away.venueForm.away.results);
    if (rec.played >= 3 && (awayRate >= 0.66 || awayRate <= 0.34)) {
      out.push({
        id: "venue-away",
        priority: 7,
        text:
          awayRate >= 0.66
            ? `${away.name} är en stark bortatrupp: ${rec.w}-${rec.l} på ${rec.played} matcher på bortais.`
            : `${away.name} har svårt på bortaplan: bara ${rec.w} vinster på ${rec.played} bortamatcher.`,
      });
    }
  }

  // 8. Vila
  const homeRest = daysSinceLast(home).days;
  const awayRest = daysSinceLast(away).days;
  if (homeRest != null && awayRest != null && Math.abs(homeRest - awayRest) >= 3) {
    const rested = homeRest > awayRest ? home : away;
    const tired = rested === home ? away : home;
    out.push({
      id: "rest",
      priority: 8,
      text: `${rested.name} har vilat ${Math.max(homeRest, awayRest)} dagar medan ${tired.name} spelade för ${Math.min(
        homeRest,
        awayRest,
      )} dagar sedan.`,
    });
  }

  // 9. Disciplin
  const hp = home.discipline?.perGame ?? null;
  const ap = away.discipline?.perGame ?? null;
  if (hp != null && ap != null && Math.abs(hp - ap) >= 3) {
    const worse = hp > ap ? home : away;
    const offender = worse.discipline?.topOffenders?.[0];
    const extra = offender ? ` Mest utvisad: ${offender.name} med ${offender.pim} minuter.` : "";
    out.push({
      id: "discipline",
      priority: 9,
      text: `${worse.name} sitter mer i båset — ${num(worse === home ? hp : ap)} utvisningsminuter per match mot ${num(
        worse === home ? ap : hp,
      )}.${extra}`,
    });
  }

  // 10. Inbördes möten denna säsong (endast spelade matcher)
  const played = filtered.headToHead;
  if (played.length > 0) {
    const last = played[played.length - 1];
    out.push({
      id: "h2h",
      priority: 10,
      text: `Lagen har mötts ${played.length} gång${
        played.length === 1 ? "" : "er"
      } denna säsong. Senast: ${last.homeTeam} ${last.score} ${last.awayTeam}${
        last.date ? ` (${last.date})` : ""
      }.`,
    });
  }

  // 11. Periodtendens
  for (const [team, side] of [
    [home, "home"],
    [away, "away"],
  ] as const) {
    const p = strongestPeriod(team);
    if (p && p.perGame >= 1) {
      out.push({
        id: `period-${side}`,
        priority: 11,
        text: `${team.name} är starkast i ${p.label} med ${num(p.perGame, 2)} mål per match i den perioden.`,
      });
    }
  }

  return out.sort((a, c) => a.priority - c.priority);
}

export function topStorylines(
  b: Briefing,
  limit = MAX_STORYLINES,
  now: Date = new Date(),
): Storyline[] {
  return buildStorylines(b, now).slice(0, limit);
}

export function storylinesToText(lines: Storyline[]): string {
  return lines.map((l) => `• ${l.text}`).join("\n");
}
