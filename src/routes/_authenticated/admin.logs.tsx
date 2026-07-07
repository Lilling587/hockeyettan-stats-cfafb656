import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import { listErrorLogs, type ErrorLogRow } from "@/lib/error-log.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  head: () => ({
    meta: [
      { title: "Loggor · admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchLogs = useServerFn(listErrorLogs);
  const navigate = useNavigate();
  const [level, setLevel] = useState<"all" | "error" | "warn" | "info">("all");

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

  const logsQuery = useQuery({
    queryKey: ["error-logs", level],
    queryFn: () =>
      fetchLogs({
        data: { limit: 200, ...(level !== "all" ? { level } : {}) },
      }),
    enabled: adminQuery.data?.isAdmin === true,
    refetchInterval: 30_000,
  });

  const rows: ErrorLogRow[] = logsQuery.data?.rows ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Loggor</h1>
            <p className="text-sm text-muted-foreground">
              Senaste fel och varningar · uppdateras var 30:e sekund
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => logsQuery.refetch()}
              disabled={logsQuery.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${logsQuery.isFetching ? "animate-spin" : ""}`}
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

      <main className="mx-auto max-w-5xl space-y-4 px-6 py-8">
        <div className="flex flex-wrap gap-2">
          {(["all", "error", "warn", "info"] as const).map((l) => (
            <Button
              key={l}
              variant={level === l ? "default" : "outline"}
              size="sm"
              onClick={() => setLevel(l)}
            >
              {l === "all" ? "Alla" : l}
            </Button>
          ))}
          <span className="ml-auto self-center text-xs text-muted-foreground">
            {rows.length} rader
          </span>
        </div>

        {logsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Laddar…</p>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Inga loggar i fönstret.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        r.level === "error"
                          ? "destructive"
                          : r.level === "warn"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-[10px] uppercase"
                    >
                      {r.level}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.source}
                    </span>
                    {r.route ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        · {r.route}
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {new Date(r.created_at).toLocaleString("sv-SE")}
                    </span>
                  </div>
                  <CardTitle className="text-sm font-medium leading-snug">
                    {r.message}
                  </CardTitle>
                </CardHeader>
                {r.stack || r.context ? (
                  <CardContent className="pt-0">
                    {r.stack ? (
                      <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-[11px] leading-relaxed">
                        {r.stack}
                      </pre>
                    ) : null}
                    {r.context ? (
                      <pre className="mt-2 overflow-x-auto rounded bg-muted/30 p-2 text-[11px] leading-relaxed">
                        {r.context}
                      </pre>
                    ) : null}
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
