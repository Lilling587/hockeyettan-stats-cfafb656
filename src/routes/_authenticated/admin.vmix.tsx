import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Component, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Settings2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import { getTodaysMatchup, listSeasons, listPendingSeasons, scanForNewSeasons, listTeams } from "@/lib/stats.functions";
import { PendingSeasonsBanner } from "@/components/dashboard/pending-seasons-banner";
import {
  emptySlots,
  fetchTeamRoster,
  fetchTonightsLineup,
  getActivePublication,
  getAuditLog,
  getPublicationHistory,
  getTeamLogoCodes,
  publishVmix,
  refreshStandings,
  restorePublication,
  SLOT_KEYS,
  syncTeamLogoCodes,
  unpublishVmix,
  updateTeamLogoCode,
  type AuditLogRow,
  type LineupPreset,
  type RosterPlayer,
  type SlotPlayer,
  type TeamLogoCode,
  
  type VmixLineupSlots,
  type VmixPublicationRow,
  listLineupPresets,
  saveLineupPreset,
  deleteLineupPreset,
  fetchRosterByCompetition,
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
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

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
type SlotDiff = {
  slot: string;
  type: "added" | "removed" | "changed";
  oldName?: string;
  newName?: string;
};

function computeSlotDiff(
  oldSlots: VmixLineupSlots | null,
  newSlots: VmixLineupSlots,
  label: string,
): SlotDiff[] {
  const diffs: SlotDiff[] = [];
  for (const k of SLOT_KEYS) {
    const oldP = oldSlots?.[k];
    const newP = newSlots[k];
    const oldName = oldP?.name ?? "";
    const newName = newP?.name ?? "";
    if (oldName === newName) continue;
    if (!oldName && newName) {
      diffs.push({ slot: `${label} ${k}`, type: "added", newName });
    } else if (oldName && !newName) {
      diffs.push({ slot: `${label} ${k}`, type: "removed", oldName });
    } else {
      diffs.push({ slot: `${label} ${k}`, type: "changed", oldName, newName });
    }
  }
  return diffs;
}

function formatDiffSummary(diffs: SlotDiff[]): string {
  if (diffs.length === 0) return "Inga ändringar i lineup.";
  const added = diffs.filter((d) => d.type === "added").length;
  const removed = diffs.filter((d) => d.type === "removed").length;
  const changed = diffs.filter((d) => d.type === "changed").length;
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} tillagd${added > 1 ? "a" : ""}`);
  if (removed > 0) parts.push(`${removed} borttagen${removed > 1 ? "a" : ""}`);
  if (changed > 0) parts.push(`${changed} bytt${changed > 1 ? "a" : ""}`);
  return `${diffs.length} ändring${diffs.length > 1 ? "ar" : ""}: ${parts.join(", ")}.`;
}
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

class CardErrorBoundary extends Component<
  { children: ReactNode; title: string },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: ReactNode; title: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              {this.props.title} – kraschade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              {this.state.error?.message ?? "Okänt fel"}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => this.setState({ hasError: false })}
            >
              Försök igen
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

function VmixAdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchTeams = useServerFn(listTeams);
  const fetchSeasons = useServerFn(listSeasons);
  const fetchTodays = useServerFn(getTodaysMatchup);
  const fetchActive = useServerFn(getActivePublication);
  const fetchRoster = useServerFn(fetchTeamRoster);
  const fetchTonightsLineupFn = useServerFn(fetchTonightsLineup);
  
  const publish = useServerFn(publishVmix);
  const unpublish = useServerFn(unpublishVmix);
  const doRefreshStandings = useServerFn(refreshStandings);
  
  const fetchCodes = useServerFn(getTeamLogoCodes);
  const syncCodes = useServerFn(syncTeamLogoCodes);
  const updateCode = useServerFn(updateTeamLogoCode);
  const fetchHistory = useServerFn(getPublicationHistory);
  const restore = useServerFn(restorePublication);
  const fetchPresets = useServerFn(listLineupPresets);
  const savePreset = useServerFn(saveLineupPreset);
  const delPreset = useServerFn(deleteLineupPreset);
  const fetchAuditLog = useServerFn(getAuditLog);
  const runScan = useServerFn(scanForNewSeasons);
  const fetchPending = useServerFn(listPendingSeasons);
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

  const historyQuery = useQuery({
    queryKey: ["vmix-history"],
    queryFn: () => fetchHistory(),
    enabled: !!adminQuery.data?.isAdmin,
  });
const presetsQuery = useQuery({
    queryKey: ["vmix-presets"],
    queryFn: () => fetchPresets(),
    enabled: !!adminQuery.data?.isAdmin,
  });
  const activeQuery = useQuery({
    queryKey: ["vmix-active"],
    queryFn: () => fetchActive(),
    enabled: !!adminQuery.data?.isAdmin,
  });
  const auditQuery = useQuery({
    queryKey: ["vmix-audit"],
    queryFn: () => fetchAuditLog() as Promise<AuditLogRow[]>,
    enabled: !!adminQuery.data?.isAdmin,
  });

  const officialApiQuery = useQuery({
    queryKey: ["official-api-health"],
    queryFn: async () => {
      try {
        const res = await fetch(
          "https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570",
          { cache: "no-store" },
        );
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    },
   refetchInterval: activeQuery.data ? 60_000 : false,
    enabled: !!adminQuery.data?.isAdmin,
  });
const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: () => fetchSeasons(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const pendingQuery = useQuery({
    queryKey: ["season-detections"],
    queryFn: () => fetchPending(),
    staleTime: 5 * 60 * 1000,
    enabled: !!adminQuery.data?.isAdmin,
  });

  const scanMut = useMutation({
    mutationFn: () => runScan({ data: { force: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["season-detections"] }),
    onError: (e) => toast.error(`Skanning misslyckades: ${(e as Error).message}`),
  });

  const [adminSeason, setAdminSeason] = useState<string | undefined>(undefined);

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
  const [homeRosterError, setHomeRosterError] = useState<string | null>(null);
  const [awayRosterError, setAwayRosterError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<
    "idle" | "auto" | "manual" | "live-hydrated"
  >("idle");
  const [autoApplied, setAutoApplied] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

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
// Auto-save draft to localStorage every 5 seconds.
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraftRef = useRef<string>("");
  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        const draft = {
          homeTeam,
          awayTeam,
          homeSlots,
          awaySlots,
          venue,
          notes,
          savedAt: new Date().toISOString(),
        };
        const json = JSON.stringify(draft);
        if (json === lastDraftRef.current) return;
        lastDraftRef.current = json;
        localStorage.setItem("vmix-admin-draft", json);
      } catch {
        // localStorage full or unavailable — ignore silently
      }
    }, 5000);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [homeTeam, awayTeam, homeSlots, awaySlots, venue, notes]);

  // Check for existing draft on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vmix-admin-draft");
      if (raw) {
        const draft = JSON.parse(raw);
        // Only show restore if draft has actual content (an away team selected).
        if (draft.awayTeam) setHasDraft(true);
      }
   } catch {
      // corrupt or missing — ignore
    }
  }, []);

  // Session expiry warning — shows banner 5 minutes before JWT expires.
  useEffect(() => {
    let warningTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleWarning = (session: { expires_at?: number } | null) => {
      if (warningTimer) clearTimeout(warningTimer);
      if (!session?.expires_at) return;
      const warnAtMs = session.expires_at * 1000 - 5 * 60 * 1000;
      const msUntilWarning = warnAtMs - Date.now();
      if (msUntilWarning <= 0) {
        setSessionExpiryWarning(true);
        return;
      }
      setSessionExpiryWarning(false);
      warningTimer = setTimeout(() => setSessionExpiryWarning(true), msUntilWarning);
    };

    supabase.auth.getSession().then(({ data }) => scheduleWarning(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionExpiryWarning(false);
      scheduleWarning(session);
    });

    return () => {
      if (warningTimer) clearTimeout(warningTimer);
      listener.subscription.unsubscribe();
    };
  }, []);

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
// Filter presets to show only those involving the currently selected teams.
  const relevantPresets = useMemo(() => {
    const all = presetsQuery.data ?? [];
    if (!awayTeam) return { shown: all, hiddenCount: 0 };
    const matched = all.filter(
      (p) =>
        p.homeTeam === homeTeam ||
        p.awayTeam === homeTeam ||
        p.homeTeam === awayTeam ||
        p.awayTeam === awayTeam,
    );
    return {
      shown: matched.length > 0 ? matched : all,
      hiddenCount: matched.length > 0 ? all.length - matched.length : 0,
    };
  }, [presetsQuery.data, homeTeam, awayTeam]);
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
    mutationFn: () => fetchRoster({ data: { team: homeTeam, season: adminSeason } }),
    onSuccess: (pool) => {
      setHomePool(pool);
      setHomeRosterError(null);
      toast.success(
        `Hemmaroster laddad – ${pool.length} spelare tillgängliga i listorna`,
      );
    },
    onError: (e) => {
      const msg = (e as Error).message;
      setHomeRosterError(msg);
      toast.error(`Fel: ${msg}`);
    },
  });
  const prefillAway = useMutation({
    mutationFn: () => fetchRoster({ data: { team: awayTeam, season: adminSeason } }),
    onSuccess: (pool) => {
      setAwayPool(pool);
      setAwayRosterError(null);
      toast.success(
        `Bortaroster laddad – ${pool.length} spelare tillgängliga i listorna`,
      );
    },
    onError: (e) => {
      const msg = (e as Error).message;
      setAwayRosterError(msg);
      toast.error(`Fel: ${msg}`);
    },
  });
 const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetLabel, setPresetLabel] = useState("");

  const handleSavePreset = async () => {
    if (!presetLabel.trim()) return;
    try {
      await savePreset({
        data: {
          label: presetLabel.trim(),
          homeTeam,
          awayTeam,
          homeSlots,
        awaySlots,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["vmix-presets"] });
      setShowSavePreset(false);
      setPresetLabel("");
      toast.success("Mall sparad");
    } catch (e) {
      toast.error(`Kunde inte spara: ${(e as Error).message}`);
    }
  };

  const handleLoadPreset = (preset: LineupPreset) => {
    setHomeTeam(preset.homeTeam);
    setAwayTeam(preset.awayTeam);
    setHomeSlots(preset.homeSlots);
    setAwaySlots(preset.awaySlots);
    setSourceMode("manual");
    toast.success(`Mall laddad: ${preset.label}`);
  };

  const handleDeletePreset = async (id: number) => {
    try {
      await delPreset({ data: { id } });
      await queryClient.invalidateQueries({ queryKey: ["vmix-presets"] });
      toast.success("Mall borttagen");
    } catch (e) {
      toast.error(`Kunde inte ta bort: ${(e as Error).message}`);
    }
  };
  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem("vmix-admin-draft");
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.homeTeam) setHomeTeam(draft.homeTeam);
      if (draft.awayTeam) setAwayTeam(draft.awayTeam);
      if (draft.homeSlots) setHomeSlots(draft.homeSlots);
      if (draft.awaySlots) setAwaySlots(draft.awaySlots);
      if (draft.venue !== undefined) setVenue(draft.venue);
      if (draft.notes !== undefined) setNotes(draft.notes);
      setSourceMode("manual");
      setHasDraft(false);
      toast.success(
        `Utkast återställt (sparat ${new Date(draft.savedAt).toLocaleString("sv-SE")})`,
      );
    } catch {
      toast.error("Kunde inte läsa utkastet");
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem("vmix-admin-draft");
    } catch {
      // ignore
    }
    setHasDraft(false);
  };

  const handleExportJson = async () => {
    try {
      const url = `${window.location.origin}/api/public/vmix/lineup/0?ClubId=570`;
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      const blob = new Blob([text], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `vmix-lineup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success("JSON exporterad");
    } catch (e) {
      toast.error(`Kunde inte exportera: ${(e as Error).message}`);
    }
  };

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
      const prev = prePublishRef.current;
      const diffs = [
        ...computeSlotDiff(prev?.homeSlots ?? null, homeSlots, "H"),
        ...computeSlotDiff(prev?.awaySlots ?? null, awaySlots, "B"),
      ];
      setLastDiff(diffs);
      const summary = formatDiffSummary(diffs);
      toast.success(`Publicerat till vMix — ${summary}`);
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["vmix-active"] });
      queryClient.invalidateQueries({ queryKey: ["vmix-history"] });
    },
    onError: (e) =>
      toast.error(`Publicering misslyckades: ${(e as Error).message}`),
  });
