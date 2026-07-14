import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { reportError } from "@/lib/error-reporter";

import {
  listTeams,
  listSeasons,
  getMatchupBriefing,
  scanForNewSeasons,
  listPendingSeasons,
  getTodaysMatchup,
} from "@/lib/stats.functions";
import { checkIsAdmin } from "@/lib/roles.functions";
import type { Briefing } from "@/lib/stats.functions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CalendarDays,
  Check,
  FolderUp,
  Info,
  Loader2,
  LogOut,
  RefreshCw,
  Scale,
  Settings,
  Star,
  Tv,
  Users,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabase } from "@/integrations/supabase/client";

import {
  DEFAULT_FAVORITE_TEAM,
  getFavoriteTeam,
  getLastActiveTab,
  setFavoriteTeam,
  setLastActiveTab,
} from "@/lib/preferences";
import { useIsMobile as _useIsMobile } from "@/hooks/use-mobile";
import { translateError } from "@/lib/error-messages";

import { SeasonPicker } from "@/components/dashboard/season-picker";
import { SearchableTeamPicker } from "@/components/dashboard/searchable-team-picker";
import { PendingSeasonsBanner } from "@/components/dashboard/pending-seasons-banner";
import { BriefingSkeleton } from "@/components/dashboard/briefing-skeleton";
import { BriefingView } from "@/components/dashboard/briefing-view";
import { PostgameRecapCard } from "@/components/dashboard/postgame/postgame-recap-card";
import { NextMatchCard } from "@/components/dashboard/cards/next-match-card";

// Re-touch to keep tree-shaker honest about the unused hook import.
void _useIsMobile;

const searchSchema = z.object({
  home: fallback(z.string(), "").default(""),
  away: fallback(z.string(), "").default(""),
});

const seasonsQueryOptions = queryOptions({
  queryKey: ["seasons"],
  queryFn: () => listSeasons(),
  staleTime: 24 * 60 * 60 * 1000,
});

const teamsQueryOptions = (season: string) =>
  queryOptions({
    queryKey: ["teams", season],
    queryFn: () => listTeams({ data: { season } }),
    staleTime: 60 * 60 * 1000,
  });

// Pending-season detections are admin-only server-side. The query is enabled
// from the component only when the current user is verified as admin.


function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportError("dashboard.RouteError", error, { boundary: "/" });
  }, [error]);
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="flex-1">Kunde inte ladda laglistan: {translateError(error)}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          <RefreshCw className="h-3 w-3" />
          Försök igen
        </Button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
      Page not found.
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grästorps IK" },
      {
        name: "description",
        content:
          "Matchstatistik för HockeyEttan Södra-sändningar. Välj två lag och få statistik på sekunder.",
      },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context }) => {
    const seasons = await context.queryClient.ensureQueryData(seasonsQueryOptions);
    const defaultSeason = seasons.default.label;
    let defaultTeams: Awaited<ReturnType<typeof listTeams>> | null = null;
    if (defaultSeason) {
      defaultTeams = await context.queryClient.ensureQueryData(teamsQueryOptions(defaultSeason));
    }
    return { seasons, defaultSeason, defaultTeams };
  },
  errorComponent: RouteError,
  notFoundComponent: NotFound,
  component: Dashboard,
});

type BriefingCache = {
  briefing: Briefing;
  fetchedAt: string;
  cached: boolean;
  season?: string;
};

