import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GameFlowResultDto } from "@/lib/game-flow.functions";

export function ShotTimelineCard({
  teamName,
  data,
}: {
  teamName: string;
  data: GameFlowResultDto | null | undefined;
}) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{teamName} · Skottförlopp</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Data saknas.</p>
        </CardContent>
      </Card>
    );
  }
  const games = [...data.games].reverse(); // oldest -> newest for the chart
  const totalFor = games.reduce((sum, g) => sum + (g.teamShots ?? 0), 0);
  const totalAgainst = games.reduce((sum, g) => sum + (g.oppShots ?? 0), 0);
  const withShots = games.filter((g) => g.teamShots != null && g.oppShots != null);
  const avgFor = withShots.length ? totalFor / withShots.length : null;
  const avgAgainst = withShots.length ? totalAgainst / withShots.length : null;
  const shotPct =
    totalFor + totalAgainst > 0 ? (totalFor / (totalFor + totalAgainst)) * 100 : null;

  // Period totals across all games in window
  const perPeriodFor: [number, number, number] = [0, 0, 0];
  const perPeriodAgainst: [number, number, number] = [0, 0, 0];
  for (const g of games) {
    g.teamShotsByPeriod.slice(0, 3).forEach((v, i) => {
      perPeriodFor[i] += v || 0;
    });
    g.oppShotsByPeriod.slice(0, 3).forEach((v, i) => {
      perPeriodAgainst[i] += v || 0;
    });
  }

  const maxShotVal = Math.max(
    1,
    ...games.flatMap((g) => [g.teamShots ?? 0, g.oppShots ?? 0]),
  );

  const fmt = (n: number | null, digits = 1) =>
    n != null ? n.toFixed(digits) : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{teamName} · Skottförlopp</CardTitle>
        <p className="text-xs text-muted-foreground">
          Senaste {games.length} spelade matcherna. Skott på mål — för (blå) / mot (röd).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="font-mono text-xl">{fmt(avgFor)}</div>
            <div className="text-xs text-muted-foreground">SF snitt</div>
          </div>
          <div>
            <div className="font-mono text-xl">{fmt(avgAgainst)}</div>
            <div className="text-xs text-muted-foreground">SA snitt</div>
          </div>
          <div>
            <div className="font-mono text-xl">{shotPct != null ? `${shotPct.toFixed(1)}%` : "—"}</div>
            <div className="text-xs text-muted-foreground">SF%</div>
          </div>
        </div>

        {games.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Skott per match
            </div>
            <div className="flex items-end gap-1" style={{ minHeight: 80 }}>
              {games.map((g) => {
                const forH = g.teamShots != null ? (g.teamShots / maxShotVal) * 60 : 0;
                const agH = g.oppShots != null ? (g.oppShots / maxShotVal) * 60 : 0;
                return (
                  <div key={g.gameId} className="flex flex-1 flex-col items-center gap-0.5">
                    <div className="flex items-end gap-0.5" style={{ height: 60 }}>
                      <div
                        className="w-2 rounded-t bg-primary"
                        style={{ height: `${forH}px` }}
                        title={`${g.date} vs ${g.opponent}: SF ${g.teamShots ?? "—"}`}
                      />
                      <div
                        className="w-2 rounded-t bg-destructive"
                        style={{ height: `${agH}px` }}
                        title={`${g.date} vs ${g.opponent}: SA ${g.oppShots ?? "—"}`}
                      />
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      {g.date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Skott per period (summa senaste matcher)
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[0, 1, 2].map((i) => {
              const diff = perPeriodFor[i] - perPeriodAgainst[i];
              return (
                <div key={i} className="rounded-md bg-muted p-2">
                  <div className="text-xs text-muted-foreground">P{i + 1}</div>
                  <div className="font-mono text-sm">
                    {perPeriodFor[i]}–{perPeriodAgainst[i]}
                  </div>
                  <Badge
                    variant={diff > 0 ? "default" : diff < 0 ? "destructive" : "secondary"}
                    className="mt-1"
                  >
                    {diff > 0 ? "+" : ""}
                    {diff}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