const [showPublishConfirm, setShowPublishConfirm] = useState(false);
const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
const [showResetConfirm, setShowResetConfirm] = useState(false);
const [showEndBroadcastConfirm, setShowEndBroadcastConfirm] = useState(false);
const [sessionExpiryWarning, setSessionExpiryWarning] = useState(false);
const [puckDropTime, setPuckDropTime] = useState("");
const countdownTextRef = useRef<HTMLSpanElement>(null);
const countdownWrapRef = useRef<HTMLSpanElement>(null);

useEffect(() => {
  if (!puckDropTime) return;
  const [hh, mm] = puckDropTime.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return;
  const update = () => {
    if (!countdownTextRef.current || !countdownWrapRef.current) return;
    const now = new Date();
    const target = new Date(now);
    target.setHours(hh, mm, 0, 0);
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) {
      countdownTextRef.current.textContent = "SÄNDNING PÅGÅR";
      countdownWrapRef.current.className = "ml-auto font-mono text-sm text-emerald-500";
    } else {
      const totalSec = Math.floor(diffMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      countdownTextRef.current.textContent = `T-${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      countdownWrapRef.current.className = "ml-auto font-mono text-sm text-amber-500";
    }
  };
  update();
  const id = setInterval(update, 1000);
  return () => clearInterval(id);
}, [puckDropTime]);
  const [lastDiff, setLastDiff] = useState<SlotDiff[] | null>(null);
  const prePublishRef = useRef<VmixPublicationRow | null>(null);
  const unpublishMut = useMutation({
    mutationFn: () => unpublish({}),
    onSuccess: () => {
      toast.success("Avpublicerat");
      queryClient.invalidateQueries({ queryKey: ["vmix-active"] });
    },
    onError: (e) => toast.error(`Fel: ${(e as Error).message}`),
  });
const restoreMut = useMutation({
    mutationFn: (id: string) => restore({ data: { id } }),
    onSuccess: () => {
      toast.success("Publicering återställd");
      queryClient.invalidateQueries({ queryKey: ["vmix-active"] });
      queryClient.invalidateQueries({ queryKey: ["vmix-history"] });
    },
    onError: (e) => toast.error(`Fel: ${(e as Error).message}`),
  });

  const refreshStandingsMut = useMutation({
    mutationFn: () => doRefreshStandings(),
    onSuccess: (result) => {
      toast.success(`Tabell uppdaterad – ${result.teamsUpdated} lag`);
      queryClient.invalidateQueries({ queryKey: ["vmix-active"] });
    },
    onError: (e) =>
      toast.error(`Tabell-uppdatering misslyckades: ${(e as Error).message}`),
  });

  const filledHome = useMemo(() => countFilledSlots(homeSlots), [homeSlots]);
  const filledAway = useMemo(() => countFilledSlots(awaySlots), [awaySlots]);

  const publishWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (filledHome.goalies === 0) warnings.push("Ingen målvakt vald för hemmalaget");
    if (filledAway.goalies === 0 && awayTeam) warnings.push("Ingen målvakt vald för bortalaget");
    if (filledHome.skaters < 6) warnings.push(`Hemmalaget har bara ${filledHome.skaters} utespelare (normalt minst 6)`);
    if (filledAway.skaters < 6 && awayTeam) warnings.push(`Bortalaget har bara ${filledAway.skaters} utespelare (normalt minst 6)`);
    if (!homeSlots.teamCode) warnings.push("Logotypkod saknas för hemmalaget");
    if (awayTeam && !awaySlots.teamCode) warnings.push("Logotypkod saknas för bortalaget");
    return warnings;
  }, [filledHome, filledAway, homeSlots.teamCode, awaySlots.teamCode, awayTeam]);

  const readinessChecks = useMemo(() => {
    return [
      {
        label: "Bortalag valt",
        status: awayTeam ? "ok" : "error",
      },
      {
        label: "Aktiv publicering",
        status: activeQuery.data ? "ok" : "error",
      },
      {
        label: `Hemma-lineup · ${filledHome.goalies} MV · ${filledHome.skaters} utespel.`,
        status: filledHome.goalies > 0 && filledHome.skaters >= 6 ? "ok" : filledHome.goalies > 0 ? "warn" : "error",
      },
      {
        label: `Borta-lineup · ${filledAway.goalies} MV · ${filledAway.skaters} utespel.`,
        status: !awayTeam ? "error" : filledAway.goalies > 0 && filledAway.skaters >= 6 ? "ok" : filledAway.goalies > 0 ? "warn" : "error",
      },
      {
        label: `Logotypkoder · ${codesQuery.data?.length ?? 0} lag`,
        status: (codesQuery.data?.length ?? 0) > 0 ? "ok" : "error",
      },
      {
        label: officialApiQuery.data
          ? officialApiQuery.data.ok
            ? "Officiellt API OK"
            : `Officiellt API NERE (${officialApiQuery.data.status || "nätverksfel"})`
          : "Officiellt API – kontrollerar…",
        status: officialApiQuery.data
          ? officialApiQuery.data.ok
            ? "ok"
            : "error"
          : "warn",
      },
   ] as { label: string; status: "ok" | "warn" | "error" }[];
  }, [filledHome, filledAway, awayTeam, activeQuery.data, codesQuery.data, officialApiQuery.data]);

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

    const homeCode = codesMap[home] ?? "";
    const awayCode = codesMap[away] ?? "";

    if (source === "auto") {
      // Auto mode: try to fetch tonight's published lineup from swehockey.
      // Falls back to empty slots if not yet published (~30–60 min before puck drop).
      try {
        const result = await fetchTonightsLineupFn({
          data: { home, away, homeCode, awayCode },
        });
        if (result.available) {
          setHomeSlots(result.homeSlots);
          setAwaySlots(result.awaySlots);
          toast.success(
            `Laguppställning laddad – granska positioner och justera vid behov`,
          );
        } else {
          setHomeSlots(emptySlots(home, homeCode));
          setAwaySlots(emptySlots(away, awayCode));
          toast.info(`Laguppställning ej publicerad än på Swehockey – fyll i manuellt`);
        }
      } catch (e) {
        setHomeSlots(emptySlots(home, homeCode));
        setAwaySlots(emptySlots(away, awayCode));
        toast.error(`Kunde inte hämta laguppställning: ${(e as Error).message}`);
      }
    } else {
      // Manual mode: always start with empty slots — producer fills deliberately.
      setHomeSlots(emptySlots(home, homeCode));
      setAwaySlots(emptySlots(away, awayCode));
    }

    // Always load roster pools for the dropdowns regardless of mode.
    try {
      const [homePool, awayPool] = await Promise.all([
        fetchRoster({ data: { team: home } }),
        fetchRoster({ data: { team: away } }),
      ]);
      setHomePool(homePool);
      setAwayPool(awayPool);
    } catch (e) {
      toast.error(`Kunde inte hämta spelarlista: ${(e as Error).message}`);
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

  const handleResetManual = () => {
    const h = countFilledSlots(homeSlots);
    const a = countFilledSlots(awaySlots);
    if (h.goalies + h.skaters + a.goalies + a.skaters > 0) {
      setShowResetConfirm(true);
    } else {
      resetToManual();
    }
  };

  // Warn before closing/navigating away if lineup slots are filled.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const h = countFilledSlots(homeSlots);
      const a = countFilledSlots(awaySlots);
      if (h.goalies + h.skaters + a.goalies + a.skaters > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [homeSlots, awaySlots]);

  // Supabase Realtime — keep publication status in sync across all open
  // tabs and devices. Any publish/restore/unpublish from another browser
  // immediately refreshes the active publication and history here too.
  useEffect(() => {
    const channel = supabase
      .channel("vmix-publications-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vmix_publications" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["vmix-active"] });
          queryClient.invalidateQueries({ queryKey: ["vmix-history"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
  { label: "titlecard.json", url: `${baseUrl}/api/public/vmix/titlecard` },
  { label: "todays-games.json", url: `${baseUrl}/api/public/vmix/todays-games` },
];

 if (!adminQuery.data?.isAdmin) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6">
          <AdminNav />
          {sessionExpiryWarning && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                Din inloggning går snart ut. Logga ut och in igen för att undvika problem under sändningen.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSessionExpiryWarning(false)}
              >
                Stäng
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">vMix broadcast data</h1>
              <p className="text-sm text-muted-foreground">
                Publicera dagens Grästorps IK-match som JSON-feeds för vMix.
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
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <Card id="publicering" className={`border-2 ${
        readinessChecks.every((c) => c.status === "ok")
          ? "border-emerald-500/30"
          : readinessChecks.some((c) => c.status === "error")
          ? "border-destructive/30"
          : "border-amber-500/30"
      }`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {readinessChecks.every((c) => c.status === "ok") ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : readinessChecks.some((c) => c.status === "error") ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            Förberedelsekontroll
            {puckDropTime && (
              <span ref={countdownWrapRef} className="ml-auto font-mono text-sm text-amber-500">
                <Clock className="inline h-3.5 w-3.5 mr-1" />
                <span ref={countdownTextRef} />
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 mt-1">
            <label className="text-[11px] text-muted-foreground">Nedsläpp:</label>
            <input
              type="time"
              className="h-6 rounded border border-input bg-background px-2 text-xs"
              value={puckDropTime}
              onChange={(e) => setPuckDropTime(e.target.value)}
            />
            {puckDropTime && (
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => setPuckDropTime("")}
              >
                Rensa
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {readinessChecks.map((c) => (
              <div key={c.label} className="flex items-center gap-1.5 text-xs">
                {c.status === "ok" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : c.status === "warn" ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                )}
                <span className={
                  c.status === "ok" ? "" :
                  c.status === "warn" ? "text-amber-500" :
                  "text-destructive"
                }>
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

{hasDraft && sourceMode !== "live-hydrated" && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm flex-1">
            Det finns ett sparat utkast från en tidigare session. Vill du återställa det?
          </p>
          <Button size="sm" variant="outline" onClick={restoreDraft}>
            Återställ utkast
          </Button>
          <Button size="sm" variant="ghost" onClick={clearDraft}>
            Ignorera
          </Button>
        </div>
      )}
      <div id="logotypkoder">
      <CardErrorBoundary title="Logotypkoder">
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
      </CardErrorBoundary>
      </div>

      <div id="endpoints">
      <CardErrorBoundary title="vMix-endpoints">
        <EndpointTester endpoints={endpoints} autoFetchTrigger={autoFetchTrigger} />
      </CardErrorBoundary>
      </div>

      <div id="historik">
      <CardErrorBoundary title="Publiceringshistorik">
        <PublicationHistory
          publications={historyQuery.data ?? []}
          loading={historyQuery.isLoading}
          activeId={activeQuery.data?.id}
          onUse={(pub) => {
            setHomeTeam(pub.homeTeam);
            setAwayTeam(pub.awayTeam);
            setHomeSlots(pub.homeSlots);
            setAwaySlots(pub.awaySlots);
            if (pub.venue !== null && pub.venue !== undefined) setVenue(pub.venue);
            if (pub.notes !== null && pub.notes !== undefined) setNotes(pub.notes);
            setSourceMode("manual");
            toast.success(
              `Laddat från historik: ${pub.homeTeam} vs ${pub.awayTeam}. Tryck "Publicera till vMix" för att gå live.`,
            );
          }}
        />
      </CardErrorBoundary>
      </div>
      <AuditLogCard entries={auditQuery.data ?? []} loading={auditQuery.isLoading} />

      <div id="forsasongstrupp">
        <PreseasonRosterCard
          onRosterLoaded={(pool, team) => {
            setAwayPool(pool);
            setAwayRosterError(null);
            setAwayTeam(team);
            setAwaySlots(emptySlots(team, codesMap[team] ?? ""));
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Säsong för spelarlistan:</span>
        <Select
          value={adminSeason ?? ""}
          onValueChange={(v) => setAdminSeason(v || undefined)}
        >
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue placeholder="Standard" />
          </SelectTrigger>
          <SelectContent>
            {(seasonsQuery.data?.seasons ?? []).map((s: { label: string }) => (
              <SelectItem key={s.label} value={s.label} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PendingSeasonsBanner
        pending={pendingQuery.data?.pending ?? []}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["season-detections"] });
          queryClient.invalidateQueries({ queryKey: ["seasons"] });
        }}
      />

      <div id="kalla">
      <DataSourceCard
        sourceMode={sourceMode}
        loading={todaysQuery.isLoading}
        todayDate={todaysQuery.data?.date ?? null}
        match={todaysQuery.data?.match ?? null}
        currentHome={homeTeam}
        currentAway={awayTeam}
        onResetManual={handleResetManual}
        onRerunAuto={rerunAuto}
        hasLive={!!activeQuery.data}
        onScanSeasons={() => scanMut.mutate()}
        scanningSeasons={scanMut.isPending}
      />
      </div>

      <div id="hemmalag">
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
        poolLoaded={homePool.length > 0}
        rosterError={homeRosterError}
      />
      </div>

      <div id="bortalag">
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
        poolLoaded={awayPool.length > 0}
        rosterError={awayRosterError}
      />
      </div>

      <Card id="lineup-mallar">
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setShowSavePreset((v) => !v)}
        >
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Lineup-mallar
            {(presetsQuery.data?.length ?? 0) > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px]">
                {presetsQuery.data!.length}
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              {showSavePreset ? "Dölj" : "Visa"}
            </span>
          </CardTitle>
        </CardHeader>
        {showSavePreset && (
          <CardContent className="space-y-3 pt-0">
            {awayTeam && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-[11px]">Spara nuvarande lineup som mall</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder={`t.ex. ${homeTeam} vs ${awayTeam}`}
                    value={presetLabel}
                    onChange={(e) => setPresetLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSavePreset();
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!presetLabel.trim()}
                  onClick={handleSavePreset}
                >
                  Spara mall
                </Button>
              </div>
            )}
            {presetsQuery.isLoading && (
              <div className="space-y-1">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2 rounded px-2 py-1.5">
                    <div className="flex-1 space-y-1 py-0.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-6 w-14" />
                  </div>
                ))}
              </div>
            )}
            {!presetsQuery.isLoading && (presetsQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Sparade mallar
                  {relevantPresets.hiddenCount > 0 && (
                    <span className="ml-1 font-normal text-muted-foreground/60">
                      · {relevantPresets.shown.length} av {presetsQuery.data!.length} (filtrerat på valda lag)
                    </span>
                  )}
                </p>
                {relevantPresets.shown.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.label}</div>
                      <div className="text-muted-foreground">
                        {p.homeTeam} vs {p.awayTeam}
                        {" · "}
                        {new Date(p.createdAt).toLocaleDateString("sv-SE")}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleLoadPreset(p)}
                    >
                      Ladda
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-destructive"
                      onClick={() => handleDeletePreset(p.id)}
                    >
                      Ta bort
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {!presetsQuery.isLoading && (presetsQuery.data?.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground">
                Inga mallar sparade ännu.
              </p>
            )}
          </CardContent>
        )}
      </Card>
      <div className="space-y-2 bg-background/95 backdrop-blur border rounded-lg p-3">
        {publishWarnings.length > 0 && (
          <div className="space-y-1">
            {publishWarnings.map((w) => (
              <p key={w} className="text-xs text-amber-500 flex items-center gap-1">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
        <Button
          size="lg"
          disabled={publishMut.isPending || !awayTeam}
          onClick={() => {
            prePublishRef.current = activeQuery.data ?? null;
            setShowPublishConfirm(true);
          }}
        >
          {publishMut.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Publicera till vMix
        </Button>
       <Button
          variant="outline"
          disabled={unpublishMut.isPending || !activeQuery.data}
          onClick={() => setShowUnpublishConfirm(true)}
        >
          Avpublicera
        </Button>
        {activeQuery.data && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={refreshStandingsMut.isPending}
            onClick={() => refreshStandingsMut.mutate()}
          >
            {refreshStandingsMut.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Uppdatera tabell
          </Button>
        )}
        {activeQuery.data && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={handleExportJson}
          >
            <Download className="h-3 w-3 mr-1" />
            Exportera JSON
          </Button>
        )}
        {activeQuery.data && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={() => setShowEndBroadcastConfirm(true)}
          >
            Avsluta sändning
          </Button>
        )}
        {activeQuery.data && (
          <span className="text-xs text-muted-foreground ml-auto">
            Publicerad{" "}
            {new Date(activeQuery.data.publishedAt).toLocaleString("sv-SE")}
            {" · inkl. tabell"}
          </span>
        )}
        {lastDiff && lastDiff.length > 0 && (
          <div className="w-full text-xs space-y-0.5 border-t pt-2 mt-1">
            <p className="font-medium text-muted-foreground">Senaste ändringar:</p>
            {lastDiff.map((d) => (
              <p key={d.slot} className="text-muted-foreground">
                {d.type === "added" && `＋ ${d.slot}: ${d.newName}`}
                {d.type === "removed" && `－ ${d.slot}: ${d.oldName}`}
                {d.type === "changed" && `↔ ${d.slot}: ${d.oldName} → ${d.newName}`}
              </p>
            ))}
          </div>
        )}
        </div>
      </div>

      <AlertDialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicera till vMix?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Du publicerar <strong>{homeTeam}</strong> vs{" "}
                  <strong>{awayTeam || "(inget bortalag valt)"}</strong>.
                </p>
                <p>
                  Hemmalag: {filledHome.goalies} MV,{" "}
                  {filledHome.skaters} utespelare.
                  <br />
                  Bortalag: {filledAway.goalies} MV,{" "}
                  {filledAway.skaters} utespelare.
                </p>
                <p>
                  Tabellen hämtas live från Swehockey och inkluderas i
                  publiceringen. Eventuell tidigare publicering ersätts.
                </p>
                {publishWarnings.length > 0 && (
                  <div className="rounded bg-amber-500/10 border border-amber-500/30 p-2 space-y-1">
                    {publishWarnings.map((w) => (
                      <p key={w} className="text-amber-500 text-xs">⚠ {w}</p>
                    ))}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowPublishConfirm(false);
                publishMut.mutate();
              }}
            >
              Publicera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showUnpublishConfirm} onOpenChange={setShowUnpublishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avpublicera sändningen?</AlertDialogTitle>
            <AlertDialogDescription>
              Du håller på att avpublicera den aktiva sändningen. vMix tappar anslutningen till backup-feeden direkt. Det går inte att ångra utan att publicera igen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowUnpublishConfirm(false);
                unpublishMut.mutate();
              }}
            >
              Avpublicera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Återställ till manuellt läge?</AlertDialogTitle>
            <AlertDialogDescription>
              Du har redan fyllt i spelare i lineup-korten. Om du återställer rensas alla valda spelare. Vill du fortsätta?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowResetConfirm(false);
                resetToManual();
              }}
            >
              Återställ ändå
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showEndBroadcastConfirm} onOpenChange={setShowEndBroadcastConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avsluta sändningen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Detta kommer att:</p>
                <p>1. Avpublicera den aktiva lineup-feeden (vMix tappar backup-datan)</p>
                <p>2. Rensa det sparade utkastet</p>
                <p>3. Återställa formuläret till utgångsläge</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowEndBroadcastConfirm(false);
                unpublishMut.mutate(undefined, {
                  onSuccess: () => {
                    clearDraft();
                    resetToManual();
                    setPuckDropTime("");
                    setLastDiff(null);
                    toast.success("Sändningen avslutad – allt städat.");
                  },
                });
              }}
            >
              Avsluta sändning
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
 const [expanded, setExpanded] = useState(false);
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
      <CardHeader
        className="flex flex-row items-center justify-between space-y-0 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Logotypkoder
            {codes.length > 0 && (
              <Badge variant="outline" className="text-[10px]">{codes.length}</Badge>
            )}
          </CardTitle>
        </div>
        <span className="text-xs text-muted-foreground">
          {expanded ? "Dölj" : "Visa"}
        </span>
      </CardHeader>
      {expanded && (
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">
            Kopplar lagnamn till filnamn för logotyper (t.ex. GRÄ →
            GRA_small.png). Synka från Swehockey eller skriv in manuellt.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={syncing}
            className="ml-2 shrink-0"
            onClick={async (e) => {
              e.stopPropagation();
              setSyncing(true);
              try {
                await onSync();
              } catch (err) {
                toast.error(`Synk misslyckades: ${(err as Error).message}`);
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
        </div>
                {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
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
      )}
    </Card>
  );
}

// ---------- Slot-based lineup editor ----------

const DEF_ROWS = [1, 2, 3, 4, 5] as const;
const FWD_ROWS = [1, 2, 3, 4, 5] as const;

const SlotInputs = memo(
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

  const commit = useCallback((patch: { number?: number | string; name?: string }) => {
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
  }, [number, name, onChange]);

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
  const goalies = useMemo(() => pool.filter((p) => /^(GK|MV)$/i.test(p.position ?? "")), [pool]);
  const defenders = useMemo(() => pool.filter((p) => /^(LD|RD|D|B)$/i.test(p.position ?? "")), [pool]);
  const forwards = useMemo(() => pool.filter((p) => p.position && !/^(GK|MV|LD|RD|D|B)$/i.test(p.position)), [pool]);
  const other = useMemo(() => pool.filter((p) => !p.position), [pool]);

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
},
  (prev, next) => prev.value === next.value && prev.pool === next.pool,
);

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
  rosterError,
  pool = [],
  poolLoaded = false,

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
  poolLoaded?: boolean;
  rosterError?: string | null;
}) {
  const setSlot = (key: keyof VmixLineupSlots, v: SlotPlayer) => {
    setSlots((prev) => ({ ...prev, [key]: v }));
  };
  const filled = countFilledSlots(slots);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:flex-1 sm:w-auto min-w-[200px]">
            <CardTitle className="text-base flex items-center gap-2">
              {title}
              {teamName && !poolLoaded && (
                <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/50">
                  Roster ej laddad
                </Badge>
              )}
              {poolLoaded && (
                <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/50">
                  {pool.length} spelare
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {filled.goalies} MV · {filled.skaters} utespelare
            </p>
          </div>
          <div className="w-full sm:w-48">
            <Label className="text-[11px]">Lag</Label>
            {teamName && !teams.includes(teamName) ? (
              <div className="flex h-8 items-center gap-1">
                <span className="flex-1 truncate rounded border border-input bg-background px-2 text-sm leading-8">
                  {teamName}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs shrink-0"
                  onClick={() => onTeamChange("")}
                >
                  Ändra
                </Button>
              </div>
            ) : (
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
            )}
          </div>
          <div className="w-20 sm:w-28">
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
      {rosterError && (
        <div className="mx-6 mb-2 rounded bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
          Kunde inte hämta roster från swehockey.se: {rosterError}
        </div>
      )}
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

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error("Clipboard API unavailable");
    }
    toast.success("Kopierad");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
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
}

function EndpointTester({
  endpoints,
  autoFetchTrigger,
}: {
  endpoints: { label: string; url: string }[];
  autoFetchTrigger?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState<Record<string, EndpointResult>>({});
  const [autoRefresh, setAutoRefresh] = useState(false);
  const prevResultsRef = useRef<Record<string, EndpointResult>>({});

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
      const newResult: EndpointResult = {
        status: res.ok ? "ok" : "error",
        httpStatus: res.status,
        ms,
        body,
        fetchedAt: new Date().toISOString(),
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
      if (autoRefresh && prevResultsRef.current[url]?.status === "ok" && !res.ok) {
        const label = endpoints.find((e) => e.url === url)?.label ?? url;
        toast.error(`⚠ vMix-endpoint nere: ${label} (HTTP ${res.status})`);
      }
      prevResultsRef.current = { ...prevResultsRef.current, [url]: newResult };
      setResults((r) => ({ ...r, [url]: newResult }));
    } catch (e) {
      const newResult: EndpointResult = {
        status: "error",
        ms: Math.round(performance.now() - t0),
        error: (e as Error).message,
        fetchedAt: new Date().toISOString(),
      };
      if (autoRefresh && prevResultsRef.current[url]?.status === "ok") {
        const label = endpoints.find((e) => e.url === url)?.label ?? url;
        toast.error(`⚠ vMix-endpoint nere: ${label} – ${(e as Error).message}`);
      }
      prevResultsRef.current = { ...prevResultsRef.current, [url]: newResult };
      setResults((r) => ({ ...r, [url]: newResult }));
    }
  };

  const runAll = () => {
    setExpanded(true);
    endpoints.forEach((e) => runOne(e.url));
  };

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(runAll, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, endpoints]);

  useEffect(() => {
    if (!autoFetchTrigger) return;
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchTrigger]);

  return (
    <Card>
      <CardHeader
        className="flex flex-row items-center justify-between space-y-0 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <CardTitle className="text-base">vMix-endpoints</CardTitle>
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="sm"
            variant={autoRefresh ? "default" : "outline"}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            Auto 60s {autoRefresh ? "på" : "av"}
          </Button>
          <Button size="sm" variant="outline" onClick={runAll}>
            <RefreshCw className="h-3 w-3 mr-1" /> Testa alla
          </Button>
          <span className="text-xs text-muted-foreground w-8 text-right">
            {expanded ? "Dölj" : "Visa"}
          </span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Klistra in URL:en i vMix Data Sources → Web (JSON).
          </p>
          {endpoints.map((e) => {
            const r = results[e.url];
            return (
              <div key={e.url} className="rounded border bg-muted/30 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge result={r} />
                  <span className="font-mono font-medium w-36 shrink-0">
                    {e.label}
                  </span>
                  <span className="font-mono truncate flex-1 text-muted-foreground">
                    {e.url}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 shrink-0"
                    onClick={() => copyToClipboard(e.url)}
                  >
                    <Copy className="h-3 w-3" /> Kopiera
                  </Button>
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline text-xs inline-flex items-center gap-1 shrink-0"
                  >
                    <Download className="h-3 w-3" /> Öppna
                  </a>
                  {r?.ms !== undefined && (
                    <span className="text-muted-foreground shrink-0">
                      {r.ms} ms
                    </span>
                  )}
                  {r?.httpStatus !== undefined && (
                    <span className="text-muted-foreground shrink-0">
                      HTTP {r.httpStatus}
                    </span>
                  )}
                  {r?.fetchedAt && (
                    <span className="text-muted-foreground shrink-0">
                      · {new Date(r.fetchedAt).toLocaleTimeString("sv-SE")}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 shrink-0"
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
                  <pre className="mt-2 max-h-96 overflow-auto rounded bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
                    {typeof r.body === "string"
                      ? r.body
                      : JSON.stringify(r.body, null, 2)}
                  </pre>
                )}
                {!r && (
                  <p className="mt-1 text-muted-foreground italic">
                    Inte testad ännu — tryck på uppdateringsknappen.
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
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
// ---------- Publication history ----------

function PublicationHistory({
  publications,
  loading,
  activeId,
  onUse,
}: {
  publications: VmixPublicationRow[];
  loading: boolean;
  activeId?: string;
  onUse: (pub: VmixPublicationRow) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!loading && publications.length === 0) return null;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Publiceringshistorik
          {!loading && (
            <Badge variant="outline" className="ml-1 text-[10px]">
              {publications.length}
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {open ? "Dölj" : "Visa"}
          </span>
        </CardTitle>
      </CardHeader>
      {open && loading && (
        <CardContent className="space-y-1 pt-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded px-2 py-1.5">
              <div className="flex-1 space-y-1 py-0.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-10" />
            </div>
          ))}
        </CardContent>
      )}
      {open && !loading && (
        <CardContent className="space-y-1 pt-0">
          {publications.map((pub) => {
            const isActive = pub.id === activeId;
            const filled = countFilledSlots(pub.homeSlots);
            const filledAway = countFilledSlots(pub.awaySlots);
            return (
              <div
                key={pub.id}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                  isActive ? "bg-emerald-500/10 border border-emerald-500/30" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {pub.homeTeam} vs {pub.awayTeam}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(pub.publishedAt).toLocaleString("sv-SE")}
                    {" · "}
                    {filled.goalies + filledAway.goalies} MV,{" "}
                    {filled.skaters + filledAway.skaters} utespelare
                  </div>
                </div>
                {isActive ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">
                    LIVE
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => onUse(pub)}
                  >
                    Använd
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
function AuditLogCard({ entries, loading }: { entries: AuditLogRow[]; loading: boolean }) {
  const [open, setOpen] = useState(false);
  if (!loading && entries.length === 0) return null;
  const actionLabel = (action: string) => {
    switch (action) {
      case "publish": return "Publicering";
      case "unpublish": return "Avpublicering";
      case "restore": return "Återställning";
      case "refresh_standings": return "Tabelluppdatering";
      default: return action;
    }
  };
  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Granskningslogg
          {!loading && entries.length > 0 && (
            <Badge variant="outline" className="ml-1 text-[10px]">{entries.length}</Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground font-normal">{open ? "Dölj" : "Visa"}</span>
        </CardTitle>
      </CardHeader>
      {open && loading && (
        <CardContent className="space-y-1 pt-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded px-2 py-1.5">
              <div className="flex-1 space-y-1 py-0.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </CardContent>
      )}
      {open && !loading && (
        <CardContent className="space-y-1 pt-0">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/40">
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {actionLabel(e.action)}
                  {e.homeTeam && e.awayTeam && (
                    <span className="font-normal text-muted-foreground"> · {e.homeTeam} vs {e.awayTeam}</span>
                  )}
                </div>
                <div className="text-muted-foreground">{new Date(e.createdAt).toLocaleString("sv-SE")}</div>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
// ---------- Pre-season roster lookup ----------

const PRESEASON_COMPETITION_ID = "21138";

function PreseasonRosterCard({ onRosterLoaded }: { onRosterLoaded: (players: RosterPlayer[], team: string) => void }) {
  const fetchRosterByComp = useServerFn(fetchRosterByCompetition);
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [competitionId, setCompetitionId] = useState(PRESEASON_COMPETITION_ID);
  const [players, setPlayers] = useState<RosterPlayer[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchMut = useMutation({
    mutationFn: () =>
      fetchRosterByComp({
        data: { team: teamName.trim(), competitionId: competitionId.trim() },
      }),
    onSuccess: (pool) => {
      setPlayers(pool);
      setFetchError(null);
      onRosterLoaded(pool, teamName.trim());
      if (pool.length > 0) {
        toast.success(`${pool.length} spelare laddade till Bortalag-lineup`);
      } else {
        toast.info("Inga spelare registrerade – prova ett annat tävlings-ID");
      }
    },
    onError: (e) => {
      setFetchError((e as Error).message);
      setPlayers(null);
    },
  });

  const canFetch = teamName.trim().length > 0 && competitionId.trim().length > 0;

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-base flex items-center gap-2">
          Försäsong
          <span className="ml-auto text-xs text-muted-foreground font-normal">{open ? "Dölj" : "Visa"}</span>
        </CardTitle>
        {open && (
          <p className="text-xs text-muted-foreground">
            Hämta spelarlista för valfritt lag via ett tävlings-ID från stats.swehockey.se.
            Standard-ID 21138 = Preseason Games Herr. Tävlings-ID finns i URL:en på stats.swehockey.se.
          </p>
        )}
      </CardHeader>
      {open && (
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-[11px]">Lagnamn</Label>
            <Input
              className="h-8 text-sm"
              placeholder="t.ex. Sörhaga/Alingsås HK"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canFetch) fetchMut.mutate(); }}
            />
          </div>
          <div className="w-28">
            <Label className="text-[11px]">Tävlings-ID</Label>
            <Input
              className="h-8 text-sm font-mono"
              placeholder={PRESEASON_COMPETITION_ID}
              value={competitionId}
              onChange={(e) => setCompetitionId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canFetch) fetchMut.mutate(); }}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!canFetch || fetchMut.isPending}
            onClick={() => fetchMut.mutate()}
          >
            {fetchMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Hämta trupp
          </Button>
        </div>

        {fetchError && (
          <div className="rounded bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {fetchError}
          </div>
        )}

        {players !== null && players.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Inga spelare registrerade för <strong>{teamName}</strong> i tävling {competitionId}.
            Prova lagets ordinarie serie-ID (t.ex. HockeyTvåan).
          </p>
        )}

        {players && players.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{players.length} spelare hittade</p>
            <div className="max-h-72 overflow-auto rounded border divide-y divide-border text-xs">
              {players.map((p, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="w-6 text-right font-mono text-muted-foreground shrink-0">
                    {p.number !== "" ? `${p.number}` : "–"}
                  </span>
                  <span className="flex-1 font-medium">{p.name}</span>
                  {p.position && (
                    <span className="text-muted-foreground">{p.position}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      )}
    </Card>
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
  onScanSeasons,
  scanningSeasons,
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
  onScanSeasons?: () => void;
  scanningSeasons?: boolean;
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
          {onScanSeasons && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-xs"
              onClick={onScanSeasons}
              disabled={scanningSeasons}
            >
              {scanningSeasons ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Skanna efter ny säsong
            </Button>
          )}
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
