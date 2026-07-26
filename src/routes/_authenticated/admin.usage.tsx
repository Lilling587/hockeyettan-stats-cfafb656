import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RefreshCw, Activity, Mail, AlertTriangle, Tv, Coins } from "lucide-react";

import { checkIsAdmin } from "@/lib/roles.functions";
import { getUsageSnapshot } from "@/lib/usage-metrics.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/usage")({
  head: () => ({
    meta: [
      { title: "Användning · admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UsagePage,
});

const WINDOWS = [
  { label: "Senaste 1 h", hours: 1 },
  { label: "Senaste 24 h", hours: 24 },
  { label: "Senaste 7 dagar", hours: 24 * 7 },
  { label: "Senaste 30 dagar", hours: 24 * 30 },
];

function UsagePage() {
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchUsage = useServerFn(getUsageSnapshot);
  const navigate = useNavigate();
  const [hours, setHours] = useState<number>(24);

  const adminQuery = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchIsAdmin(),
    retry: false,
  });

  useEffect(() => {
    if (adminQuery.isError || (adminQuery.data && !adminQuery.data.isAdmin)) {
      navigate({ to: "/" });
    }
  }, [adminQuery.isError, adminQuery.data, navigate]);

  const usageQuery = useQuery({
    queryKey: ["usage-snapshot", hours],
    queryFn: () => fetchUsage({ data: { windowHours: hours } }),
    enabled: adminQuery.data?.isAdmin === true,
    staleTime: 60_000,
  });

  if (!adminQuery.data?.isAdmin) return null;

  const snap = usageQuery.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6">
          <AdminNav />
          <h1 className="text-2xl font-semibold tracking-tight">Användning & jobb</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.hours} value={String(w.hours)}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => usageQuery.refetch()}
            disabled={usageQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${usageQuery.isFetching ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
          {snap && (
            <span className="text-sm text-muted-foreground">
              Uppdaterad {new Date(snap.generatedAt).toLocaleTimeString("sv-SE")}
            </span>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Sammanställer databastrafik som driver kostnaden: scraper-anrop, e-postjobb, felhändelser och vMix-åtgärder. Credit-siffrorna är en <strong>uppskattning</strong> baserad på antal händelser × vikter — inte fakturerade siffror. Exakta credits finns i Lovable workspace-billing.
        </p>

        {snap && (
          <Card className="border-primary/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="h-5 w-5" /> Uppskattade credits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CreditStat label="Totalt (fönster)" value={snap.credits.total} />
                <CreditStat label="Per timme" value={snap.credits.perHour} />
                <CreditStat label="Prognos / dygn" value={snap.credits.projectedPerDay} />
                <CreditStat label="Prognos / månad" value={snap.credits.projectedPerMonth} />
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <div>Scraper: <span className="font-mono">{snap.credits.scrape}</span></div>
                <div>E-post: <span className="font-mono">{snap.credits.email}</span></div>
                <div>Fel: <span className="font-mono">{snap.credits.error}</span></div>
                <div>vMix: <span className="font-mono">{snap.credits.vmix}</span></div>
              </div>
            </CardContent>
          </Card>
        )}

        {snap && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Activity} label="Scraper-anrop" value={snap.totals.scrapeCalls} sub={`${snap.totals.scrapeErrors} fel`} />
            <StatCard icon={Mail} label="E-post skickade" value={snap.totals.emailsSent} sub={`${snap.totals.emailsFailed} misslyckade`} />
            <StatCard icon={AlertTriangle} label="Felhändelser" value={snap.totals.errorEvents} />
            <StatCard icon={Tv} label="vMix-åtgärder" value={snap.totals.vmixEvents} />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Endpoints (scraper)</CardTitle></CardHeader>
            <CardContent className="max-h-96 overflow-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead className="text-right">Anrop</TableHead>
                    <TableHead className="text-right">Fel</TableHead>
                    <TableHead className="text-right">Cache</TableHead>
                    <TableHead className="text-right">Snitt ms</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snap?.endpoints.length ? snap.endpoints.map((r) => (
                    <TableRow key={r.endpoint}>
                      <TableCell className="font-mono text-xs">{r.endpoint}</TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right">{r.errors || "–"}</TableCell>
                      <TableCell className="text-right">{r.cacheHits}</TableCell>
                      <TableCell className="text-right">{r.avgLatencyMs}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.credits.toFixed(4)}</TableCell>
                    </TableRow>
                  )) : <EmptyRow cols={6} />}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Jobb & mallar</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-6 overflow-auto">
              <JobTable title="E-postmallar" rows={snap?.emailJobs} />
              <JobTable title="Felkällor" rows={snap?.errorSources} />
              <JobTable title="vMix-åtgärder" rows={snap?.vmixActions} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Senaste aktivitet</CardTitle></CardHeader>
          <CardContent className="max-h-[32rem] overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tid</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Namn</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detalj</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snap?.recent.length ? snap.recent.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.at).toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{r.kind}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.label}</TableCell>
                    <TableCell>
                      <Badge variant={/error|fail|bounce|dlq|fatal/i.test(r.status) ? "destructive" : "outline"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                  </TableRow>
                )) : <EmptyRow cols={5} />}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
        <div>
          <div className="text-2xl font-semibold">{value.toLocaleString("sv-SE")}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function JobTable({ title, rows }: { title: string; rows?: { name: string; total: number; errors: number; credits: number }[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Namn</TableHead>
            <TableHead className="text-right">Antal</TableHead>
            <TableHead className="text-right">Fel</TableHead>
            <TableHead className="text-right">Credits</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows?.length ? rows.map((r) => (
            <TableRow key={r.name}>
              <TableCell className="font-mono text-xs">{r.name}</TableCell>
              <TableCell className="text-right">{r.total}</TableCell>
              <TableCell className="text-right">{r.errors || "–"}</TableCell>
              <TableCell className="text-right font-mono text-xs">{r.credits.toFixed(4)}</TableCell>
            </TableRow>
          )) : <EmptyRow cols={4} />}
        </TableBody>
      </Table>
    </div>
  );
}

function CreditStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value.toLocaleString("sv-SE", { maximumFractionDigits: 4 })}</div>
    </div>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-6 text-center text-sm text-muted-foreground">
        Ingen data för valt tidsfönster.
      </TableCell>
    </TableRow>
  );
}
