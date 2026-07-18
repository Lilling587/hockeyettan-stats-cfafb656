import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ArrowLeft, Loader2, RotateCcw, Search, Users, X } from "lucide-react";

import { listSeasons, getLeaguePlayers } from "@/lib/stats.functions";
import type { LeaguePlayer } from "@/lib/stats.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeasonPicker } from "@/components/dashboard/season-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { TeamLogo } from "@/components/team-logo";
import { translateError } from "@/lib/error-messages";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  pos: fallback(z.string(), "all").default("all"),
  sort: fallback(z.string(), "points").default("points"),
  season: fallback(z.string(), "").default(""),
});
type SearchParams = z.infer<typeof searchSchema>;


export const Route = createFileRoute("/spelare")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Spelare — HockeyEttan Södra" },
      {
        name: "description",
        content:
          "Sök bland alla spelare i HockeyEttan Södra över hela ligan — poäng, mål, assist och utvisningsminuter.",
      },
    ],
  }),
  component: PlayersPage,
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Sidan kunde inte laddas</h1>
      <p className="mt-2 text-sm text-muted-foreground">{translateError(error)}</p>
      <Button className="mt-4" onClick={() => reset()}>
        Försök igen
      </Button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-muted-foreground">Inget hittades.</div>
  ),
});

type SortKey = "points" | "goals" | "assists" | "pim";
type PosFilter = "all" | "F" | "D" | "G";

const SORT_KEYS: SortKey[] = ["points", "goals", "assists", "pim"];
const POS_KEYS: PosFilter[] = ["all", "F", "D", "G"];

function matchPosition(filter: PosFilter, pos: string): boolean {
  if (filter === "all") return true;
  if (filter === "G") return /g/i.test(pos);
  if (filter === "D") return /d/i.test(pos) && !/g/i.test(pos);
  // Forwards = anything not D and not G.
  return !/d|g/i.test(pos);
}