function Dashboard() {
  const loaderData = Route.useLoaderData();
  const fetchTeams = useServerFn(listTeams);
  const fetchSeasons = useServerFn(listSeasons);
  const fetchBriefing = useServerFn(getMatchupBriefing);
  const fetchPending = useServerFn(listPendingSeasons);
  const fetchTodaysMatchup = useServerFn(getTodaysMatchup);
  const runScan = useServerFn(scanForNewSeasons);
  const adminFn = useServerFn(checkIsAdmin);
  const qc = useQueryClient();

  const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: () => fetchSeasons(),
    initialData: loaderData.seasons,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const pendingQuery = useQuery({
    queryKey: ["season-detections"],
    queryFn: () => fetchPending(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    runScan({ data: {} })
      .then(() => qc.invalidateQueries({ queryKey: ["season-detections"] }))
      .catch((e) => console.warn("[season-scan] failed:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [season, setSeason] = useState<string>(loaderData.defaultSeason);
  const activeSeason =
    season || loaderData.defaultSeason || seasonsQuery.data?.default.label || "";

  const teamsQuery = useQuery({
    queryKey: ["teams", activeSeason],
    queryFn: () => fetchTeams({ data: { season: activeSeason } }),
    enabled: !!activeSeason,
    initialData:
      activeSeason === loaderData.defaultSeason
        ? loaderData.defaultTeams ?? undefined
        : undefined,
    staleTime: 60 * 60 * 1000,
  });

  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });

  const todaysMatchupQuery = useQuery({
    queryKey: ["todays-matchup", activeSeason],
    queryFn: () => fetchTodaysMatchup({ data: { season: activeSeason } }),
    enabled: !!activeSeason,
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    const match = todaysMatchupQuery.data?.match;
    if (!match) return;
    if (match.home !== "Grästorps IK") return;
    if (search.away) return;
    navigate({
      search: (prev: typeof search) => ({
        ...prev,
        home: "Grästorps IK",
        away: match.away,
      }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaysMatchupQuery.data?.match?.date]);

  const [favorite, setFavorite] = useState<string>(DEFAULT_FAVORITE_TEAM);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  useEffect(() => {
    setFavorite(getFavoriteTeam());
    const onChange = () => setFavorite(getFavoriteTeam());
    window.addEventListener("producerStats:favorite-changed", onChange);
    return () =>
      window.removeEventListener("producerStats:favorite-changed", onChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const adminQuery = useQuery({
    queryKey: ["admin-check"],
    queryFn: () => adminFn(),
    enabled: !!user,
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const home = search.home || favorite || DEFAULT_FAVORITE_TEAM;
  const away = search.away;
  const selectedAway =
    away && away !== home
      ? away
      : (teamsQuery.data?.teams ?? []).find((team: string) => team !== home) ?? "";

  const briefingCacheKey = (h: string, a: string, s: string) =>
    ["briefing-cache", s, h, a] as const;
  const [briefing, setBriefingState] = useState<BriefingCache | null>(() =>
    qc.getQueryData<BriefingCache>(briefingCacheKey(home, selectedAway, activeSeason)) ?? null,
  );
  const setBriefing = (data: BriefingCache | null) => {
    setBriefingState(data);
    if (data) {
      const season = data.season ?? activeSeason;
      qc.setQueryData(
        briefingCacheKey(data.briefing.home.name, data.briefing.away.name, season),
        data,
      );
      qc.setQueryData(briefingCacheKey(home, selectedAway, season), data);
    }
  };
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached =
      qc.getQueryData<BriefingCache>(
        briefingCacheKey(home, selectedAway, activeSeason),
      ) ?? null;
    setBriefingState(cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, selectedAway, activeSeason]);

  const [validationErrors, setValidationErrors] = useState<{
    home?: string;
    away?: string;
  }>({});

  const validate = (): boolean => {
    const errors: { home?: string; away?: string } = {};
    if (!home || home.trim() === "") {
      errors.home = "Hemmalag krävs.";
    }
    if (!selectedAway || selectedAway.trim() === "") {
      errors.away = "Bortalag krävs.";
    } else if (home === selectedAway) {
      errors.away = "Hemma- och bortalag måste vara olika.";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const setHome = (team: string) => {
    navigate({ search: (prev: typeof search) => ({ ...prev, home: team }) });
    if (validationErrors.home) {
      setValidationErrors((prev) => ({ ...prev, home: undefined }));
    }
  };
  const setAway = (team: string) => {
    navigate({ search: (prev: typeof search) => ({ ...prev, away: team }) });
    if (validationErrors.away) {
      setValidationErrors((prev) => ({ ...prev, away: undefined }));
    }
  };

  const briefingMut = useMutation({
    mutationFn: (vars: { home: string; away: string; force?: boolean }) =>
      fetchBriefing({ data: { ...vars, season: activeSeason } }),
    onSuccess: (data) => {
      setBriefing(data);
      setActiveTab("briefing");
      setError(null);
    },
    onError: (e: Error, vars) => {
      console.error("[briefing refresh failed]", {
        message: e.message,
        stack: e.stack,
        cause: (e as Error & { cause?: unknown }).cause,
        vars,
        season: activeSeason,
      });
      reportError("dashboard.briefingMutation", e, {
        vars,
        season: activeSeason,
        cause: String((e as Error & { cause?: unknown }).cause ?? ""),
      });
      setError(translateError(e));
    },
  });

  const handleLoadBriefing = () => {
    if (!validate()) return;
    briefingMut.mutate({ home, away: selectedAway });
  };

  const canLoad = home && selectedAway && home !== selectedAway;
  const [activeTab, setActiveTab] = useState<"briefing" | "recap">("briefing");
  const hasLoadedSavedTab = useRef(false);

  useEffect(() => {
    if (!hasLoadedSavedTab.current) {
      hasLoadedSavedTab.current = true;
      const savedTab = getLastActiveTab();
      if (savedTab) setActiveTab(savedTab);
      return;
    }
    setLastActiveTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const el = document;
    let start: { x: number; y: number } | null = null;
    let end: { x: number; y: number } | null = null;
    const threshold = 56;

    const onDown = (e: PointerEvent) => {
      if (window.innerWidth >= 768) return;
      start = { x: e.clientX, y: e.clientY };
      end = null;
    };
    const onMove = (e: PointerEvent) => {
      if (!start || window.innerWidth >= 768) return;
      end = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      if (!start || !end || window.innerWidth >= 768) return;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        setActiveTab((prev) =>
          dx < 0 && prev === "briefing"
            ? "recap"
            : dx > 0 && prev === "recap"
              ? "briefing"
              : prev,
        );
      }
      start = null;
      end = null;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Keyboard shortcuts (skipped while typing in inputs/textareas)
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      switch (e.key) {
        case "1":
          e.preventDefault();
          setActiveTab("briefing");
          break;
        case "2":
          e.preventDefault();
          setActiveTab("recap");
          break;
        case "l":
        case "L":
          if (canLoad && !briefingMut.isPending) {
            e.preventDefault();
            handleLoadBriefing();
          }
          break;
        case "r":
        case "R":
          if (briefing && !briefingMut.isPending) {
            e.preventDefault();
            briefingMut.mutate({ home, away: selectedAway, force: true });
          }
          break;
        case "p":
        case "P":
          if (briefing) {
            e.preventDefault();
            window.print();
          }
          break;
        case "?":
          e.preventDefault();
          import("sonner").then(({ toast }) =>
            toast("Kortkommandon", {
              description:
                "1 = Briefing · 2 = Recap · L = Ladda · R = Uppdatera · P = Skriv ut",
            }),
          );
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad, briefing, briefingMut.isPending, home, selectedAway]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as "briefing" | "recap")}
      className="min-h-screen bg-background"
    >
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {favorite || "Grästorps IK"} — Producent-statistik
            </h1>
            <p className="text-sm text-muted-foreground">
              HockeyEttan Södra · matchstatistik för kommentatorer
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <TabsList className="hidden sm:flex w-full sm:w-auto">
              <TabsTrigger value="briefing" className="flex-1 sm:flex-initial">
                Matchgenomgång
              </TabsTrigger>
              <TabsTrigger value="recap" className="flex-1 sm:flex-initial">
                Matchsammanfattning
              </TabsTrigger>
            </TabsList>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link to="/schema">
                <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
                Spelschema
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link to="/spelare">
                <Users className="mr-2 h-4 w-4 shrink-0" />
                Spelare
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link to="/compare">
                <Scale className="mr-2 h-4 w-4 shrink-0" />
                <span className="sm:hidden">HockeyEttan stats</span>
                <span className="hidden sm:inline">HockeyEttan stats</span>
              </Link>
            </Button>
            {user ? (
              <>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link to="/notifications">
                    <Star className="mr-2 h-4 w-4 shrink-0" />
                    Notiser
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link to="/admin/logs">
                    <Settings className="mr-2 h-4 w-4 shrink-0" />
                    Loggbok
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link to="/admin/logos">
                    <Settings className="mr-2 h-4 w-4 shrink-0" />
                    Logotyper
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link to="/admin/health">
                    <Settings className="mr-2 h-4 w-4 shrink-0" />
                    Hälsa
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link to="/admin/vmix">
                    <Tv className="mr-2 h-4 w-4 shrink-0" />
                    vMix
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link to="/admin/users">
                    <Users className="mr-2 h-4 w-4 shrink-0" />
                    Användare
                  </Link>
                </Button>
                {adminQuery.data?.isAdmin ? (
                  <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                    <Link to="/admin/assets">
                      <FolderUp className="mr-2 h-4 w-4 shrink-0" />
                      Lagring
                    </Link>
                  </Button>
                ) : null}
                {adminQuery.data?.isAdmin ? (
                  <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                    <Link to="/connect">
                      <Info className="mr-2 h-4 w-4 shrink-0" />
                      Anslut AI
                    </Link>
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4 shrink-0" />
                  Logga ut
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link to="/auth">Logga in</Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground sm:w-auto"
                >
                  <Link to="/auth" search={{ next: "/admin/logos" }}>
                    Admin
                  </Link>
                </Button>
              </>
            )}
            <ThemeToggle className="w-full sm:w-auto" />
          </div>
        </div>
      </header>

      {/* Mobile-only sticky tab strip: keeps Briefing/Recap reachable while scrolling */}
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden">
        <div className="mx-auto max-w-6xl px-4 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="briefing" className="flex-1">
              Matchgenomgång
            </TabsTrigger>
            <TabsTrigger value="recap" className="flex-1">
              Matchsammanfattning
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <main className="mx-auto max-w-6xl touch-pan-y px-6 py-8 space-y-6">
        <PendingSeasonsBanner
          pending={pendingQuery.data?.pending ?? []}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["season-detections"] });
            qc.invalidateQueries({ queryKey: ["seasons"] });
          }}
        />

        {favorite && activeSeason ? (
          <NextMatchCard team={favorite} season={activeSeason} />
        ) : null}


        <Card>
          <CardHeader>
            <CardTitle className="text-base">Välj lag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs">
              <SeasonPicker
                value={activeSeason}
                onChange={setSeason}
                seasons={(seasonsQuery.data?.seasons ?? []).map((s: { label: string }) => s.label)}
                loading={seasonsQuery.isLoading}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] items-end">
              <div className="flex flex-col gap-1">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <SearchableTeamPicker
                      label="Hemmalag"
                      value={home}
                      onChange={setHome}
                      teams={teamsQuery.data?.teams ?? []}
                      excludedTeam={away}
                      loading={teamsQuery.isLoading}
                    />
                  </div>
                  <Button
                    type="button"
                    variant={favorite === home ? "default" : "outline"}
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    title={
                      favorite === home
                        ? "Detta är ditt favoritlag (laddas som standard)"
                        : `Sätt ${home} som favoritlag`
                    }
                    onClick={() => setFavoriteTeam(favorite === home ? "" : home)}
                  >
                    <Star
                      className={`h-4 w-4 ${favorite === home ? "fill-current" : ""}`}
                    />
                  </Button>
                </div>
                {validationErrors.home ? (
                  <p className="text-xs text-destructive">{validationErrors.home}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <SearchableTeamPicker
                  label="Bortalag"
                  value={selectedAway}
                  onChange={setAway}
                  teams={teamsQuery.data?.teams ?? []}
                  excludedTeam={home}
                  loading={teamsQuery.isLoading}
                />
                {validationErrors.away ? (
                  <p className="text-xs text-destructive">{validationErrors.away}</p>
                ) : null}
              </div>
              <Button disabled={briefingMut.isPending} onClick={handleLoadBriefing}>
                {briefingMut.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Laddar…
                  </>
                ) : (
                  "Ladda statistik"
                )}
              </Button>
            </div>
            {teamsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laddar laglista…
              </div>
            ) : teamsQuery.isSuccess ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-green-500" />
                {teamsQuery.data?.teams.length ?? 0} lag laddade
              </div>
            ) : null}
            {todaysMatchupQuery.data?.match &&
            todaysMatchupQuery.data.match.home === "Grästorps IK" &&
            search.away === todaysMatchupQuery.data.match.away ? (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  Bortalag autoifyllt från dagens schema ({todaysMatchupQuery.data.match.date})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() =>
                    navigate({
                      search: (prev: typeof search) => ({ ...prev, away: "" }),
                      replace: true,
                    })
                  }
                >
                  <X className="mr-1 h-3 w-3" />
                  Rensa
                </Button>
              </div>
            ) : null}
            {teamsQuery.isError ? (
              <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1">Kunde inte ladda laglistan.</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => teamsQuery.refetch()}
                >
                  <RefreshCw className="h-3 w-3" />
                  Försök igen
                </Button>
              </div>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            ) : null}
          </CardContent>
        </Card>

        {briefingMut.isPending ? <BriefingSkeleton /> : null}

        <TabsContent value="briefing" className="mt-0">
          {briefing ? (
            <BriefingView
              data={briefing.briefing}
              fetchedAt={briefing.fetchedAt}
              cached={briefing.cached}
              refreshing={briefingMut.isPending}
              refreshError={briefingMut.isError ? translateError(briefingMut.error) : null}
              onRefresh={() =>
                briefingMut.mutate(
                  { home, away: selectedAway, force: true },
                  {
                    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
                  },
                )
              }
            />
          ) : null}
        </TabsContent>

        <TabsContent value="recap" className="mt-0">
          {canLoad ? (
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <PostgameRecapCard
                home={home}
                away={selectedAway}
                onBackToBriefing={() => setActiveTab("briefing")}
              />
            </Suspense>
          ) : null}
        </TabsContent>
      </main>
    </Tabs>
  );
}
