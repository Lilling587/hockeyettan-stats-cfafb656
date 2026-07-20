import { useEffect, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import {
  getLastMeetingRecap,
  type LastMeetingRecapResult,
} from "@/lib/stats.functions";
import { triggerPostgameEmailsNow } from "@/lib/notifications.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { todayInStockholm } from "@/lib/dashboard-utils";
import { lastMeetingOptions } from "./query-options";

export function PostgameRecapCard({
  home,
  away,
  onBackToBriefing,
}: {
  home: string;
  away: string;
  onBackToBriefing: () => void;
}) {
  const query = useSuspenseQuery(lastMeetingOptions(home, away));
  const queryClient = useQueryClient();
  const triggerPostgameEmails = useServerFn(triggerPostgameEmailsNow);
  const [forcing, setForcing] = useState(false);
  const [autoRefreshedAt, setAutoRefreshedAt] = useState<string | null>(null);
  const handleGameFinished = async () => {
    setForcing(true);
    try {
      const fresh = await getLastMeetingRecap({ data: { home, away, force: true } });
      queryClient.setQueryData(["lastMeeting", home, away], fresh);
      setAutoRefreshedAt(new Date().toISOString());
      try {
        const res = await triggerPostgameEmails();
        if (res.sent > 0) {
          toast.success(`Matchrapport skickad till ${res.sent} prenumeranter`);
        } else if (res.skipped > 0) {
          toast.info("Matchrapport redan skickad idag");
        }
      } catch {
        // Never let email failure block the UI refresh.
      }
    } finally {
      setForcing(false);
    }
  };
  const today = todayInStockholm();
  const recapData = query.data as LastMeetingRecapResult;
  const isTodaysGame = !!recapData && recapData.date === today;
  const initialSig = recapData
    ? `${recapData.homeGoals}-${recapData.awayGoals}-${recapData.goals.length}`
    : "";

  useEffect(() => {
    if (!isTodaysGame) return;
    let stable = 0;
    let attempts = 0;
    let last = initialSig;
    const tick = async () => {
      attempts += 1;
      try {
        const fresh = await getLastMeetingRecap({
          data: { home, away, force: true },
        });
        queryClient.setQueryData(["lastMeeting", home, away], fresh);
        setAutoRefreshedAt(new Date().toISOString());
        const sig = fresh
          ? `${fresh.homeGoals}-${fresh.awayGoals}-${fresh.goals.length}`
          : "";
        if (sig === last) stable += 1;
        else {
          stable = 0;
          last = sig;
        }
      } catch {
        /* retry next tick */
      }
      if (stable >= 2 || attempts >= 10) clearInterval(handle);
    };
    const handle = setInterval(tick, 3 * 60 * 1000);
    return () => clearInterval(handle);
  }, [isTodaysGame, initialSig, home, away, queryClient]);
  const recap = query.data as LastMeetingRecapResult;
  if (!recap) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Postgame
            </Badge>
            Match avslutad?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 gap-1 text-muted-foreground hover:text-foreground"
            onClick={onBackToBriefing}
          >
            <ChevronLeft className="h-4 w-4" />
            Tillbaka till briefing
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Tryck när matchen är slutspelad så hämtas en färsk recap med aktuell statistik.
            </p>
            <Button size="sm" onClick={handleGameFinished} disabled={forcing}>
              {forcing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Match avslutad – hämta recap
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  type Tally = { goals: number; assists: number; teamCode: string };
  const tally = new Map<string, Tally>();
  for (const goal of recap.goals) {
    const sc = tally.get(goal.scorer) ?? { goals: 0, assists: 0, teamCode: goal.teamCode };
    sc.goals += 1;
    sc.teamCode = goal.teamCode;
    tally.set(goal.scorer, sc);
    for (const a of goal.assists) {
      const ac = tally.get(a) ?? { goals: 0, assists: 0, teamCode: goal.teamCode };
      ac.assists += 1;
      ac.teamCode = goal.teamCode;
      tally.set(a, ac);
    }
  }
  const topScorers = [...tally.entries()]
    .map(([name, v]) => ({ name, ...v, points: v.goals + v.assists }))
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : b.goals - a.goals))
    .slice(0, 5);
  const hatTricks = [...tally.entries()]
    .filter(([, v]) => v.goals >= 3)
    .map(([name, v]) => ({ name, goals: v.goals, teamCode: v.teamCode }));

  const homeCode = (() => {
    const counts = new Map<string, number>();
    for (const g of recap.goals) counts.set(g.teamCode, (counts.get(g.teamCode) ?? 0) + 1);
    for (const [code, n] of counts) if (n === recap.homeGoals && code) return code;
    return null;
  })();
  const awayCode = (() => {
    const counts = new Map<string, number>();
    for (const g of recap.goals) counts.set(g.teamCode, (counts.get(g.teamCode) ?? 0) + 1);
    for (const [code, n] of counts) if (n === recap.awayGoals && code) return code;
    return null;
  })();

  const periodOrder = ["1", "2", "3", "OT", "SO"] as const;
  type PeriodKey = (typeof periodOrder)[number];
  const normalizePeriod = (p: string | null): PeriodKey | null => {
    if (!p) return null;
    const s = p.trim().toUpperCase();
    if (s.startsWith("1")) return "1";
    if (s.startsWith("2")) return "2";
    if (s.startsWith("3")) return "3";
    if (s.includes("OT") || s.includes("ÖVERTID") || s.includes("EXTRA")) return "OT";
    if (s.includes("SO") || s.includes("STRAFF")) return "SO";
    return null;
  };
  const periodScores = new Map<PeriodKey, { home: number; away: number }>();
  for (const p of ["1", "2", "3"] as PeriodKey[]) {
    periodScores.set(p, { home: 0, away: 0 });
  }
  if (recap.wentToOvertime) {
    periodScores.set("OT", { home: 0, away: 0 });
  }
  if (recap.wentToShootout) {
    periodScores.set("SO", { home: 0, away: 0 });
  }
  for (const g of recap.goals) {
    const k = normalizePeriod(g.period);
    if (!k) continue;
    const slot = periodScores.get(k) ?? { home: 0, away: 0 };
    if (homeCode && g.teamCode === homeCode) slot.home += 1;
    else slot.away += 1;
    periodScores.set(k, slot);
  }
  {
    let sumHome = 0;
    let sumAway = 0;
    for (const s of periodScores.values()) {
      sumHome += s.home;
      sumAway += s.away;
    }
    const extraHome = Math.max(0, recap.homeGoals - sumHome);
    const extraAway = Math.max(0, recap.awayGoals - sumAway);
    if (extraHome > 0 || extraAway > 0) {
      const targetKey: PeriodKey | null = recap.wentToShootout
        ? "SO"
        : recap.wentToOvertime
          ? "OT"
          : null;
      if (targetKey) {
        const slot = periodScores.get(targetKey) ?? { home: 0, away: 0 };
        slot.home += extraHome;
        slot.away += extraAway;
        periodScores.set(targetKey, slot);
      }
    }
  }
  const periodsPlayed = periodOrder.filter((p) => periodScores.has(p));

  const firstGoal = recap.goals[0] ?? null;
  let runningHome = 0;
  let runningAway = 0;
  let gwgIdx = -1;
  let gwgHome = 0;
  let gwgAway = 0;
  const finalWinnerIsHome = recap.homeGoals > recap.awayGoals;
  const finalWinnerIsAway = recap.awayGoals > recap.homeGoals;
  const losingTotal = finalWinnerIsHome
    ? recap.awayGoals
    : finalWinnerIsAway
      ? recap.homeGoals
      : -1;
  for (let i = 0; i < recap.goals.length; i++) {
    const g = recap.goals[i];
    if (homeCode && g.teamCode === homeCode) runningHome += 1;
    else runningAway += 1;
    if (finalWinnerIsHome && runningHome === losingTotal + 1 && gwgIdx === -1) {
      gwgIdx = i;
      gwgHome = runningHome;
      gwgAway = runningAway;
    }
    if (finalWinnerIsAway && runningAway === losingTotal + 1 && gwgIdx === -1) {
      gwgIdx = i;
      gwgHome = runningHome;
      gwgAway = runningAway;
    }
  }
  const gwg = gwgIdx >= 0 ? recap.goals[gwgIdx] : null;

  let leadChanges = 0;
  let lastLeader: "home" | "away" | "tie" = "tie";
  let largestLead = 0;
  let largestLeadLeader: "home" | "away" | null = null;
  let largestLeadGoal: (typeof recap.goals)[number] | null = null;
  let largestLeadHome = 0;
  let largestLeadAway = 0;
  runningHome = 0;
  runningAway = 0;
  for (const g of recap.goals) {
    if (homeCode && g.teamCode === homeCode) runningHome += 1;
    else runningAway += 1;
    const diff = runningHome - runningAway;
    if (Math.abs(diff) > largestLead) {
      largestLead = Math.abs(diff);
      largestLeadLeader = diff > 0 ? "home" : "away";
      largestLeadGoal = g;
      largestLeadHome = runningHome;
      largestLeadAway = runningAway;
    }
    const leader: "home" | "away" | "tie" =
      diff > 0 ? "home" : diff < 0 ? "away" : "tie";
    if (leader !== "tie" && lastLeader !== "tie" && leader !== lastLeader) {
      leadChanges += 1;
    }
    if (leader !== "tie") lastLeader = leader;
  }
  const largestLeadTeamCode =
    largestLeadLeader === "home" ? homeCode : largestLeadLeader === "away" ? awayCode : null;

  const formatTime = (t: string | null) => (t ? t.replace(/\s+/g, "") : "");

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            <Badge variant="default" className="text-[10px] uppercase tracking-wide">
              Senaste mötet
            </Badge>
            <span>Postgame-recap · {recap.date}</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              · uppdaterad {new Date(query.dataUpdatedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {isTodaysGame && (
              <span className="text-[10px] font-normal text-muted-foreground">
                {autoRefreshedAt
                  ? `· auto-uppdaterad ${new Date(autoRefreshedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`
                  : "· auto-uppdaterar var 3:e min"}
              </span>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={handleGameFinished} disabled={forcing}>
            {forcing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Match avslutad – uppdatera
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1 text-muted-foreground hover:text-foreground"
          onClick={onBackToBriefing}
        >
          <ChevronLeft className="h-4 w-4" />
          Tillbaka till briefing
        </Button>
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="text-base inline-flex items-baseline gap-4">
            <span className="font-medium">{recap.homeTeam}</span>
            <span className="font-mono text-xl tabular-nums">
              {recap.homeGoals} – {recap.awayGoals}
            </span>
            <span className="font-medium">{recap.awayTeam}</span>
          </div>
        </div>

        {(largestLead > 0 || leadChanges > 0 || recap.goals.length > 0) && (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-primary">
              Matchhöjdpunkter
            </div>
            <p className="leading-relaxed text-foreground">
              {(() => {
                const leaderName =
                  largestLeadLeader === "home" ? recap.homeTeam : recap.awayTeam;
                const parts: string[] = [];
                if (largestLead > 0) {
                  const when = largestLeadGoal
                    ? ` (P${normalizePeriod(largestLeadGoal.period) ?? "?"}${largestLeadGoal.time ? ` ${formatTime(largestLeadGoal.time)}` : ""})`
                    : "";
                  parts.push(
                    `${leaderName} ledde med som mest ${largestLead} mål (${largestLeadHome}–${largestLeadAway})${when}.`,
                  );
                }
                if (leadChanges === 0) {
                  if (lastLeader === "home") {
                    parts.push(`${recap.homeTeam} ledde matchen från start till mål.`);
                  } else if (lastLeader === "away") {
                    parts.push(`${recap.awayTeam} ledde matchen från start till mål.`);
                  } else {
                    parts.push("Inget av lagen kunde ta ett bestående grepp om matchen.");
                  }
                } else {
                  parts.push(
                    `Ledningen byttes ${leadChanges} gång${leadChanges > 1 ? "er" : ""}${leadChanges >= 2 ? " i en jämn och växlingsrik match" : ""}.`,
                  );
                }
                return parts.join(" ");
              })()}
            </p>
          </div>
        )}

        {periodsPlayed.length > 0 && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Per period
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {periodsPlayed.map((p) => {
                const s = periodScores.get(p)!;
                const label = p === "OT" ? "OT" : p === "SO" ? "GWS" : `P${p}`;
                return (
                  <div
                    key={p}
                    className="rounded-md border border-border/60 bg-background/40 px-2 py-1 font-mono text-xs tabular-nums"
                  >
                    <span className="mr-1 text-muted-foreground">{label}</span>
                    {s.home}–{s.away}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(recap.homeShots !== null || recap.awayShots !== null || recap.homePim !== null || recap.awayPim !== null) && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Lagstatistik
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Skott
                </div>
                <div className="font-mono tabular-nums">
                  {recap.homeShots ?? "–"} – {recap.awayShots ?? "–"}
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Utvisningsminuter
                </div>
                <div className="font-mono tabular-nums">
                  {recap.homePim ?? "–"} – {recap.awayPim ?? "–"}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {firstGoal && (
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Första målet
              </div>
              <div className="font-medium">{firstGoal.teamCode}</div>
              <div className="break-words text-xs text-muted-foreground">
                {firstGoal.scorer}
              </div>
              {firstGoal.time && (
                <div className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatTime(firstGoal.time)}
                </div>
              )}
            </div>
          )}
          {gwg && (
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Avgörande mål
              </div>
              <div className="font-medium">{gwg.teamCode}</div>
              <div className="break-words text-xs text-muted-foreground">
                {gwg.scorer}
              </div>
              <div className="font-mono text-xs tabular-nums text-muted-foreground">
                {gwgHome}-{gwgAway}
                {gwg.period
                  ? ` · P${normalizePeriod(gwg.period) ?? "?"}${gwg.time ? ` ${formatTime(gwg.time)}` : ""}`
                  : ""}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Största ledning
            </div>
            <div className="font-mono text-base tabular-nums">+{largestLead}</div>
            <div className="truncate text-xs text-muted-foreground">
              {largestLeadTeamCode ?? "–"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Ledningsbyten
            </div>
            <div className="font-mono text-base tabular-nums">{leadChanges}</div>
          </div>
        </div>

        {hatTricks.length > 0 && (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs">
            <span className="mr-1 font-semibold uppercase tracking-wide text-primary">
              Hat-trick
            </span>
            {hatTricks.map((h, i) => (
              <span key={h.name}>
                {i > 0 ? ", " : ""}
                {h.name} ({h.teamCode}, {h.goals}M)
              </span>
            ))}
          </div>
        )}

        {topScorers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga måldata tillgängliga ännu.</p>
        ) : (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Topp-poängplockare
            </div>
            <ul className="space-y-1 text-sm">
              {topScorers.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-2">
                  <span className="truncate">
                    <span className="mr-2 inline-block min-w-[2.5rem] font-mono text-xs text-muted-foreground">
                      {p.teamCode}
                    </span>
                    {p.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {p.goals}M {p.assists}A
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <a
          href={recap.gameUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-xs text-primary hover:underline"
        >
          Matchprotokoll ↗
        </a>
      </CardContent>
    </Card>
  );
}