function PlayersPage() {
  const fetchSeasons = useServerFn(listSeasons);
  const fetchPlayers = useServerFn(getLeaguePlayers);
  const navigate = useNavigate({ from: "/spelare" });
  const rawSearch = Route.useSearch();

  const query = rawSearch.q;
  const pos: PosFilter = (POS_KEYS as string[]).includes(rawSearch.pos)
    ? (rawSearch.pos as PosFilter)
    : "all";
  const sort: SortKey = (SORT_KEYS as string[]).includes(rawSearch.sort)
    ? (rawSearch.sort as SortKey)
    : "points";
  const season = rawSearch.season;

  const SPELARE_STATE_KEY = "spelare.search.v1";

  // Restore last state from sessionStorage when arriving with default/empty params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDefault =
      (rawSearch.q ?? "") === "" &&
      (rawSearch.pos ?? "all") === "all" &&
      (rawSearch.sort ?? "points") === "points" &&
      (rawSearch.season ?? "") === "";
    if (!isDefault) return;
    try {
      const saved = window.sessionStorage.getItem(SPELARE_STATE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<SearchParams>;
      const next: SearchParams = {
        q: parsed.q ?? "",
        pos: parsed.pos ?? "all",
        sort: parsed.sort ?? "points",
        season: parsed.season ?? "",
      };
      if (
        next.q === "" &&
        next.pos === "all" &&
        next.sort === "points" &&
        next.season === ""
      )
        return;
      navigate({ search: () => next, replace: true });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist current state
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        SPELARE_STATE_KEY,
        JSON.stringify({
          q: rawSearch.q,
          pos: rawSearch.pos,
          sort: rawSearch.sort,
          season: rawSearch.season,
        }),
      );
    } catch {
      // ignore
    }
  }, [rawSearch.q, rawSearch.pos, rawSearch.sort, rawSearch.season]);

  const setQuery = (v: string) =>
    navigate({ search: (p: SearchParams) => ({ ...p, q: v }), replace: true });
  const setPos = (v: PosFilter) =>
    navigate({ search: (p: SearchParams) => ({ ...p, pos: v }), replace: true });
  const setSort = (v: SortKey) =>
    navigate({ search: (p: SearchParams) => ({ ...p, sort: v }), replace: true });
  const setSeason = (v: string) =>
    navigate({ search: (p: SearchParams) => ({ ...p, season: v }), replace: true });



  const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: () => fetchSeasons(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const defaultSeason = seasonsQuery.data?.default.label ?? "";
  const activeSeason = season || defaultSeason;

  const playersQuery = useQuery({
    queryKey: ["league-players", activeSeason],
    queryFn: () => fetchPlayers({ data: { season: activeSeason } }),
    enabled: !!activeSeason,
    staleTime: 60 * 60 * 1000,
  });


  const filtered = useMemo(() => {
    const all = (playersQuery.data?.players ?? []).filter(
      (p) => p.position?.toUpperCase() !== "G",
    );
    const q = query.trim().toLowerCase();
    const matched = all.filter((p) => {
      if (!matchPosition(pos, p.position)) return false;
      if (!q) return true;

      const raw = p.name.toLowerCase();

      // Player names from swehockey.se are stored as "Surname, Firstname".
      // Build a normalized "firstname surname" version so searching either
      // order works. Use replace(/\s+/g, " ") to handle any non-breaking
      // spaces that may come from HTML scraping.
      const parts = p.name.split(",");
      const normalized =
        parts.length === 2
          ? `${parts[1].replace(/\s+/g, " ").trim()} ${parts[0].replace(/\s+/g, " ").trim()}`.toLowerCase()
          : raw;

      // Combine both forms into one string and require every word in the
      // query to appear somewhere in it. This makes "karl umegård" work
      // regardless of which order the user types the name.
      const combined = `${raw} ${normalized}`;
      const words = q.split(/\s+/).filter(Boolean);

      return words.every((w: string) => combined.includes(w)) || p.team.toLowerCase().includes(q);
    });
    const key = sort;
    const get = (p: LeaguePlayer): number => {
      if (key === "goals") return p.goals ?? -1;
      if (key === "assists") return p.assists ?? -1;
      if (key === "pim") return p.pim ?? -1;
      return p.points ?? -1;
    };
    return matched.slice().sort((a, b) => get(b) - get(a));
  }, [playersQuery.data, query, pos, sort]);

  const posLabel: Record<PosFilter, string> = {
    all: "Alla",
    F: "Forwards",
    D: "Backar",
    G: "Målvakter",
  };
  const sortLabel: Record<SortKey, string> = {
    points: "poäng",
    goals: "mål",
    assists: "assist",
    pim: "utvisningsminuter",
  };

  const filtersDirty = query.trim().length > 0 || pos !== "all" || sort !== "points";
  const activeFilterSummary = [
    query.trim() ? `Sök: "${query.trim()}"` : null,
    pos !== "all" ? `Position: ${posLabel[pos]}` : null,
    sort !== "points" ? `Sorterat på: ${sortLabel[sort]}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const resetFilters = () => {
    setQuery("");
    setPos("all");
    setSort("points");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              <Users className="h-5 w-5" />
              Spelare
            </h1>
            <p className="text-sm text-muted-foreground">HockeyEttan Södra · sök bland alla spelare i ligan</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div className="min-w-0">
              <CardTitle className="text-base">Filter</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {filtersDirty ? activeFilterSummary : "Inga filter aktiva — visar alla spelare för säsongen"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={resetFilters} disabled={!filtersDirty}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Återställ filter
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SeasonPicker
                value={activeSeason}
                onChange={setSeason}
                seasons={(seasonsQuery.data?.seasons ?? []).map((s) => s.label)}
                loading={seasonsQuery.isLoading}
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="player-search" className="text-sm font-medium leading-none">
                  Sök spelare eller lag
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="player-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Förnamn, efternamn eller lag"
                    className="pl-8 pr-8"
                  />
                  {query ? (
                    <button
                      type="button"
                      aria-label="Rensa sökning"
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Position:</span>
                {(
                  [
                    ["all", "Alla"],
                    ["F", "Forwards"],
                    ["D", "Backar"],
                    ["G", "Målvakter"],
                  ] as Array<[PosFilter, string]>
                ).map(([key, label]) => (
                  <Button key={key} size="sm" variant={pos === key ? "default" : "outline"} onClick={() => setPos(key)}>
                    {label}
                  </Button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Sortera:</span>
                {(
                  [
                    ["points", "P"],
                    ["goals", "G"],
                    ["assists", "A"],
                    ["pim", "PIM"],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <Button key={key} size="sm" variant={sort === key ? "default" : "ghost"} onClick={() => setSort(key)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {playersQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar spelare…
          </div>
        ) : playersQuery.isError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {translateError(playersQuery.error)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga spelare matchar din sökning.</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{filtered.length} spelare</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 w-10">#</th>
                      <th className="px-4 py-2">Namn</th>
                      <th className="px-4 py-2">Lag</th>
                      <th className="px-2 py-2">Pos</th>
                      <th className="px-2 py-2 text-right">GP</th>
                      <th className="px-2 py-2 text-right">G</th>
                      <th className="px-2 py-2 text-right">A</th>
                      <th className="px-2 py-2 text-right">P</th>
                      <th className="px-2 py-2 text-right">PIM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.slice(0, 500).map((p, i) => (
                      <tr key={`${p.team}-${p.name}-${i}`}>
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2 font-medium">{p.name}</td>
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-2">
                            <TeamLogo team={p.team} size="sm" />
                            {p.team}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{p.position}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.gamesPlayed ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.goals ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.assists ?? "—"}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{p.points ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.pim ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="divide-y divide-border sm:hidden">
                {filtered.slice(0, 200).map((p, i) => (
                  <li key={`m-${p.team}-${p.name}-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-6 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                    <TeamLogo team={p.team} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.team} · {p.position}
                      </div>
                    </div>
                    <div className="text-right text-xs tabular-nums">
                      <div className="text-sm font-semibold">{p.points ?? "—"} P</div>
                      <div className="text-muted-foreground">
                        {p.goals ?? 0}+{p.assists ?? 0} · {p.gamesPlayed ?? "—"} GP
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
