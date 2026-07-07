import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { checkIsAdmin } from "@/lib/roles.functions";

import {
  clearTeamLogoCache,
  ensureTeamLogo,
  listTeamLogoStatus,
  setTeamLogoOverride,
  type TeamLogoStatus,
} from "@/lib/team-logos.functions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TeamLogo } from "@/components/team-logo";

export const Route = createFileRoute("/_authenticated/admin/logos")({
  head: () => ({
    meta: [
      { title: "Logo admin · HockeyEttan Södra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LogoAdminPage,
});

const LS_KEY = "lovable.teamlogos.v1";

function LogoAdminPage() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(listTeamLogoStatus);
  const refetchOne = useServerFn(ensureTeamLogo);
  const saveOverride = useServerFn(setTeamLogoOverride);
  const clearOne = useServerFn(clearTeamLogoCache);
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const navigate = useNavigate();

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

  const statusQuery = useQuery({
    queryKey: ["team-logos-admin"],
    queryFn: () => fetchStatus(),
    enabled: adminQuery.data?.isAdmin === true,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["team-logos-admin"] });
    queryClient.invalidateQueries({ queryKey: ["team-logos"] });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LS_KEY);
      } catch {
        /* ignore */
      }
    }
  };

  const refetchMutation = useMutation({
    mutationFn: (team: string) => refetchOne({ data: { team } }),
    onSuccess: (res) => {
      invalidate();
      toast.success(
        res.url ? `Hittade logga för ${res.team}` : `Ingen logga hittad för ${res.team}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMutation = useMutation({
    mutationFn: (team: string) => clearOne({ data: { team } }),
    onSuccess: () => {
      invalidate();
      toast.success("Cache rensad");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: (vars: { team: string; url: string }) =>
      saveOverride({ data: vars }),
    onSuccess: (_d, vars) => {
      invalidate();
      setDrafts((d) => ({ ...d, [vars.team]: "" }));
      toast.success(`Sparad override för ${vars.team}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const setDraft = (team: string, url: string) =>
    setDrafts((d) => ({ ...d, [team]: url }));

  const rows: TeamLogoStatus[] = statusQuery.data?.rows ?? [];
  const missing = rows.filter((r) => r.status !== "ok" || !r.logoUrl);
  const ok = rows.filter((r) => r.status === "ok" && r.logoUrl);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Logotyp-admin
            </h1>
            <p className="text-sm text-muted-foreground">
              Granska cache, trigga omhämtning och lägg in manuella overrides.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {statusQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Laddar…</p>
        ) : (
          <>
            <BulkUpload
              teams={rows.map((r) => r.team)}
              onUploaded={(team, url) =>
                saveMutation.mutate({ team, url })
              }
            />
            <Section
              title={`Saknar logga (${missing.length})`}
              rows={missing}
              drafts={drafts}
              setDraft={setDraft}
              onRefetch={(t) => refetchMutation.mutate(t)}
              onSave={(t, url) => saveMutation.mutate({ team: t, url })}
              onClear={(t) => clearMutation.mutate(t)}
              pendingTeam={
                refetchMutation.isPending
                  ? (refetchMutation.variables as string)
                  : null
              }
            />
            <Section
              title={`Cachelagda (${ok.length})`}
              rows={ok}
              drafts={drafts}
              setDraft={setDraft}
              onRefetch={(t) => refetchMutation.mutate(t)}
              onSave={(t, url) => saveMutation.mutate({ team: t, url })}
              onClear={(t) => clearMutation.mutate(t)}
              pendingTeam={
                refetchMutation.isPending
                  ? (refetchMutation.variables as string)
                  : null
              }
              muted
            />
          </>
        )}
      </main>
    </div>
  );
}

function BulkUpload({
  teams,
  onUploaded,
}: {
  teams: string[];
  onUploaded: (team: string, url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState<File[]>([]);
  const [pickTeam, setPickTeam] = useState<Record<string, string>>({});

  const handleFiles = async (files: FileList | File[]) => {
    const { matchTeamByFilename, uploadTeamLogo } = await import(
      "@/lib/team-logo-upload"
    );
    setBusy(true);
    const left: File[] = [];
    let ok = 0;
    for (const file of Array.from(files)) {
      const match = matchTeamByFilename(file.name, teams);
      if (!match) {
        left.push(file);
        continue;
      }
      try {
        const url = await uploadTeamLogo(match, file);
        onUploaded(match, url);
        ok += 1;
      } catch (e) {
        toast.error(`Misslyckades med ${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    setUnmatched((prev) => [...prev, ...left]);
    if (ok > 0) toast.success(`Laddade upp ${ok} logga${ok === 1 ? "" : "r"}`);
  };

  const assignUnmatched = async (file: File) => {
    const team = pickTeam[file.name];
    if (!team) return;
    const { uploadTeamLogo } = await import("@/lib/team-logo-upload");
    try {
      const url = await uploadTeamLogo(team, file);
      onUploaded(team, url);
      setUnmatched((prev) => prev.filter((f) => f !== file));
      setPickTeam((p) => {
        const { [file.name]: _omit, ...rest } = p;
        return rest;
      });
      toast.success(`Sparad logga för ${team}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Massuppladdning</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) {
              void handleFiles(e.dataTransfer.files);
            }
          }}
          className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-6 py-8 text-center"
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Släpp filer här eller välj filer. Filnamn som matchar ett lagnamn
            (t.ex. <code>kallinge.png</code>) tilldelas automatiskt.
          </p>
          <p className="text-xs text-muted-foreground">
            Krav: bildfil (PNG, JPG, SVG eller WEBP), minst 72×72 px (HockeyEttan-standard), max 5 MB.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Laddar upp…" : "Välj filer"}
          </Button>
        </div>

        {unmatched.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Kunde inte matcha automatiskt — välj lag:
            </p>
            {unmatched.map((file) => (
              <div
                key={file.name}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <span className="flex-1 truncate text-sm">{file.name}</span>
                <select
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={pickTeam[file.name] ?? ""}
                  onChange={(e) =>
                    setPickTeam((p) => ({ ...p, [file.name]: e.target.value }))
                  }
                >
                  <option value="">Välj lag…</option>
                  {teams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!pickTeam[file.name]}
                  onClick={() => void assignUnmatched(file)}
                >
                  Spara
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function Section({
  title,
  rows,
  drafts,
  setDraft,
  onRefetch,
  onSave,
  onClear,
  pendingTeam,
  muted,
}: {
  title: string;
  rows: TeamLogoStatus[];
  drafts: Record<string, string>;
  setDraft: (team: string, url: string) => void;
  onRefetch: (team: string) => void;
  onSave: (team: string, url: string) => void;
  onClear: (team: string) => void;
  pendingTeam: string | null;
  muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => {
          const draft = drafts[row.team] ?? "";
          return (
            <div
              key={row.team}
              className={`flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 ${
                muted ? "opacity-90" : ""
              }`}
            >
              <TeamLogo team={row.team} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {row.team}
                  </span>
                  <StatusBadge status={row.status} />
                </div>
                {row.logoUrl ? (
                  <a
                    href={row.logoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-muted-foreground hover:underline"
                  >
                    {row.logoUrl}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Ingen URL cachad
                  </span>
                )}
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Input
                  placeholder="https://…/logo.png"
                  value={draft}
                  onChange={(e) => setDraft(row.team, e.target.value)}
                  className="w-full sm:w-72"
                />
                <Button
                  size="sm"
                  onClick={() => onSave(row.team, draft.trim())}
                  disabled={!draft.trim()}
                >
                  Spara
                </Button>
              </div>
              <div className="flex gap-1">
                <RowUploadButton team={row.team} onUploaded={onSave} />
                <Button
                  size="icon"
                  variant="outline"
                  title="Hämta om från Hockeyettan"
                  onClick={() => onRefetch(row.team)}
                  disabled={pendingTeam === row.team}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      pendingTeam === row.team ? "animate-spin" : ""
                    }`}
                  />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  title="Rensa cache-raden"
                  onClick={() => onClear(row.team)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function RowUploadButton({
  team,
  onUploaded,
}: {
  team: string;
  onUploaded: (team: string, url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputId = `row-upload-${team.replace(/\s+/g, "-")}`;

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const { uploadTeamLogo } = await import("@/lib/team-logo-upload");
      const url = await uploadTeamLogo(team, file);
      onUploaded(team, url);
      toast.success(`Logga uppladdad för ${team}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <label
        htmlFor={inputId}
        title="Ladda upp egen logga (PNG/JPG/SVG/WEBP, minst 72×72 px, max 5 MB)"
        aria-label="Ladda upp egen logga (PNG/JPG/SVG/WEBP, minst 72x72 px, max 5 MB)"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
          busy ? "pointer-events-none opacity-50" : "cursor-pointer"
        }`}
      >
        <Upload className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
      </label>
    </>
  );
}


function StatusBadge({ status }: { status: TeamLogoStatus["status"] }) {
  if (status === "ok")
    return (
      <Badge variant="secondary" className="text-[10px]">
        cachad
      </Badge>
    );
  if (status === "missing")
    return (
      <Badge variant="destructive" className="text-[10px]">
        missing
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px]">
      ohämtad
    </Badge>
  );
}
