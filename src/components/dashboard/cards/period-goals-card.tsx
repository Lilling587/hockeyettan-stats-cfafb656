import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { strongestPeriod, type TeamData } from "@/lib/dashboard-utils";

export function PeriodGoalsCard({
  team,
  refreshing,
  error,
}: {
  team: TeamData;
  refreshing: boolean;
  error: string | null;
}) {
  const pg = team.periodGoals;
  const formatAverage = (goals: number, games: number) => {
    const average = games > 0 ? goals / games : 0;
    return average.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span>{team.name} · Mål per period</span>
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {refreshing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-1 text-center">
                  <Skeleton className="mx-auto h-7 w-8" />
                  <Skeleton className="mx-auto h-3 w-6" />
                </div>
              ))}
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Kunde inte uppdatera: {error}</p>
        ) : !pg || pg.games === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {(() => {
                const best = strongestPeriod(team);
                const wp = team.periodWinPct;
                return ([
                  ["P1", pg.p1, wp?.p1],
                  ["P2", pg.p2, wp?.p2],
                  ["P3", pg.p3, wp?.p3],
                ] as const).map(([label, value, winPct]) => (
                  <div
                    key={label}
                    className={`text-center rounded-md border p-2 ${best?.label === label ? "border-primary bg-primary/5" : "border-transparent"}`}
                  >
                    <div className="text-xl sm:text-2xl font-semibold tabular-nums">
                      {formatAverage(value, pg.games)}
                    </div>
                    <div className="text-xs text-muted-foreground">{label} / match</div>
                    {winPct != null && (
                      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {winPct.toFixed(1)}% vunna
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-semibold text-foreground">
              <span>Totalt antal mål</span>
              <span className="font-mono tabular-nums">
                {pg.total} på {pg.games} matcher · {formatAverage(pg.total, pg.games)}/match
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
