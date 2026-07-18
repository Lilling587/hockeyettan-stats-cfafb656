import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, RefreshCw } from "lucide-react";
import {
  getLeagueOverview,
  getLeaguePlayers,
  type LeagueOverviewResult,
  type LeaguePlayer,
} from "@/lib/stats.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function LeagueOverviewSection({ season }: { season: string }) {
  const fetchLeagueOverview = useServerFn(getLeagueOverview);
  const fetchPlayers = useServerFn(getLeaguePlayers);

  const query = useQuery({
    queryKey: ["league-overview", season],
    queryFn: () => fetchLeagueOverview({ data: { season } }),
    enabled: !!season,
    staleTime: 60 * 60 * 1000,
  });

  const playersQuery = useQuery({
    queryKey: ["league-players", season],
    queryFn: () => fetchPlayers({ data: { season } }),
    enabled: !!season,
    staleTime: 60 * 60 * 1000,
  });

  const topPim = useMemo((): (LeaguePlayer & { rank: number })[] => {
    const players = playersQuery.data?.players ?? [];
    return players
      .filter((p) => p.pim != null && p.pim > 0)
      .sort((a, b) => (b.pim ?? 0) - (a.pim ?? 0))
      .slice(0, 10)
      .map((p, i) => ({ rank: i + 1, ...p }));
  }, [playersQuery.data]);

  return (
    <LeagueOverviewView
      data={query.data ?? null}
      loading={query.isLoading}
      error={query.isError ? (query.error as Error).message : null}
      onRetry={() => query.refetch()}
      topPim={topPim}
      pimLoading={playersQuery.isLoading}
    />
  );
}

function LeagueOverviewView({
  data,
  loading,
  error,
  onRetry,
  topPim,
  pimLoading,
}: {
  data: LeagueOverviewResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  topPim: (LeaguePlayer & { rank: number })[];
  pimLoading: boolean;
}) {
  if (loading && !data) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">League-wide</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">League-wide</h2>
        <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Could not load league overview: {error}</span>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onRetry}>
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      </section>
    );
  }
  if (!data) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-end">
        <p className="text-xs text-muted-foreground">
          HockeyEttan Södra · {data.seasonLabel}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Poängliga</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">G</TableHead>
                  <TableHead className="text-right">A</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topScorers.map((p) => (
                  <TableRow key={`${p.team}-${p.name}`}>
                    <TableCell className="text-muted-foreground">{p.rank}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.team}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.goals ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.assists ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{p.points}</TableCell>
                  </TableRow>
                ))}
                {data.topScorers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      No scorer data available.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Målvaktsliga</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Goalie</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">GP</TableHead>
                  <TableHead className="text-right">SV%</TableHead>
                  <TableHead className="text-right">GAA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topGoalies.map((g) => (
                  <TableRow key={`${g.team}-${g.name}`}>
                    <TableCell className="text-muted-foreground">{g.rank}</TableCell>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{g.team}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.gamesPlayed}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {g.savePct != null ? g.savePct.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {g.gaa != null ? g.gaa.toFixed(2) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {data.topGoalies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      No goalie data available.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Utvisningsliga</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pimLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-right">GP</TableHead>
                    <TableHead className="text-right">PIM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPim.map((p) => (
                    <TableRow key={`${p.team}-${p.name}`}>
                      <TableCell className="text-muted-foreground">{p.rank}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.team}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.gamesPlayed ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{p.pim}</TableCell>
                    </TableRow>
                  ))}
                  {topPim.length === 0 && !pimLoading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        No PIM data available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gjorda/insläppta mål - snitt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Highest scoring (goals for / game)
              </p>
              <Table>
                <TableBody>
                  {data.highestScoring.map((t) => (
                    <TableRow key={`hs-${t.team}`}>
                      <TableCell className="w-10 text-muted-foreground">{t.rank}</TableCell>
                      <TableCell className="font-medium">{t.team}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {t.goalsFor} GF · {t.gamesPlayed} GP
                      </TableCell>
                      <TableCell className="w-16 text-right font-semibold tabular-nums">
                        {t.perGame.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Best defenses (goals against / game)
              </p>
              <Table>
                <TableBody>
                  {data.bestDefenses.map((t) => (
                    <TableRow key={`bd-${t.team}`}>
                      <TableCell className="w-10 text-muted-foreground">{t.rank}</TableCell>
                      <TableCell className="font-medium">{t.team}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {t.goalsAgainst} GA · {t.gamesPlayed} GP
                      </TableCell>
                      <TableCell className="w-16 text-right font-semibold tabular-nums">
                        {t.perGame.toFixed(2)}
                      </TableCell>
                    </TableRow>
                 ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
           <CardTitle className="text-base">Hetaste lag · senaste 5</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead className="text-right">GF–GA</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.hottestTeams.map((t) => (
                  <TableRow key={t.team}>
                    <TableCell className="text-muted-foreground">{t.rank}</TableCell>
                    <TableCell className="font-medium">{t.team}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {t.results.map((r, i) => (
                          <span
                            key={i}
                            className={`inline-flex h-5 w-6 items-center justify-center rounded text-[10px] font-semibold ${
                              r === "W"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : r === "OTW"
                                  ? "bg-emerald-500/10 text-emerald-600/80 dark:text-emerald-400/80"
                                  : r === "T"
                                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                    : r === "OTL"
                                      ? "bg-rose-500/10 text-rose-600/80 dark:text-rose-400/80"
                                      : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                            }`}
                            title={r}
                          >
                            {r === "OTW" ? "OT" : r === "OTL" ? "OT" : r}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.goalsFor}–{t.goalsAgainst}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{t.points}</TableCell>
                  </TableRow>
                ))}
                {data.hottestTeams.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Not enough games played yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
