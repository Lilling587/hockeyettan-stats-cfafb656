import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import { getTeamLogoCodes } from "@/lib/vmix.functions";
import {
  adminRefetchTeamLogo,
  clearTeamLogoCache,
  listTeamLogoStatus,
  setTeamLogoOverride,
  type TeamLogoStatus,
} from "@/lib/team-logos.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  VMIX_BUCKET,
  VMIX_RESOURCE_FILES,
  getVmixLogoPath,
  getVmixLogoUrl,
  getVmixAssetBaseUrl,
  type VmixResourceFile,
} from "@/lib/vmix-assets";

import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamLogo } from "@/components/team-logo";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ASSET_BASE = getVmixAssetBaseUrl(SUPABASE_URL);

const LS_KEY = "lovable.teamlogos.v1";

export const Route = createFileRoute("/_authenticated/admin/assets")({
  head: () => ({
    meta: [
      { title: "Lagring · Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAssetsPage,
});

function withCacheBuster(url: string, v: number): string {
  return `${url}?v=${v}`;
}

function AdminAssetsPage() {
  const adminFn = useServerFn(checkIsAdmin);
  const codesFn = useServerFn(getTeamLogoCodes);
  const fetchStatus = useServerFn(listTeamLogoStatus);
  const refetchOne = useServerFn(adminRefetchTeamLogo);
  const saveOverride = useServerFn(setTeamLogoOverride);
  const clearOne = useServerFn(clearTeamLogoCache);
  const queryClient = useQueryClient();

  const adminQuery = useQuery({
    queryKey: ["admin-check"],
    queryFn: () => adminFn(),
  });

  const codesQuery = useQuery({
    queryKey: ["team-logo-codes"],
    queryFn: () => codesFn(),
    enabled: adminQuery.data?.isAdmin === true,
  });

  const statusQuery = useQuery({
    queryKey: ["team-logos-admin"],
    queryFn: () => fetchStatus(),
    enabled: adminQuery.data?.isAdmin === true,
  });

  const [bump, setBump] = useState(() => Date.now());
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const codes = useMemo(() => codesQuery.data ?? [], [codesQuery.data]);

  const invalidateLogos = () => {
    queryClient.invalidateQueries({ queryKey: ["team-logos-admin"] });
    queryClient.invalidateQueries({ queryKey: ["team-logos"] });
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    }
  };

  const refetchMutation = useMutation({
    mutationFn: (team: string) => refetchOne({ data: { team } }),
    onSuccess: (res) => {
      invalidateLogos();
      toast.success(
        res.url
          ? `Logga uppdaterad för ${res.team}`
          : `Ingen lagkod hittad för ${res.team} – synka lagkoder i vMix-admin först`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMutation = useMutation({
    mutationFn: (team: string) => clearOne({ data: { team } }),
    onSuccess: () => {
      invalidateLogos();
      toast.success("Cache rensad");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: (vars: { team: string; url: string }) =>
      saveOverride({ data: vars }),
    onSuccess: (_d, vars) => {
      invalidateLogos();
      setDrafts((d) => ({ ...d, [vars.team]: "" }));
      toast.success(`Sparad override för ${vars.team}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDraft = (team: string, url: string) =>
    setDrafts((d) => ({ ...d, [team]: url }));

  const rows: TeamLogoStatus[] = statusQuery.data?.rows ?? [];
  const missing = rows.filter((r) => r.status !== "ok" || !r.logoUrl);
  const ok = rows.filter((r) => r.status === "ok" && r.logoUrl);

  if (adminQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!adminQuery.data?.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-muted-foreground">Endast administratörer.</p>
      </div>
    );
  }

  async function uploadTo(path: string, file: File) {
    const { error } = await supabase.storage
      .from(VMIX_BUCKET)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || "image/png",
        cacheControl: "60",
      });
    if (error) {
      toast.error(`Uppladdning misslyckades: ${error.message}`);
      return false;
    }
    toast.success(`Sparad: ${path}`);
    setBump(Date.now());
    return true;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6">
          <AdminNav />
          <h1 className="text-2xl font-semibold tracking-tight">Lagring</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 p-6">

        {/* ── Broadcast templates ── */}
        <Card id="sandningsmallar">
          <CardHeader>
            <CardTitle>Sändningsmallar</CardTitle>
            <CardDescription>
              PNG-mallar som vMix hämtar från molnet. Ersätter{" "}
              <code>{ASSET_BASE}/resources/…</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {VMIX_RESOURCE_FILES.map((name) => (
              <ResourceTile
                key={name}
                filename={name}
                bump={bump}
                onUpload={(file) => uploadTo(`resources/${name}`, file)}
              />
            ))}
          </CardContent>
        </Card>

        {/* ── vMix team logos ── */}
        <Card id="logotyper-vmix">
          <CardHeader>
            <CardTitle>Logotyper (vMix)</CardTitle>
            <CardDescription>
              Ladda upp små (list) och stora (helskärm) logotyper per lagkod.
              Filnamn normaliseras för lagring, t.ex. <code>GRÄ</code> →{" "}
              <code>GRA_small.png</code>. Den stora loggan används även på
              statistiksidan — ladda upp här för att uppdatera båda ställena.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {codesQuery.isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Läser lagkoder…
              </div>
            ) : codes.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Inga lagkoder hittades. Öppna <code>/admin/vmix</code> och
                synka lagkoder först.
              </div>
            ) : (
              <div className="divide-y">
                {codes.map((c) => (
                  <div
                    key={c.id}
                    className="grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-[1fr_1fr_1fr]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.teamName}</div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <Badge variant="outline">{c.logoCode}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {c.source === "manual" ? "manuell" : "auto"}
                        </span>
                      </div>
                    </div>
                    <LogoUploader
                      label="Small"
                      path={getVmixLogoPath(c.logoCode, "small")}
                      url={getVmixLogoUrl(ASSET_BASE, c.logoCode, "small")}
                      bump={bump}
                      onUpload={(file) =>
                        uploadTo(getVmixLogoPath(c.logoCode, "small"), file)
                      }
                    />
                    <LogoUploader
                      label="Large"
                      path={getVmixLogoPath(c.logoCode, "large")}
                      url={getVmixLogoUrl(ASSET_BASE, c.logoCode, "large")}
                      bump={bump}
                      onUpload={async (file) => {
                        const ok = await uploadTo(
                          getVmixLogoPath(c.logoCode, "large"),
                          file,
                        );
                        if (ok) invalidateLogos();
                        return ok;
                      }}
                    />
                  </div>
                ))}
                <CustomLogoUploader
                  bump={bump}
                  onUpload={(code, size, file) =>
                    uploadTo(getVmixLogoPath(code, size), file)
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Briefing logo cache ── */}
        <Card id="logotyper-statistik">
          <CardHeader>
           <CardTitle>Logotyper (statistiksida)</CardTitle>
            <CardDescription>
              Logotyper som visas på statistiksidan. Hämtas automatiskt från
              Supabase Storage när den stora logotypen finns uppladdad ovan.
              Klicka "Hämta om" för att uppdatera cachen direkt efter en
              uppladdning, eller om loggan visas fel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : (
              <>
                <BulkSection
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
                <BulkSection
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
          </CardContent>
        </Card>

      </main>
    </div>
  );
}

// ──────────────────────────────────────────────
// Briefing logo cache section
// ──────────────────────────────────────────────

function BulkSection({
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
    <div className="mb-4">
      <p className="mb-2 text-sm font-medium text-muted-foreground">{title}</p>
      <div className="space-y-2">
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
                  <LogoCacheBadge status={row.status} />
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
                  placeholder="https://…/logo.png (override)"
                  value={draft}
                  onChange={(e) => setDraft(row.team, e.target.value)}
                  className="w-full text-xs sm:w-56"
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
                <Button
                  size="icon"
                  variant="outline"
                  title="Hämta om från Supabase Storage"
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
      </div>
    </div>
  );
}

function LogoCacheBadge({ status }: { status: TeamLogoStatus["status"] }) {
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

// ──────────────────────────────────────────────
// vMix asset uploaders
// ──────────────────────────────────────────────

function ResourceTile({
  filename,
  bump,
  onUpload,
}: {
  filename: VmixResourceFile;
  bump: number;
  onUpload: (file: File) => Promise<boolean>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = withCacheBuster(`${ASSET_BASE}/resources/${filename}`, bump);

  return (
    <div className="flex items-center gap-4 rounded-md border p-3">
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
        <img
          src={url}
          alt={filename}
          className="max-h-full max-w-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{filename}</div>
        <div className="truncate text-xs text-muted-foreground">
          resources/{filename}
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          await onUpload(file);
          setBusy(false);
          if (ref.current) ref.current.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => ref.current?.click()}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        <span className="ml-1.5">Ladda upp</span>
      </Button>
    </div>
  );
}

function CustomLogoUploader({
  bump,
  onUpload,
}: {
  bump: number;
  onUpload: (code: string, size: "large", file: File) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const largeRef = useRef<HTMLInputElement>(null);
  const [busyLarge, setBusyLarge] = useState(false);
  const trimmedCode = code.trim().toUpperCase();

  const previewLarge = trimmedCode
    ? withCacheBuster(getVmixLogoUrl(ASSET_BASE, trimmedCode, "large"), bump)
    : null;

  const handleUpload = async (file: File) => {
    if (!trimmedCode) return;
    setBusyLarge(true);
    await onUpload(trimmedCode, "large", file);
    setBusyLarge(false);
    if (largeRef.current) largeRef.current.value = "";
  };

  return (
    <div className="pt-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Ladda upp för nytt lag (t.ex. försäsongsmotståndare)
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-28">
          <Input
            className="h-8 font-mono uppercase text-sm"
            placeholder="Kod, t.ex. SOR"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <p className="mt-0.5 text-[10px] text-muted-foreground">Logotypkod</p>
        </div>

        <div className="flex items-center gap-2">
          {previewLarge && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
              <img src={previewLarge} alt="large" className="max-h-full max-w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.15"; }} />
            </div>
          )}
          <input ref={largeRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          <div>
            <Button variant="outline" size="sm" disabled={!trimmedCode || busyLarge}
              onClick={() => largeRef.current?.click()}>
              {busyLarge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="ml-1.5">Ladda upp</span>
            </Button>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{trimmedCode ? `${trimmedCode}_large.png` : "–"}</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Efter uppladdning: lägg till lagnamn → kod i Logotypkoder-kortet på /admin/vmix.
      </p>
    </div>
  );
}

function LogoUploader({
  label,
  path,
  url,
  bump,
  onUpload,
}: {
  label: string;
  path: string;
  url: string;
  bump: number;
  onUpload: (file: File) => Promise<boolean>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const previewUrl = withCacheBuster(url, bump);

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
        <img
          src={previewUrl}
          alt={path}
          className="max-h-full max-w-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.15";
          }}
        />
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          await onUpload(file);
          setBusy(false);
          if (ref.current) ref.current.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => ref.current?.click()}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        <span className="ml-1.5">{label}</span>
      </Button>
    </div>
  );
}
