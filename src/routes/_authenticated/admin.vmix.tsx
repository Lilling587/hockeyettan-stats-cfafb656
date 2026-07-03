import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Copy, Download, Loader2, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import { getTodaysMatchup, listTeams } from "@/lib/stats.functions";
import {
  fetchTeamRoster,
  getActivePublication,
  publishVmix,
  unpublishVmix,
  type VmixLineupInput,
} from "@/lib/vmix.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_TEAM = "Grästorps IK";

export const Route = createFileRoute("/_authenticated/admin/vmix")({
  head: () => ({
    meta: [
      { title: "vMix Data · HockeyEttan Södra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VmixAdminPage,
});

type Player = VmixLineupInput["goalies"][number];

function emptyLineup(team: string): VmixLineupInput {
  return { team, goalies: [], skaters: [], coach: null, notes: null };
}

function VmixAdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchTeams = useServerFn(listTeams);
  const fetchTodays = useServerFn(getTodaysMatchup);
  const fetchActive = useServerFn(getActivePublication);
  const fetchRoster = useServerFn(fetchTeamRoster);
  const publish = useServerFn(publishVmix);
  const unpublish = useServerFn(unpublishVmix);

  const adminQuery = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchIsAdmin(),
    retry: false,
  });

  useEffect(() => {
    if (adminQuery.isError || (adminQuery.data && !adminQuery.data.isAdmin)) {
      toast.error("Du har inte behörighet att se admin-sidan.");
      navigate({ to: "/", replace: true });
    }
  }, [adminQuery.isError, adminQuery.data, navigate]);

  const teamsQuery = useQuery({
    queryKey: ["vmix-teams"],
    queryFn: () => fetchTeams({ data: {} }),
    enabled: !!adminQuery.data?.isAdmin,
  });

  const activeQuery = useQuery({
    queryKey: ["vmix-active"],
    queryFn: () => fetchActive(),
    enabled: !!adminQuery.data?.isAdmin,
  });

  const today = new Date().toISOString().slice(0, 10);
  const [gameDate, setGameDate] = useState<string>(today);
  const [homeTeam, setHomeTeam] = useState<string>(DEFAULT_TEAM);
  const [awayTeam, setAwayTeam] = useState<string>("");
  const [venue, setVenue] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [homeLineup, setHomeLineup] = useState<VmixLineupInput>(
    emptyLineup(DEFAULT_TEAM),
  );
  const [awayLineup, setAwayLineup] = useState<VmixLineupInput>(
    emptyLineup(""),
  );
  const [sourceMode, setSourceMode] = useState<"idle" | "auto" | "manual" | "live-hydrated">("idle");
  const [autoApplied, setAutoApplied] = useState(false);

  // Hydrate from active publication (once).
  useEffect(() => {
    const pub = activeQuery.data;
    if (!pub) return;
    setGameDate(pub.gameDate);
    setHomeTeam(pub.homeTeam);
    setAwayTeam(pub.awayTeam);
    setVenue(pub.venue ?? "");
    setNotes(pub.notes ?? "");
    setHomeLineup(pub.homeLineup);
    setAwayLineup(pub.awayLineup);
    setSourceMode("live-hydrated");
    setAutoApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuery.data?.id]);

  useEffect(() => {
    setHomeLineup((prev) => ({ ...prev, team: homeTeam }));
  }, [homeTeam]);
  useEffect(() => {
    setAwayLineup((prev) => ({ ...prev, team: awayTeam }));
  }, [awayTeam]);

  const teams = teamsQuery.data?.teams ?? [];
  const opponents = useMemo(
    () => teams.filter((t) => t !== homeTeam),
    [teams, homeTeam],
  );

  const prefillHome = useMutation({
    mutationFn: () => fetchRoster({ data: { team: homeTeam } }),
    onSuccess: (lineup) => {
      setHomeLineup(lineup);
      toast.success(`Hemmaroster hämtad: ${lineup.skaters.length} utespelare, ${lineup.goalies.length} MV`);
    },
    onError: (e) => toast.error(`Fel: ${(e as Error).message}`),
  });
  const prefillAway = useMutation({
    mutationFn: () => fetchRoster({ data: { team: awayTeam } }),
    onSuccess: (lineup) => {
      setAwayLineup(lineup);
      toast.success(`Bortaroster hämtad: ${lineup.skaters.length} utespelare, ${lineup.goalies.length} MV`);
    },
    onError: (e) => toast.error(`Fel: ${(e as Error).message}`),
  });

  const publishMut = useMutation({
    mutationFn: () =>
      publish({
        data: {
          gameDate,
          homeTeam,
          awayTeam,
          venue: venue || null,
          notes: notes || null,
          homeLineup,
          awayLineup,
        },
      }),
    onSuccess: () => {
      toast.success("Publicerat till vMix");
      queryClient.invalidateQueries({ queryKey: ["vmix-active"] });
    },
    onError: (e) => toast.error(`Publicering misslyckades: ${(e as Error).message}`),
  });

  const unpublishMut = useMutation({
    mutationFn: () => unpublish({}),
    onSuccess: () => {
      toast.success("Avpublicerat");
      queryClient.invalidateQueries({ queryKey: ["vmix-active"] });
    },
    onError: (e) => toast.error(`Fel: ${(e as Error).message}`),
  });

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";
  const endpoints = [
    { label: "current.json", url: `${baseUrl}/api/public/vmix/current` },
    { label: "standings.json", url: `${baseUrl}/api/public/vmix/standings` },
    { label: "home-lineup.json", url: `${baseUrl}/api/public/vmix/home-lineup` },
    { label: "away-lineup.json", url: `${baseUrl}/api/public/vmix/away-lineup` },
  ];

  if (!adminQuery.data?.isAdmin) {
    return (
      <div className="p-6">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Hem
          </Link>
          <h1 className="text-2xl font-semibold">vMix broadcast data</h1>
          <p className="text-sm text-muted-foreground">
            Publicera dagens Grästorps IK-match som JSON-feeds för vMix GT Designer.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {activeQuery.data ? (
            <Badge variant="default">LIVE</Badge>
          ) : (
            <Badge variant="outline">Ingen aktiv publicering</Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">vMix-endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Klistra in i vMix Data Sources → Web (JSON). Poll-intervall 5–15 s rekommenderas.
          </p>
          <ul className="space-y-1">
            {endpoints.map((e) => (
              <li key={e.url} className="flex items-center gap-2 rounded border bg-muted/40 px-2 py-1 text-xs">
                <span className="font-mono w-36 shrink-0">{e.label}</span>
                <span className="font-mono truncate">{e.url}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 gap-1"
                  onClick={() => {
                    navigator.clipboard.writeText(e.url);
                    toast.success("Kopierad");
                  }}
                >
                  <Copy className="h-3 w-3" /> Kopiera
                </Button>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline text-xs inline-flex items-center gap-1"
                >
                  <Download className="h-3 w-3" /> Öppna
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <EndpointTester endpoints={endpoints} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Matchinställningar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Datum</Label>
            <Input type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} />
          </div>
          <div>
            <Label>Arena</Label>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ishuset Grästorp" />
          </div>
          <div>
            <Label>Hemmalag</Label>
            <Select value={homeTeam} onValueChange={setHomeTeam}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bortalag</Label>
            <Select value={awayTeam} onValueChange={setAwayTeam}>
              <SelectTrigger><SelectValue placeholder="Välj bortalag" /></SelectTrigger>
              <SelectContent>
                {opponents.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Anteckningar</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kommentatorsnoteringar (visas i current.json)" />
          </div>
        </CardContent>
      </Card>

      <LineupEditor
        title="Hemmalag – lineup"
        team={homeTeam}
        lineup={homeLineup}
        setLineup={setHomeLineup}
        onPrefill={() => prefillHome.mutate()}
        prefilling={prefillHome.isPending}
      />

      <LineupEditor
        title="Bortalag – lineup"
        team={awayTeam || "(välj bortalag)"}
        lineup={awayLineup}
        setLineup={setAwayLineup}
        onPrefill={() => awayTeam && prefillAway.mutate()}
        prefilling={prefillAway.isPending}
        disablePrefill={!awayTeam}
      />

      <div className="flex flex-wrap items-center gap-2 sticky bottom-2 bg-background/95 backdrop-blur border rounded-lg p-3">
        <Button
          size="lg"
          disabled={publishMut.isPending || !awayTeam}
          onClick={() => publishMut.mutate()}
        >
          {publishMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Publicera till vMix
        </Button>
        <Button
          variant="outline"
          disabled={unpublishMut.isPending || !activeQuery.data}
          onClick={() => unpublishMut.mutate()}
        >
          Avpublicera
        </Button>
        {activeQuery.data && (
          <span className="text-xs text-muted-foreground ml-auto">
            Publicerad {new Date(activeQuery.data.publishedAt).toLocaleString("sv-SE")}
          </span>
        )}
      </div>
    </div>
  );
}

function LineupEditor({
  title,
  team,
  lineup,
  setLineup,
  onPrefill,
  prefilling,
  disablePrefill,
}: {
  title: string;
  team: string;
  lineup: VmixLineupInput;
  setLineup: (l: VmixLineupInput) => void;
  onPrefill: () => void;
  prefilling: boolean;
  disablePrefill?: boolean;
}) {
  const updateList = (
    kind: "goalies" | "skaters",
    idx: number,
    patch: Partial<Player>,
  ) => {
    const list = [...lineup[kind]];
    list[idx] = { ...list[idx], ...patch };
    setLineup({ ...lineup, [kind]: list });
  };
  const addRow = (kind: "goalies" | "skaters") => {
    const newPlayer: Player = { number: null, name: "", position: kind === "goalies" ? "G" : null, line: null };
    setLineup({ ...lineup, [kind]: [...lineup[kind], newPlayer] });
  };
  const removeRow = (kind: "goalies" | "skaters", idx: number) => {
    setLineup({ ...lineup, [kind]: lineup[kind].filter((_, i) => i !== idx) });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {title} · <span className="font-normal text-muted-foreground">{team}</span>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onPrefill} disabled={prefilling || disablePrefill}>
          {prefilling && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Hämta från roster
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Målvakter</div>
            <Button size="sm" variant="ghost" onClick={() => addRow("goalies")}>
              <Plus className="h-3 w-3 mr-1" /> Lägg till
            </Button>
          </div>
          <PlayerTable
            players={lineup.goalies}
            onChange={(i, p) => updateList("goalies", i, p)}
            onRemove={(i) => removeRow("goalies", i)}
            showLine={false}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Utespelare</div>
            <Button size="sm" variant="ghost" onClick={() => addRow("skaters")}>
              <Plus className="h-3 w-3 mr-1" /> Lägg till
            </Button>
          </div>
          <PlayerTable
            players={lineup.skaters}
            onChange={(i, p) => updateList("skaters", i, p)}
            onRemove={(i) => removeRow("skaters", i)}
            showLine
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Tränare</Label>
            <Input
              value={lineup.coach ?? ""}
              onChange={(e) => setLineup({ ...lineup, coach: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Anteckningar</Label>
            <Input
              value={lineup.notes ?? ""}
              onChange={(e) => setLineup({ ...lineup, notes: e.target.value || null })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlayerTable({
  players,
  onChange,
  onRemove,
  showLine,
}: {
  players: Player[];
  onChange: (idx: number, patch: Partial<Player>) => void;
  onRemove: (idx: number) => void;
  showLine: boolean;
}) {
  if (players.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Inga spelare tillagda ännu.</p>;
  }
  return (
    <div className="space-y-1">
      {players.map((p, i) => (
        <div key={i} className="grid grid-cols-12 gap-1 items-center">
          <Input
            className="col-span-2 h-8"
            placeholder="#"
            inputMode="numeric"
            value={p.number ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange(i, { number: Number.isFinite(n) && e.target.value ? n : null });
            }}
          />
          <Input
            className="col-span-5 h-8"
            placeholder="Namn"
            value={p.name}
            onChange={(e) => onChange(i, { name: e.target.value })}
          />
          <Input
            className="col-span-2 h-8"
            placeholder="Pos"
            value={p.position ?? ""}
            onChange={(e) => onChange(i, { position: e.target.value || null })}
          />
          {showLine ? (
            <Input
              className="col-span-2 h-8"
              placeholder="Kedja"
              inputMode="numeric"
              value={p.line ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                onChange(i, { line: Number.isFinite(n) && e.target.value ? n : null });
              }}
            />
          ) : (
            <div className="col-span-2" />
          )}
          <Button variant="ghost" size="sm" className="col-span-1 h-8 w-8 p-0" onClick={() => onRemove(i)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

type EndpointResult = {
  status: "idle" | "loading" | "ok" | "error";
  httpStatus?: number;
  ms?: number;
  body?: unknown;
  error?: string;
  fetchedAt?: string;
};

function EndpointTester({
  endpoints,
}: {
  endpoints: { label: string; url: string }[];
}) {
  const [results, setResults] = useState<Record<string, EndpointResult>>({});
  const [autoRefresh, setAutoRefresh] = useState(false);

  const runOne = async (url: string) => {
    setResults((r) => ({ ...r, [url]: { ...r[url], status: "loading" } }));
    const t0 = performance.now();
    try {
      const res = await fetch(url, { cache: "no-store" });
      const ms = Math.round(performance.now() - t0);
      const text = await res.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* keep as text */ }
      setResults((r) => ({
        ...r,
        [url]: {
          status: res.ok ? "ok" : "error",
          httpStatus: res.status,
          ms,
          body,
          fetchedAt: new Date().toISOString(),
          error: res.ok ? undefined : `HTTP ${res.status}`,
        },
      }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [url]: {
          status: "error",
          ms: Math.round(performance.now() - t0),
          error: (e as Error).message,
          fetchedAt: new Date().toISOString(),
        },
      }));
    }
  };

  const runAll = () => endpoints.forEach((e) => runOne(e.url));

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(runAll, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, endpoints]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Testa endpoints</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Hämtar varje JSON-feed live och visar status, svarstid och preview.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={autoRefresh ? "default" : "outline"}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            Auto 10s {autoRefresh ? "på" : "av"}
          </Button>
          <Button size="sm" variant="outline" onClick={runAll}>
            <RefreshCw className="h-3 w-3 mr-1" /> Testa alla
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {endpoints.map((e) => {
          const r = results[e.url];
          return (
            <div key={e.url} className="rounded border bg-muted/30 p-2 text-xs">
              <div className="flex items-center gap-2">
                <StatusBadge result={r} />
                <span className="font-mono font-medium">{e.label}</span>
                {r?.ms !== undefined && (
                  <span className="text-muted-foreground">{r.ms} ms</span>
                )}
                {r?.httpStatus !== undefined && (
                  <span className="text-muted-foreground">HTTP {r.httpStatus}</span>
                )}
                {r?.fetchedAt && (
                  <span className="text-muted-foreground ml-1">
                    · {new Date(r.fetchedAt).toLocaleTimeString("sv-SE")}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6"
                  onClick={() => runOne(e.url)}
                  disabled={r?.status === "loading"}
                >
                  {r?.status === "loading" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </Button>
              </div>
              {r?.error && (
                <p className="mt-1 text-destructive">{r.error}</p>
              )}
              {r?.body !== undefined && (
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
                  {typeof r.body === "string"
                    ? r.body.slice(0, 4000)
                    : JSON.stringify(r.body, null, 2).slice(0, 4000)}
                </pre>
              )}
              {!r && (
                <p className="mt-1 text-muted-foreground italic">Inte testad ännu.</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ result }: { result?: EndpointResult }) {
  if (!result || result.status === "idle") return <Badge variant="outline">–</Badge>;
  if (result.status === "loading")
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Hämtar
      </Badge>
    );
  if (result.status === "ok")
    return (
      <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> OK
      </Badge>
    );
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" /> Fel
    </Badge>
  );
}
