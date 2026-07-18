import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  getFullStandings,
  listSeasons,
  type StandingsRow,
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
import { ArrowLeft, ArrowUpDown } from "lucide-react";
import { LeagueOverviewSection } from "@/components/league-overview-section";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
     { title: "Jämför lag · HockeyEttan Södra" },
      {
        name: "description",
        content:
          "Full HockeyEttan Södra standings — sort, compare any two teams, and jump into a producer briefing.",
      },
    ],
  }),
  component: ComparePage,
});

const seasonsQueryOptions = queryOptions({
  queryKey: ["seasons"],
  queryFn: () => listSeasons(),
  staleTime: 24 * 60 * 60 * 1000,
});

type SortKey =
  | "position"
  | "team"
  | "gamesPlayed"
  | "wins"
  | "ties"
  | "losses"
  | "goalsFor"
  | "goalsAgainst"
  | "goalDiff"
  | "points";

function ComparePage() {
  const seasonsQuery = useQuery(seasonsQueryOptions);
  const defaultSeason = seasonsQuery.data?.default.label ?? "";
  const [season] = useState<string>(""); // current season is the default

  const activeSeason = season || defaultSeason;

  const standingsQuery = useQuery({
    queryKey: ["full-standings", activeSeason],
    queryFn: () => getFullStandings({ data: { season: activeSeason } }),
    enabled: !!activeSeason,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [picked, setPicked] = useState<{ home?: string; away?: string }>({});

  const rows = standingsQuery.data?.rows ?? [];
  const sorted = useMemo(() => {
    const r = [...rows];
    r.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? Number(av) - Number(bv)
        : Number(bv) - Number(av);
    });
    return r;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numeric columns default to descending (highest first); team/position ascending.
      setSortDir(key === "position" || key === "team" ? "asc" : "desc");
    }
  };

  const pickTeam = (team: string) => {
    setPicked((prev) => {
      if (!prev.home) return { home: team };
      if (prev.home === team) return {};
      if (prev.away === team) return { home: prev.home };
      return { home: prev.home, away: team };
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Jämför lag
            </h1>
            <p className="text-sm text-muted-foreground">
              HockeyEttan Södra
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to briefing
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {picked.home ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selected matchup</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <div className="text-sm">
                <span className="font-medium">Home:</span> {picked.home}
              </div>
              <div className="text-sm">
                <span className="font-medium">Away:</span>{" "}
                {picked.away ?? (
                  <span className="text-muted-foreground">
                    pick a second team
                  </span>
                )}
              </div>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPicked({})}
                >
                  Clear
                </Button>
                <Button
                  asChild
                  size="sm"
                  disabled={!picked.away}
                >
                  <Link
                    to="/"
                    search={{
                      home: picked.home ?? "",
                      away: picked.away ?? "",
                    }}
                  >
                    Open as full briefing
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Tabell{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({standingsQuery.data?.season ?? activeSeason})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {standingsQuery.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : standingsQuery.error ? (
              <p className="text-sm text-destructive">
                Could not load standings:{" "}
                {(standingsQuery.error as Error).message}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label="#"
                        active={sortKey === "position"}
                        onClick={() => toggleSort("position")}
                      />
                      <SortableHead
                        label="Team"
                        active={sortKey === "team"}
                        onClick={() => toggleSort("team")}
                      />
                      <SortableHead
                        label="GP"
                        align="right"
                        active={sortKey === "gamesPlayed"}
                        onClick={() => toggleSort("gamesPlayed")}
                      />
                      <SortableHead
                        label="W"
                        align="right"
                        active={sortKey === "wins"}
                        onClick={() => toggleSort("wins")}
                      />
                      <SortableHead
                        label="T"
                        align="right"
                        active={sortKey === "ties"}
                        onClick={() => toggleSort("ties")}
                      />
                      <SortableHead
                        label="L"
                        align="right"
                        active={sortKey === "losses"}
                        onClick={() => toggleSort("losses")}
                      />
                      <SortableHead
                        label="GF"
                        align="right"
                        active={sortKey === "goalsFor"}
                        onClick={() => toggleSort("goalsFor")}
                      />
                      <SortableHead
                        label="GA"
                        align="right"
                        active={sortKey === "goalsAgainst"}
                        onClick={() => toggleSort("goalsAgainst")}
                      />
                      <SortableHead
                        label="Diff"
                        align="right"
                        active={sortKey === "goalDiff"}
                        onClick={() => toggleSort("goalDiff")}
                      />
                      <SortableHead
                        label="Pts"
                        align="right"
                        active={sortKey === "points"}
                        onClick={() => toggleSort("points")}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((row) => (
                      <StandingsRowComponent
                        key={row.team}
                        row={row}
                        picked={picked}
                        onPick={pickTeam}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <LeagueOverviewSection season={activeSeason} />
      </main>
    </div>
  );
}

function SortableHead({
  label,
  active,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          active ? "text-foreground font-semibold" : ""
        }`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      </button>
    </TableHead>
  );
}

function StandingsRowComponent({
  row,
  picked,
  onPick,
}: {
  row: StandingsRow;
  picked: { home?: string; away?: string };
  onPick: (team: string) => void;
}) {
  const isHome = picked.home === row.team;
  const isAway = picked.away === row.team;
  return (
    <TableRow
      className={isHome || isAway ? "bg-muted/40" : ""}
    >

      <TableCell className="font-mono">{row.position}</TableCell>
      <TableCell className="font-medium">
        {row.team}
        {isHome ? (
          <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
            Home
          </span>
        ) : null}
        {isAway ? (
          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs">
            Away
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-right font-mono">{row.gamesPlayed}</TableCell>
      <TableCell className="text-right font-mono">{row.wins}</TableCell>
      <TableCell className="text-right font-mono">{row.ties}</TableCell>
      <TableCell className="text-right font-mono">{row.losses}</TableCell>
      <TableCell className="text-right font-mono">{row.goalsFor}</TableCell>
      <TableCell className="text-right font-mono">{row.goalsAgainst}</TableCell>
      <TableCell
        className={`text-right font-mono ${
          row.goalDiff > 0
            ? "text-green-600"
            : row.goalDiff < 0
              ? "text-destructive"
              : ""
        }`}
      >
        {row.goalDiff > 0 ? "+" : ""}
        {row.goalDiff}
      </TableCell>
      <TableCell className="text-right font-mono font-semibold">
        {row.points}
      </TableCell>
    </TableRow>
  );
}
