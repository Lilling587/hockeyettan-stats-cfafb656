import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import { getScrapeHealth } from "@/lib/scrape-metrics.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/health")({
  head: () => ({
    meta: [
      { title: "Scraper health · admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HealthPage,
});

function HealthPage() {
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchHealth = useServerFn(getScrapeHealth);
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

  const healthQuery = useQuery({
    queryKey: ["scrape-health", 24],
    queryFn: () => fetchHealth({ data: { windowHours: 24 } }),
    enabled: adminQuery.data?.isAdmin === true,
    refetchInterval: 60_000,
  });

  const data = healthQuery.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Scraper health</h1>
            <p className="text-sm text-muted-foreground">
              Senaste 24 timmarna · uppdateras varje minut
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => healthQuery.refetch()}
              disabled={healthQuery.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${healthQuery.isFetching ? "animate-spin" : ""}`}
              />
              Uppdatera
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {!data ? (
          <p className="text-sm text-muted-foreground">Laddar…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Hämtningar" value={String(data.total)} />
              <KpiCard
                label="Success rate"
                value={`${(data.successRate * 100).toFixed(1)}%`}
                tone={data.successRate >= 0.95 ? "good" : data.successRate >= 0.8 ? "warn" : "bad"}
              />
              <KpiCard
                label="Cache hit rate"
                value={`${(data.cacheHitRate * 100).toFixed(0)}%`}
              />
              <KpiCard
                label="p95 latens"
                value={`${data.p95LatencyMs} ms`}
                tone={data.p95LatencyMs < 2000 ? "good" : data.p95LatencyMs < 8000 ? "warn" : "bad"}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per endpoint</CardTitle>
              </CardHeader>
              <CardContent>
                {data.byEndpoint.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Inga hämtningar i fönstret. Ladda dashboarden några gånger så fylls
                    den här.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Endpoint</TableHead>
                        <TableHead className="text-right">Antal</TableHead>
                        <TableHead className="text-right">OK</TableHead>
                        <TableHead className="text-right">Fel</TableHead>
                        <TableHead className="text-right">Cache</TableHead>
                        <TableHead className="text-right">p95 ms</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byEndpoint.map((r) => (
                        <TableRow key={r.endpoint}>
                          <TableCell className="font-mono text-xs">
                            {r.endpoint}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">
                            {r.okCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-rose-600">
                            {r.errorCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {(r.cacheHitRate * 100).toFixed(0)}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.p95LatencyMs}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Senaste 50 hämtningarna</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Inget loggat ännu.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tid</TableHead>
                        <TableHead>Endpoint</TableHead>
                        <TableHead>Säsong</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">ms</TableHead>
                        <TableHead>Fel</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recent.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {new Date(r.fetched_at).toLocaleTimeString("sv-SE")}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.endpoint}
                          </TableCell>
                          <TableCell className="text-xs">{r.season ?? "—"}</TableCell>
                          <TableCell>
                            {r.status === "ok" ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {r.cache_hit ? "cache" : "ok"}
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                fel
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.latency_ms}
                          </TableCell>
                          <TableCell className="text-xs text-rose-600 max-w-xs truncate">
                            {r.error ?? ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-rose-600"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
