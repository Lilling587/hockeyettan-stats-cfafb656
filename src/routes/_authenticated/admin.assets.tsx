import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import { getTeamLogoCodes } from "@/lib/vmix.functions";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ASSET_BASE = getVmixAssetBaseUrl(SUPABASE_URL);

export const Route = createFileRoute("/_authenticated/admin/assets")({
  head: () => ({
    meta: [
      { title: "Assets · Admin" },
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

  const adminQuery = useQuery({
    queryKey: ["admin-check"],
    queryFn: () => adminFn(),
  });

  const codesQuery = useQuery({
    queryKey: ["team-logo-codes"],
    queryFn: () => codesFn(),
    enabled: adminQuery.data?.isAdmin === true,
  });

  const [bump, setBump] = useState(() => Date.now());

  const codes = useMemo(() => codesQuery.data ?? [], [codesQuery.data]);

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
        <p className="text-sm text-muted-foreground">
          Endast administratörer.
        </p>
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
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-3">
          <h1 className="mr-4 text-lg font-semibold">Assets</h1>
          <AdminNav />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 p-6">
        <Card>
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

        <Card>
          <CardHeader>
            <CardTitle>Lagslogotyper (vMix)</CardTitle>
            <CardDescription>
              Ladda upp små (list) och stora (helskärm) logotyper per lagkod.
              Filnamn normaliseras för lagring, t.ex. <code>GRÄ</code> →{" "}
              <code>GRA_small.png</code>.
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
                      onUpload={(file) =>
                        uploadTo(getVmixLogoPath(c.logoCode, "large"), file)
                      }
                    />

                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

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
          src={url}
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
