import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Settings2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import { getTodaysMatchup, listTeams } from "@/lib/stats.functions";
import {
  emptySlots,
  fetchTeamRoster,
  getActivePublication,
  getPublicationHistory,
  getTeamLogoCodes,
  publishVmix,
  restorePublication,
  SLOT_KEYS,
  syncTeamLogoCodes,
  unpublishVmix,
  updateTeamLogoCode,
  type RosterPlayer,
  type SlotPlayer,
  type TeamLogoCode,
  type VmixLineupSlots,
  type VmixPublicationRow,
} from "@/lib/vmix.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

function countFilledSlots(slots: VmixLineupSlots): { goalies: number; skaters: number } {
  let g = 0;
  let s = 0;
  for (const k of SLOT_KEYS) {
    const p = slots[k];
    if (!p || !p.name) continue;
    if (k === "GK1" || k === "GK2") g++;
    else s++;
  }
  return { goalies: g, skaters: s };
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
  const fetchCodes = useServerFn(getTeamLogoCodes);
const syncCodes = useServerFn(syncTeamLogoCodes);
const updateCode = useServerFn(updateTeamLogoCode);

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

  

  const codesQuery = useQuery({
    queryKey: ["vmix-codes"],
    queryFn: () => fetchCodes(),
    enabled: !!adminQuery.data?.isAdmin,
  });

  const activeQuery = useQuery({
    queryKey: ["vmix-active"],
    queryFn: () => fetchActive(),
    enabled: !!adminQuery.data?.isAdmin,
  });

  const teams: string[] = teamsQuery.data?.teams ?? [];




 const [homeTeam, setHomeTeam] = useState<string>(DEFAULT_TEAM);
  const [awayTeam, setAwayTeam] = useState<string>("");
  const [venue, setVenue] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  
  
  const [homeSlots, setHomeSlots] = useState<VmixLineupSlots>(() =>
    emptySlots(DEFAULT_TEAM, ""),
  );
  const [awaySlots, setAwaySlots] = useState<VmixLineupSlots>(() =>
    emptySlots("", ""),
  );
  const [homePool, setHomePool] = useState<RosterPlayer[]>([]);
  const [awayPool, setAwayPool] = useState<RosterPlayer[]>([]);
  const [sourceMode, setSourceMode] = useState<
    "idle" | "auto" | "manual" | "live-hydrated"
  >("idle");
  const [autoApplied, setAutoApplied] = useState(false);

  // Hydrate from active publication (once).
  useEffect(() => {
    const pub = activeQuery.data;
    if (!pub) return;
    setHomeTeam(pub.homeTeam);
    setAwayTeam(pub.awayTeam);
    setVenue(pub.venue ?? "");
    setNotes(pub.notes ?? "");
    setHomeSlots(pub.homeSlots);
    setAwaySlots(pub.awaySlots);
    setSourceMode("live-hydrated");
    setAutoApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuery.data?.id]);

  const prevHomeTeamRef = useRef(homeTeam);
  const prevAwayTeamRef = useRef(awayTeam);

  const opponents = useMemo(
    () => teams.filter((t) => t !== homeTeam),
    [teams, homeTeam],
  );

  // Build a team-name → logo-code lookup from the database cache.
  const codesMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of codesQuery.data ?? []) m[c.teamName] = c.logoCode;
    return m;
  }, [codesQuery.data]);

  // Combined team-sync + auto-fill effect. Merging these into one effect
  // is critical: if team-sync ran as a separate earlier effect, its
  // setState callback would update prev.team BEFORE the auto-fill
  // callback runs, making codesMap[prev.team] return the NEW team's code
  // instead of the OLD team's code. With one combined callback, prev.team
  // still holds the old value when we check the auto-fill condition.
  useEffect(() => {
    const teamChanged = homeTeam !== prevHomeTeamRef.current;
    prevHomeTeamRef.current = homeTeam;
    const code = codesMap[homeTeam];
    setHomeSlots((prev) => {
      const updates: Partial<VmixLineupSlots> & { team: string } = { team: homeTeam };
      // Auto-fill when the team changes (the old code belongs to the old
      // team), or when the code field is still empty (first load / reset).
      if (code && (teamChanged || !prev.teamCode)) {
        updates.teamCode = code;
      }
      return { ...prev, ...updates };
    });
  }, [homeTeam, codesMap]);

  useEffect(() => {
    const teamChanged = awayTeam !== prevAwayTeamRef.current;
    prevAwayTeamRef.current = awayTeam;
    const code = codesMap[awayTeam];
    setAwaySlots((prev) => {
      const updates: Partial<VmixLineupSlots> & { team: string } = { team: awayTeam };
      if (code && (teamChanged || !prev.teamCode)) {
        updates.teamCode = code;
      }
      return { ...prev, ...updates };
    });
  }, [awayTeam, codesMap]);

  const prefillHome = useMutation({
    mutationFn: () => fetchRoster({ data: { team: homeTeam } }),
    onSuccess: (pool) => {
      setHomePool(pool);
      toast.success(
        `Hemmaroster laddad – ${pool.length} spelare tillgängliga i listorna`,
      );
    },
    onError: (e) => toast.error(`Fel: ${(e as Error).message}`),
  });
  const prefillAway = useMutation({
    mutationFn: () => fetchRoster({ data: { team: awayTeam } }),
    onSuccess: (pool) => {
      setAwayPool(pool);
      toast.success(
        `Bortaroster laddad – ${pool.length} spelare tillgängliga i listorna`,
      );
    },
    onError: (e) => toast.error(`Fel: ${(e as Error).message}`),
  });
  const publishMut = useMutation({
    mutationFn: () =>
      publish({
        data: {
          homeTeam,
          awayTeam,
          homeTeamCode: homeSlots.teamCode,
          awayTeamCode: awaySlots.teamCode,
          venue: venue || null,
          notes: notes || null,
          homeSlots,
          awaySlots,
        },
      }),
    onSuccess: () => {
      toast.success("Publicerat till vMix");
      queryClient.invalidateQueries({ queryKey: ["vmix-active"] });
    },
    onError: (e) =>
      toast.error(`Publicering misslyckades: ${(e as Error).message}`),
  });

  const unpublishMut = useMutation({
    mutationFn: () => unpublish({}),
    onSuccess: () => {
      toast.success("Avpublicerat");
      queryClient.invalidateQueries({ queryKey: ["vmix-active"] });
    },
    onError: (e) => toast.error(`Fel: ${(e as Error).message}`),
  });

  const todaysQuery = useQuery({
    queryKey: ["vmix-todays-matchup"],
    queryFn: () => fetchTodays({ data: {} }),
    enabled: !!adminQuery.data?.isAdmin,
    staleTime: 5 * 60_000,
  });

  const applyMatchup = async (
    home: string,
    away: string,
    source: "auto" | "manual",
  ) => {
    setHomeTeam(home);
    setAwayTeam(away);
    setSourceMode(source);
    // Always start with empty slots for a new matchup – the producer fills
    // each slot deliberately using the dropdown list.
    setHomeSlots(emptySlots(home, codesMap[home] ?? ""));
    setAwaySlots(emptySlots(away, codesMap[away] ?? ""));
    try {
      const [homePool, awayPool] = await Promise.all([
        fetchRoster({ data: { team: home } }),
        fetchRoster({ data: { team: away } }),
      ]);
      setHomePool(homePool);
      setAwayPool(awayPool);
      toast.success(
        `Dagens hemmamatch laddad: ${home} vs ${away} – välj spelare i listorna`,
      );
    } catch (e) {
      toast.error(`Kunde inte hämta roster: ${(e as Error).message}`);
    }
  };

  const resetToManual = () => {
    setHomeTeam(DEFAULT_TEAM);
    setAwayTeam("");
    setHomeSlots(emptySlots(DEFAULT_TEAM, codesMap[DEFAULT_TEAM] ?? ""));
    setAwaySlots(emptySlots("", ""));
    setHomePool([]);
    setAwayPool([]);
    setSourceMode("manual");
    toast.info("Formuläret återställt – välj lag och ladda spelarlistan.");
  };

  const [autoFetchTrigger, setAutoFetchTrigger] = useState(0);

  useEffect(() => {
    if (autoApplied) return;
    if (!todaysQuery.data) return;
    if (activeQuery.data) return;
    const m = todaysQuery.data.match;
    if (m && m.home === DEFAULT_TEAM) {
      setAutoApplied(true);
      void applyMatchup(m.home, m.away, "auto");
      setAutoFetchTrigger((n) => n + 1);
      toast.info("Hemmamatch idag – hämtar JSON-endpoints automatiskt…");
    } else {
      setAutoApplied(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaysQuery.data, activeQuery.data, autoApplied]);

  const rerunAuto = async () => {
    const res = await todaysQuery.refetch();
    const m = res.data?.match;
    if (m && m.home === DEFAULT_TEAM) {
      await applyMatchup(m.home, m.away, "auto");
      setAutoFetchTrigger((n) => n + 1);
    } else {
      setSourceMode("auto");
      toast.info(`Ingen hemmamatch hittad för ${DEFAULT_TEAM} idag.`);
    }
  };

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const clubId = "570";
  const lineupVersion = "0";

  const endpoints = [
  { label: "standings.json", url: `${baseUrl}/api/public/vmix/standings` },
  {
    label: "lineup.json",
    url: `${baseUrl}/api/public/vmix/lineup/${lineupVersion}?ClubId=${clubId}`,
  },
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
      <header className="space-y-4">
        <AdminNav />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">vMix broadcast data</h1>
            <p className="text-sm text-muted-foreground">
              Publicera dagens Grästorps IK-match som JSON-feeds för vMix GT
              Designer.
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
      </header>



      <TeamCodesCard
        codes={codesQuery.data ?? []}
        loading={codesQuery.isLoading}
        onSync={async () => {
          const result = await syncCodes({ data: {} });
          await queryClient.invalidateQueries({ queryKey: ["vmix-codes"] });
          toast.success(
            `Synkat ${result.synced} koder från Swehockey` +
              (result.skippedManual > 0
                ? ` (${result.skippedManual} manuella overrides bevarade)`
                : ""),
          );
        }}
        onUpdate={async (teamName, logoCode) => {
          await updateCode({ data: { teamName, logoCode } });
          await queryClient.invalidateQueries({ queryKey: ["vmix-codes"] });
          toast.success(`Kod uppdaterad: ${teamName} → ${logoCode}`);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">vMix-endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Klistra in i vMix Data Sources → Web (JSON). Poll-intervall 5–15 s
            rekommenderas. <span className="font-mono">lineup.json</span> speglar
            det riktiga Swehockey-API:t – byt bara domännamn i vMix för att växla
            från primär till backup.
          </p>
          <ul className="space-y-1">
            {endpoints.map((e) => (
              <li
                key={e.url}
                className="flex items-center gap-2 rounded border bg-muted/40 px-2 py-1 text-xs"
              >
                <span className="font-mono w-36 shrink-0">{e.label}</span>
                <span className="font-mono truncate">{e.url}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 gap-1"
                  onClick={async () => {
                    try {
                      if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(e.url);
                      } else {
                        throw new Error("Clipboard API unavailable");
                      }
                      toast.success("Kopierad");
                    } catch {
                      const ta = document.createElement("textarea");
                      ta.value = e.url;
                      ta.style.position = "fixed";
                      ta.style.opacity = "0";
                      document.body.appendChild(ta);
                      ta.select();
                      try {
                        document.execCommand("copy");
                        toast.success("Kopierad");
                      } catch {
                        toast.error("Kunde inte kopiera – markera manuellt");
                      }
                      document.body.removeChild(ta);
                    }
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

      <EndpointTester endpoints={endpoints} autoFetchTrigger={autoFetchTrigger} />

      <DataSourceCard
        sourceMode={sourceMode}
        loading={todaysQuery.isLoading}
        todayDate={todaysQuery.data?.date ?? null}
        match={todaysQuery.data?.match ?? null}
        currentHome={homeTeam}
        currentAway={awayTeam}
        onResetManual={resetToManual}
        onRerunAuto={rerunAuto}
        hasLive={!!activeQuery.data}
      />

      
      <SlotLineupEditor
        title="Hemmalag – lineup"
        teamName={homeTeam}
        onTeamChange={setHomeTeam}
        teams={teams}
        slots={homeSlots}
        setSlots={setHomeSlots}
        onPrefill={() => prefillHome.mutate()}
        prefilling={prefillHome.isPending}
        pool={homePool}
      />

      <SlotLineupEditor
        title="Bortalag – lineup"
        teamName={awayTeam || ""}
        onTeamChange={setAwayTeam}
        teams={opponents}
        placeholder="(välj bortalag)"
        slots={awaySlots}
        setSlots={setAwaySlots}
        onPrefill={() => awayTeam && prefillAway.mutate()}
        prefilling={prefillAway.isPending}
        disablePrefill={!awayTeam}
        pool={awayPool}
      />

      <div className="flex flex-wrap items-center gap-2 sticky bottom-2 bg-background/95 backdrop-blur border rounded-lg p-3">
        <Button
          size="lg"
          disabled={publishMut.isPending || !awayTeam}
          onClick={() => publishMut.mutate()}
        >
          {publishMut.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
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
            Publicerad{" "}
            {new Date(activeQuery.data.publishedAt).toLocaleString("sv-SE")}
            {" · inkl. tabell"}
          </span>
        )}
      </div>
    </div>
  );
}




// ---------- Team logo codes ----------

function TeamCodesCard({
  codes,
  loading,
  onSync,
  onUpdate,
}: {
  codes: TeamLogoCode[];
  loading: boolean;
  onSync: () => Promise<void>;
  onUpdate: (teamName: string, logoCode: string) => Promise<void>;
}) {
  const [syncing, setSyncing] = useState(false);
  const [editTeam, setEditTeam] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (teamName: string, currentCode: string) => {
    setEditTeam(teamName);
    setEditValue(currentCode);
  };

  const cancelEdit = () => {
    setEditTeam(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editTeam || !editValue.trim()) return;
    setSaving(true);
    try {
      await onUpdate(editTeam, editValue.trim().toUpperCase());
      setEditTeam(null);
      setEditValue("");
    } catch (e) {
      toast.error(`Kunde inte spara: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Logotypkoder
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Kopplar lagnamn till filnamn för logotyper (t.ex. GRÄ →
            GRA_small.png). Synka från Swehockey eller skriv in manuellt.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            try {
              await onSync();
            } catch (e) {
              toast.error(`Synk misslyckades: ${(e as Error).message}`);
            } finally {
              setSyncing(false);
            }
          }}
        >
          {syncing ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Synka från Swehockey
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar koder…
          </div>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga logotypkoder laddade. Klicka <em>Synka från Swehockey</em> för
            att hämta koderna automatiskt.
          </p>
        ) : (
          <div className="grid gap-1">
            {codes.map((c) => (
              <div
                key={c.teamName}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/40"
              >
                <span className="w-48 truncate">{c.teamName}</span>
                {editTeam === c.teamName ? (
                  <>
                    <Input
                      className="h-6 w-20 px-1 text-xs uppercase"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      disabled={saving || !editValue.trim()}
                      onClick={saveEdit}
                    >
                      {saving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Spara"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={cancelEdit}
                    >
                      Avbryt
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="font-mono font-medium w-12">
                      {c.logoCode}
                    </span>
                    {c.source === "manual" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0"
                      >
                        manuell
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs ml-auto"
                      onClick={() => startEdit(c.teamName, c.logoCode)}
                    >
                      Ändra
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Slot-based lineup editor ----------

const DEF_ROWS = [1, 2, 3, 4, 5] as const;
const FWD_ROWS = [1, 2, 3, 4, 5] as const;

function SlotInputs({
  slot,
  value,
  onChange,
  pool = [],
}: {
  slot: string;
  value: SlotPlayer;
  onChange: (v: SlotPlayer) => void;
  pool?: RosterPlayer[];
}) {
  const number = value?.number ?? "";
  const name = value?.name ?? "";

  const commit = (patch: { number?: number | string; name?: string }) => {
    const next = {
      number: patch.number !== undefined ? patch.number : number,
      name: patch.name !== undefined ? patch.name : name,
    };
    if (!String(next.number).trim() && !String(next.name).trim()) {
      onChange(null);
    } else {
      onChange({
        name: String(next.name).toUpperCase(),
        number: next.number,
      });
    }
  };

  // Find the pool index of the currently assigned player so the dropdown
  // shows the right selected option. Returns -1 if the player is not in
  // the pool (i.e. was entered manually or slot is empty).
  const selectedIdx = pool.findIndex(
    (p) =>
      String(p.number) === String(number) &&
      p.name.toUpperCase() === String(name).toUpperCase(),
  );

  const handleDropdown = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "") {
      onChange(null);
      return;
    }
    const idx = parseInt(val, 10);
    if (!Number.isNaN(idx) && pool[idx]) {
      const p = pool[idx];
      onChange({ name: p.name, number: p.number });
    }
  };

  // Split pool into display groups for <optgroup> labels.
  const goalies = pool.filter((p) => /^(GK|MV)$/i.test(p.position ?? ""));
  const defenders = pool.filter((p) => /^(LD|RD|D|B)$/i.test(p.position ?? ""));
  const forwards = pool.filter(
    (p) => p.position && !/^(GK|MV|LD|RD|D|B)$/i.test(p.position),
  );
  const other = pool.filter((p) => !p.position);

  return (
    <div className="space-y-1">
      {/* Dropdown – only visible once a roster pool has been loaded */}
      {pool.length > 0 && (
        <select
          className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
          value={selectedIdx >= 0 ? String(selectedIdx) : ""}
          onChange={handleDropdown}
        >
          <option value="">– Välj spelare –</option>
          {goalies.length > 0 && (
            <optgroup label="Målvakter">
              {goalies.map((p) => (
                <option key={pool.indexOf(p)} value={String(pool.indexOf(p))}>
                  #{p.number} – {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {defenders.length > 0 && (
            <optgroup label="Backar">
              {defenders.map((p) => (
                <option key={pool.indexOf(p)} value={String(pool.indexOf(p))}>
                  #{p.number} – {p.name} ({p.position})
                </option>
              ))}
            </optgroup>
          )}
          {forwards.length > 0 && (
            <optgroup label="Forwards">
              {forwards.map((p) => (
                <option key={pool.indexOf(p)} value={String(pool.indexOf(p))}>
                  #{p.number} – {p.name} ({p.position})
                </option>
              ))}
            </optgroup>
          )}
          {other.length > 0 && (
            <optgroup label="Övrigt">
              {other.map((p) => (
                <option key={pool.indexOf(p)} value={String(pool.indexOf(p))}>
                  #{p.number} – {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
      {/* Text inputs – always shown as fallback for manual entry of players
          not in the roster pool (call-ups, loan players, etc.) */}
      <div className="flex items-center gap-1">
        <div className="text-[10px] font-mono w-8 shrink-0 text-muted-foreground">
          {slot}
        </div>
        <Input
          className="h-7 w-12 px-1 text-xs"
          placeholder="#"
          inputMode="numeric"
          value={String(number)}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) return commit({ number: "" });
            const n = Number(raw);
            commit({ number: Number.isFinite(n) ? n : raw });
          }}
        />
        <Input
          className="h-7 flex-1 text-xs"
          placeholder="EFTERNAMN, FÖRNAMN"
          value={name}
          onChange={(e) => commit({ name: e.target.value })}
        />
      </div>
    </div>
  );
}

function SlotLineupEditor({
  title,
  teamName,
  onTeamChange,
  teams,
  placeholder,
  slots,
  setSlots,
  onPrefill,
  prefilling,
  disablePrefill,
  pool = [],
}: {
  title: string;
  teamName: string;
  onTeamChange: (v: string) => void;
  teams: string[];
  placeholder?: string;
  slots: VmixLineupSlots;
  setSlots: React.Dispatch<React.SetStateAction<VmixLineupSlots>>;
  onPrefill: () => void;
  prefilling: boolean;
  disablePrefill?: boolean;
  pool?: RosterPlayer[];
}) {
  const setSlot = (key: keyof VmixLineupSlots, v: SlotPlayer) => {
    setSlots((prev) => ({ ...prev, [key]: v }));
  };
  const filled = countFilledSlots(slots);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {filled.goalies} MV · {filled.skaters} utespelare
            </p>
          </div>
          <div className="w-48">
            <Label className="text-[11px]">Lag</Label>
            <Select value={teamName} onValueChange={onTeamChange}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder={placeholder ?? "Välj lag"} />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <Label className="text-[11px]">Logotypkod</Label>
            <Input
              className="h-8 uppercase"
              maxLength={5}
              placeholder="t.ex. GRÄ"
              value={slots.teamCode}
              onChange={(e) =>
                setSlots((prev) => ({
                  ...prev,
                  teamCode: e.target.value.toUpperCase(),
                }))
              }
            />
          </div>
         <Button
            size="sm"
            variant="outline"
            onClick={onPrefill}
            disabled={prefilling || disablePrefill}
          >
            {prefilling && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Ladda spelarlistan
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Målvakter */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Målvakter
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <SlotInputs
              slot="MV1"
              value={slots.GK1}
              onChange={(v) => setSlot("GK1", v)}
              pool={pool}
            />
            <SlotInputs
              slot="MV2"
              value={slots.GK2}
              onChange={(v) => setSlot("GK2", v)}
              pool={pool}
            />
          </div>
        </section>

        {/* Backpar */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Backpar
          </h3>
          <div className="grid gap-2 sm:grid-cols-3 text-[11px] font-medium text-muted-foreground">
            <div>LD (Vänster)</div>
            <div>RD (Höger)</div>
            <div>XD (Extra back)</div>
          </div>
          <div className="mt-1 space-y-2">
            {DEF_ROWS.map((row) => (
              <div key={row} className="grid gap-2 sm:grid-cols-3">
                <SlotInputs
                  slot={`LD${row}`}
                  value={slots[`LD${row}` as keyof VmixLineupSlots] as SlotPlayer}
                  onChange={(v) =>
                    setSlot(`LD${row}` as keyof VmixLineupSlots, v)
                  }
                  pool={pool}
                />
                <SlotInputs
                  slot={`RD${row}`}
                  value={slots[`RD${row}` as keyof VmixLineupSlots] as SlotPlayer}
                  onChange={(v) =>
                    setSlot(`RD${row}` as keyof VmixLineupSlots, v)
                  }
                  pool={pool}
                />
                <SlotInputs
                  slot={`XD${row}`}
                  value={slots[`XD${row}` as keyof VmixLineupSlots] as SlotPlayer}
                  onChange={(v) =>
                    setSlot(`XD${row}` as keyof VmixLineupSlots, v)
                  }
                  pool={pool}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Forwards */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Forwards
          </h3>
          <div className="grid gap-2 sm:grid-cols-3 text-[11px] font-medium text-muted-foreground">
            <div>LW (Vänster)</div>
            <div>C (Center)</div>
            <div>RW (Höger)</div>
          </div>
          <div className="mt-1 space-y-2">
            {FWD_ROWS.map((row) => (
              <div key={row} className="grid gap-2 sm:grid-cols-3">
                <SlotInputs
                  slot={`LW${row}`}
                  value={slots[`LW${row}` as keyof VmixLineupSlots] as SlotPlayer}
                  onChange={(v) =>
                    setSlot(`LW${row}` as keyof VmixLineupSlots, v)
                  }
                  pool={pool}
                />
                <SlotInputs
                  slot={`C${row}`}
                  value={slots[`C${row}` as keyof VmixLineupSlots] as SlotPlayer}
                  onChange={(v) =>
                    setSlot(`C${row}` as keyof VmixLineupSlots, v)
                  }
                  pool={pool}
                />
                <SlotInputs
                  slot={`RW${row}`}
                  value={slots[`RW${row}` as keyof VmixLineupSlots] as SlotPlayer}
                  onChange={(v) =>
                    setSlot(`RW${row}` as keyof VmixLineupSlots, v)
                  }
                  pool={pool}
                />
              </div>
            ))}
            {row5Hint()}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function row5Hint() {
  return (
    <p className="text-[10px] italic text-muted-foreground">
      Rad 5 = (Extra)
    </p>
  );
}

// ---------- Endpoint tester ----------

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
  autoFetchTrigger,
}: {
  endpoints: { label: string; url: string }[];
  autoFetchTrigger?: number;
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
      try {
        body = JSON.parse(text);
      } catch {
        /* keep as text */
      }
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

  // Automatically fetch all endpoints when parent signals a home game was detected.
  useEffect(() => {
    if (!autoFetchTrigger) return;
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchTrigger]);


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
            <div
              key={e.url}
              className="rounded border bg-muted/30 p-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <StatusBadge result={r} />
                <span className="font-mono font-medium">{e.label}</span>
                {r?.ms !== undefined && (
                  <span className="text-muted-foreground">{r.ms} ms</span>
                )}
                {r?.httpStatus !== undefined && (
                  <span className="text-muted-foreground">
                    HTTP {r.httpStatus}
                  </span>
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
              {r?.error && <p className="mt-1 text-destructive">{r.error}</p>}
              {r?.body !== undefined && (
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
                  {typeof r.body === "string"
                    ? r.body
                    : JSON.stringify(r.body, null, 2)}
                </pre>
              )}
              {!r && (
                <p className="mt-1 text-muted-foreground italic">
                  Inte testad ännu.
                </p>
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
      <Badge
        variant="default"
        className="gap-1 bg-emerald-600 hover:bg-emerald-600"
      >
        <CheckCircle2 className="h-3 w-3" /> OK
      </Badge>
    );
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" /> Fel
    </Badge>
  );
}

// ---------- Data source (auto / manual) ----------

function DataSourceCard({
  sourceMode,
  loading,
  todayDate,
  match,
  currentHome,
  currentAway,
  onResetManual,
  onRerunAuto,
  hasLive,
}: {
  sourceMode: "idle" | "auto" | "manual" | "live-hydrated";
  loading: boolean;
  todayDate: string | null;
  match: { date: string | null; home: string; away: string } | null;
  currentHome: string;
  currentAway: string;
  onResetManual: () => void;
  onRerunAuto: () => void;
  hasLive: boolean;
}) {
  const isHomeGame = !!match && match.home === DEFAULT_TEAM;

  let badge: React.ReactNode;
  let message: React.ReactNode;
  if (loading && sourceMode === "idle") {
    badge = <Badge variant="outline">…</Badge>;
    message = "Hämtar dagens schema…";
  } else if (sourceMode === "manual") {
    badge = <Badge className="bg-amber-500 hover:bg-amber-500">MANUELL</Badge>;
    message = currentAway ? (
      <>
        Manuellt läge – <strong>{currentHome}</strong> vs{" "}
        <strong>{currentAway}</strong>.
      </>
    ) : (
      <>Manuellt läge – välj lag i lineup-korten nedan.</>
    );
  } else if (sourceMode === "live-hydrated") {
    badge = <Badge variant="default">LIVE</Badge>;
    message = (
      <>
        Formuläret återspeglar den nuvarande LIVE-publiceringen (
        <strong>{currentHome}</strong> vs <strong>{currentAway}</strong>).
      </>
    );
  } else if (isHomeGame) {
    badge = (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">AUTO</Badge>
    );
    message = (
      <>
        Hemmamatch hittad för {DEFAULT_TEAM}: <strong>{match!.home}</strong> vs{" "}
        <strong>{match!.away}</strong> ({match!.date ?? "TBD"}).
      </>
    );
  } else {
    badge = <Badge variant="outline">AUTO</Badge>;
    message = (
      <>
        Ingen hemmamatch hittad för {DEFAULT_TEAM} idag ({todayDate ?? "TBD"}).
        {match
          ? ` (Dagens match är ${match.home} vs ${match.away}, inte hemma.)`
          : ""}
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Datakälla
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2 text-sm">
          <div className="mt-0.5">{badge}</div>
          <p className="text-muted-foreground">{message}</p>
        </div>
        {hasLive && (
          <p className="text-xs text-muted-foreground">
            Obs: en LIVE-publicering är aktiv. Ändringar här påverkar inte
            JSON-feeden förrän du klickar <em>Publicera till vMix</em>.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onResetManual}>
            Använd manuell inmatning
          </Button>
          {(sourceMode === "manual" || sourceMode === "live-hydrated") && (
            <Button size="sm" variant="outline" onClick={onRerunAuto}>
              <RefreshCw className="h-3 w-3 mr-1" /> Använd dagens hittade match
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
