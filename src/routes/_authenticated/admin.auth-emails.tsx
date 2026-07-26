import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import { listAuthEmailStatus, type AuthEmailUser } from "@/lib/auth-email-status.functions";
import {
  listNotificationEmails,
  resendNotificationEmail,
  TEMPLATE_LABELS,
  type NotificationEmailRow,
} from "@/lib/email-log.functions";
import { listAuditEvents, type AuditEvent } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/auth-emails")({
  head: () => ({
    meta: [
      { title: "Maillogg · HockeyEttan Södra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmailLogPage,
});

// ---------- audit helpers ----------

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

// ---------- shared helpers ----------

const AUTH_TEMPLATE_LABELS: Record<string, string> = {
  signup: "Bekräfta konto",
  magiclink: "Magisk länk",
  recovery: "Återställ lösenord",
  invite: "Inbjudan",
  email_change: "Byte av e-post",
  reauthentication: "Återautentisering",
};

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  sent:       { label: "Skickat",    variant: "default",     className: "bg-emerald-600 text-white hover:bg-emerald-600" },
  pending:    { label: "I kö",       variant: "secondary" },
  suppressed: { label: "Blockerat",  variant: "outline",     className: "border-amber-500 text-amber-600" },
  bounced:    { label: "Studsade",   variant: "destructive" },
  complained: { label: "Klagomål",   variant: "destructive" },
  failed:     { label: "Misslyckat", variant: "destructive" },
  dlq:        { label: "Gav upp",    variant: "destructive" },
};

const SUPPRESSION_LABELS: Record<string, string> = {
  unsubscribe: "Avregistrerad",
  bounce: "Studsade",
  complaint: "Klagomål",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline" className="text-muted-foreground">Inga försök</Badge>;
  const meta = STATUS_META[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={meta.variant} className={meta.className}>{meta.label}</Badge>;
}

function fmt(ts: string | null) {
  return ts ? new Date(ts).toLocaleString("sv-SE") : "—";
}

// ---------- page ----------

function EmailLogPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchIsAdmin      = useServerFn(checkIsAdmin);
  const fetchAuthStatus   = useServerFn(listAuthEmailStatus);
  const fetchNotifEmails  = useServerFn(listNotificationEmails);
  const resend            = useServerFn(resendNotificationEmail);
  const fetchEvents       = useServerFn(listAuditEvents);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
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
      toast.error("Du har inte behörighet.");
      navigate({ to: "/", replace: true });
    }
  }, [adminQuery.isError, adminQuery.data, navigate]);

  const isAdmin = adminQuery.data?.isAdmin === true;

  const authQuery = useQuery({
    queryKey: ["auth-email-status"],
    queryFn: () => fetchAuthStatus(),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const notifQuery = useQuery({
    queryKey: ["notification-emails"],
    queryFn: () => fetchNotifEmails(),
    enabled: isAdmin,
  });

  const eventsQuery = useQuery({
    queryKey: ["audit-events"],
    queryFn: () => fetchEvents(),
    enabled: isAdmin,
  });

  const resendMutation = useMutation({
    mutationFn: (logId: string) => resend({ data: { logId } }),
    onSuccess: () => {
      toast.success("Mejlet skickades igen");
      queryClient.invalidateQueries({ queryKey: ["notification-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const authUsers: AuthEmailUser[] = authQuery.data?.users ?? [];
  const notifRows: NotificationEmailRow[] = notifQuery.data?.rows ?? [];
  const auditEvents: AuditEvent[] = eventsQuery.data?.events ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return authUsers.filter((u) => {
      if (q && !u.email.toLowerCase().includes(q)) return false;
      if (onlyProblems) {
        const hasProblem =
          !!u.suppressed ||
          (u.latestStatus && ["bounced", "complained", "failed", "dlq"].includes(u.latestStatus));
        if (!hasProblem) return false;
      }
      return true;
    });
  }, [authUsers, filter, onlyProblems]);

  const summary = useMemo(() => {
    let sent = 0, failed = 0, suppressed = 0;
    for (const u of authUsers) {
      if (u.suppressed) suppressed++;
      else if (["bounced", "complained", "failed", "dlq"].includes(u.latestStatus ?? "")) failed++;
      else if (u.latestStatus === "sent") sent++;
    }
    return { sent, failed, suppressed, total: authUsers.length };
  }, [authUsers]);

  function toggle(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  const isFetching = authQuery.isFetching || notifQuery.isFetching || eventsQuery.isFetching;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6">
          <AdminNav />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Maillogg</h1>
              <p className="text-sm text-muted-foreground">
                Skickade notismejl (med skicka-igen), auth-mail per användare och aktivitetslogg.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["auth-email-status"] });
                queryClient.invalidateQueries({ queryKey: ["notification-emails"] });
                queryClient.invalidateQueries({ queryKey: ["audit-events"] });
              }}
              disabled={isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Uppdatera
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">

        {/* ── Notification emails ── */}
        <Card>
          <CardHeader>
            <CardTitle>Notismejl ({notifRows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {notifQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : notifRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga notismejl skickade ännu.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Tid</th>
                      <th className="pb-2 pr-4 font-medium">Till</th>
                      <th className="pb-2 pr-4 font-medium">Typ</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {notifRows.map((row) => (
                      <tr key={row.id} className="align-middle">
                        <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium">{row.recipientEmail}</div>
                          {row.metadata?.newUserEmail && (
                            <div className="text-xs text-muted-foreground">Om: {row.metadata.newUserEmail}</div>
                          )}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          {TEMPLATE_LABELS[row.templateName] ?? row.templateName}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={row.status} />
                          {row.errorMessage && (
                            <div className="mt-0.5 text-xs text-destructive">{row.errorMessage}</div>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resendMutation.isPending}
                            onClick={() => resendMutation.mutate(row.id)}
                          >
                            <Send className="mr-2 h-3 w-3" />
                            Skicka igen
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Auth emails summary ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={<Mail className="h-4 w-4" />}                               label="Användare"   value={summary.total} />
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}      label="Senast OK"   value={summary.sent} />
          <SummaryCard icon={<XCircle className="h-4 w-4 text-destructive" />}           label="Med fel"     value={summary.failed} />
          <SummaryCard icon={<ShieldAlert className="h-4 w-4 text-amber-500" />}         label="Blockerade"  value={summary.suppressed} />
        </div>

        {/* ── Auth emails per user ── */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Auth-mail per användare ({filtered.length})</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Sök e-post…"
                className="h-9 w-full sm:w-56"
              />
              <Button
                variant={onlyProblems ? "default" : "outline"}
                size="sm"
                onClick={() => setOnlyProblems((v) => !v)}
              >
                {onlyProblems ? "Visar problem" : "Bara problem"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {authQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga användare matchar filtret.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((u) => {
                  const isOpen = expanded.has(u.userId);
                  return (
                    <li key={u.userId} className="py-3">
                      <button
                        type="button"
                        onClick={() => toggle(u.userId)}
                        className="flex w-full items-start gap-3 text-left"
                        aria-expanded={isOpen}
                      >
                        <span className="mt-1 text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">{u.email || "(saknar e-post)"}</span>
                            <StatusBadge status={u.latestStatus} />
                            {u.suppressed && (
                              <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
                                <ShieldAlert className="h-3 w-3" />
                                {SUPPRESSION_LABELS[u.suppressed.reason] ?? u.suppressed.reason}
                              </Badge>
                            )}
                            {u.approvalStatus && u.approvalStatus !== "approved" && (
                              <Badge variant="secondary">{u.approvalStatus}</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Senaste försök: {fmt(u.latestAt)}
                            </span>
                            <span>Senaste inlogg: {fmt(u.lastSignInAt)}</span>
                            <span>Konto skapat: {fmt(u.createdAt)}</span>
                          </div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="ml-7 mt-3 space-y-2">
                          {u.suppressed && (
                            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                              <div>
                                <div className="font-medium">
                                  Adressen är blockerad ({SUPPRESSION_LABELS[u.suppressed.reason] ?? u.suppressed.reason})
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Sedan {fmt(u.suppressed.createdAt)} — inga nya auth-mail skickas.
                                </div>
                              </div>
                            </div>
                          )}
                          {u.attempts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Inga loggade auth-mail-försök till denna adress.</p>
                          ) : (
                            <ul className="divide-y divide-border rounded-md border border-border">
                              {u.attempts.map((a) => {
                                const meta = STATUS_META[a.status] ?? { label: a.status, variant: "outline" as const };
                                return (
                                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={meta.variant} className={meta.className}>{meta.label}</Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {AUTH_TEMPLATE_LABELS[a.template] ?? a.template}
                                        </span>
                                      </div>
                                      {a.errorMessage && (
                                        <div className="mt-1 truncate text-xs text-destructive" title={a.errorMessage}>
                                          {a.errorMessage}
                                        </div>
                                      )}
                                    </div>
                                    <div className="whitespace-nowrap text-xs text-muted-foreground">{fmt(a.createdAt)}</div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        {/* ── Audit log ── */}
        <Card>
          <CardHeader>
            <CardTitle>Aktivitetslogg ({auditEvents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : auditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga händelser ännu.</p>
            ) : (
              <ul className="divide-y divide-border">
                {auditEvents.map((e) => {
                  const isSelf = e.userId === currentUserId;
                  const details = Object.entries(e.metadata ?? {})
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
                        <div className="whitespace-nowrap text-xs text-muted-foreground">
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

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}
