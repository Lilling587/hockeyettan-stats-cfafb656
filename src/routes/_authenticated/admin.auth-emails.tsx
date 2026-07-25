import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, Mail, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import {
  listAuthEmailStatus,
  type AuthEmailUser,
} from "@/lib/auth-email-status.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/auth-emails")({
  head: () => ({
    meta: [
      { title: "Auth-mail · HockeyEttan Södra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthEmailsPage,
});

const TEMPLATE_LABELS: Record<string, string> = {
  signup: "Bekräfta konto",
  magiclink: "Magisk länk",
  recovery: "Återställ lösenord",
  invite: "Inbjudan",
  email_change: "Byte av e-post",
  reauthentication: "Återautentisering",
};

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  sent: { label: "Skickat", variant: "default", className: "bg-emerald-600 text-white hover:bg-emerald-600" },
  pending: { label: "I kö", variant: "secondary" },
  suppressed: { label: "Blockerat", variant: "outline", className: "border-amber-500 text-amber-600" },
  bounced: { label: "Studsade", variant: "destructive" },
  complained: { label: "Klagomål", variant: "destructive" },
  failed: { label: "Misslyckat", variant: "destructive" },
  dlq: { label: "Gav upp", variant: "destructive" },
};

const SUPPRESSION_LABELS: Record<string, string> = {
  unsubscribe: "Avregistrerad",
  bounce: "Studsade",
  complaint: "Klagomål",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <Badge variant="outline" className="text-muted-foreground">Inga försök</Badge>;
  }
  const meta = STATUS_META[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={meta.variant} className={meta.className}>
      {meta.label}
    </Badge>
  );
}

function fmt(ts: string | null) {
  return ts ? new Date(ts).toLocaleString("sv-SE") : "—";
}

function AuthEmailsPage() {
  const navigate = useNavigate();
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchStatus = useServerFn(listAuthEmailStatus);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const adminQuery = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchIsAdmin(),
    retry: false,
  });

  useEffect(() => {
    if (adminQuery.isError || (adminQuery.data && !adminQuery.data.isAdmin)) {
      toast.error("Du har inte behörighet att se auth-mail-status.");
      navigate({ to: "/", replace: true });
    }
  }, [adminQuery.isError, adminQuery.data, navigate]);

  const statusQuery = useQuery({
    queryKey: ["auth-email-status"],
    queryFn: () => fetchStatus(),
    enabled: adminQuery.data?.isAdmin === true,
    refetchInterval: 60_000,
  });

  const users: AuthEmailUser[] = statusQuery.data?.users ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.email.toLowerCase().includes(q)) return false;
      if (onlyProblems) {
        const hasProblem =
          !!u.suppressed ||
          (u.latestStatus && ["bounced", "complained", "failed", "dlq"].includes(u.latestStatus));
        if (!hasProblem) return false;
      }
      return true;
    });
  }, [users, filter, onlyProblems]);

  const summary = useMemo(() => {
    let sent = 0, failed = 0, suppressed = 0, none = 0;
    for (const u of users) {
      if (u.suppressed) suppressed++;
      else if (!u.latestStatus) none++;
      else if (["bounced", "complained", "failed", "dlq"].includes(u.latestStatus)) failed++;
      else if (u.latestStatus === "sent") sent++;
    }
    return { sent, failed, suppressed, none, total: users.length };
  }, [users]);

  function toggle(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6">
          <AdminNav />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Auth-mail</h1>
              <p className="text-sm text-muted-foreground">
                Status och senaste försök för bekräftelse-, återställnings- och inbjudningsmail per användare.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusQuery.refetch()}
              disabled={statusQuery.isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${statusQuery.isFetching ? "animate-spin" : ""}`} />
              Uppdatera
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={<Mail className="h-4 w-4" />} label="Användare" value={summary.total} />
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Senast OK" value={summary.sent} />
          <SummaryCard icon={<XCircle className="h-4 w-4 text-destructive" />} label="Med fel" value={summary.failed} />
          <SummaryCard icon={<ShieldAlert className="h-4 w-4 text-amber-500" />} label="Blockerade" value={summary.suppressed} />
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Användare ({filtered.length})</CardTitle>
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
            {statusQuery.isLoading ? (
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
                              <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1">
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
                            <p className="text-sm text-muted-foreground">
                              Inga loggade auth-mail-försök till denna adress.
                            </p>
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
                                          {TEMPLATE_LABELS[a.template] ?? a.template}
                                        </span>
                                      </div>
                                      {a.errorMessage && (
                                        <div className="mt-1 truncate text-xs text-destructive" title={a.errorMessage}>
                                          {a.errorMessage}
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                      {fmt(a.createdAt)}
                                    </div>
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
