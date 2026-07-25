import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import { listAuditEvents, type AuditEvent } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Aktivitetslogg · HockeyEttan Södra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditPage,
});

const ACTION_LABELS: Record<string, string> = {
  login: "Inloggning",
  signup: "Kontoregistrering",
  briefing_view: "Öppnade matchbriefing",
  vmix_publish: "Publicerade till vMix",
  vmix_unpublish: "Avpublicerade från vMix",
  vmix_restore: "Återställde vMix-publicering",
  approve_user: "Godkände användare",
  reject_user: "Nekade användare",
};

function AuditPage() {
  const navigate = useNavigate();
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchEvents = useServerFn(listAuditEvents);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const adminQuery = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchIsAdmin(),
    retry: false,
  });

  useEffect(() => {
    if (adminQuery.isError || (adminQuery.data && !adminQuery.data.isAdmin)) {
      toast.error("Du har inte behörighet att se aktivitetsloggen.");
      navigate({ to: "/", replace: true });
    }
  }, [adminQuery.isError, adminQuery.data, navigate]);

  const eventsQuery = useQuery({
    queryKey: ["audit-events"],
    queryFn: () => fetchEvents(),
    enabled: adminQuery.data?.isAdmin === true,
  });

  const events: AuditEvent[] = eventsQuery.data?.events ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">
          <AdminNav />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Aktivitetslogg</h1>
            <p className="text-sm text-muted-foreground">
              Senaste inloggningar, publiceringar och admin-åtgärder.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Händelser ({events.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga händelser ännu.</p>
            ) : (
              <ul className="divide-y divide-border">
                {events.map((e) => {
                  const isSelf = e.userId === currentUserId;
                  const metadata = e.metadata ?? {};
                  const details = Object.entries(metadata)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(" · ");
                  return (
                    <li key={e.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge variant="secondary">
                              {ACTION_LABELS[e.action] ?? e.action}
                            </Badge>
                            <span className="truncate font-medium">
                              {e.email ?? "Okänd användare"}
                            </span>
                            {isSelf && (
                              <span className="text-xs text-muted-foreground">(du)</span>
                            )}
                          </div>
                          {details && (
                            <div className="mt-1 text-xs text-muted-foreground">{details}</div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(e.createdAt).toLocaleString("sv-SE")}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
