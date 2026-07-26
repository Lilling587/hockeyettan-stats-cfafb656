import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import {
  listNotificationEmails,
  resendNotificationEmail,
  TEMPLATE_LABELS,
  type NotificationEmailRow,
} from "@/lib/email-log.functions";
import { AdminNav } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/emails")({
  head: () => ({
    meta: [
      { title: "Skickade notismejl · HockeyEttan Södra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmailLogPage,
});

const STATUS_META: Record<string, { label: string; className: string }> = {
  sent: { label: "Skickat", className: "bg-emerald-600 text-white hover:bg-emerald-600" },
  failed: { label: "Misslyckat", className: "bg-destructive text-destructive-foreground" },
  pending: { label: "I kö", className: "" },
};

function statusBadge(status: string) {
  const meta = STATUS_META[status] ?? { label: status, className: "" };
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

function EmailLogPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchRows = useServerFn(listNotificationEmails);
  const resend = useServerFn(resendNotificationEmail);

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

  const rowsQuery = useQuery({
    queryKey: ["notification-emails"],
    queryFn: () => fetchRows(),
    enabled: adminQuery.data?.isAdmin === true,
  });

  const resendMutation = useMutation({
    mutationFn: (logId: string) => resend({ data: { logId } }),
    onSuccess: () => {
      toast.success("Mejlet skickades igen");
      queryClient.invalidateQueries({ queryKey: ["notification-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows: NotificationEmailRow[] = rowsQuery.data?.rows ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">
          <AdminNav />
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Skickade notismejl</h1>
              <p className="text-sm text-muted-foreground">
                Avisering om nya användare och admin-befordringar. Klicka på "Skicka igen"
                om mottagaren har missat mejlet.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["notification-emails"] })}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Uppdatera
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Logg ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {rowsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga mejl skickade ännu.</p>
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
                    {rows.map((row) => (
                      <tr key={row.id} className="align-middle">
                        <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString("sv-SE", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium">{row.recipientEmail}</div>
                          {row.metadata?.newUserEmail && (
                            <div className="text-xs text-muted-foreground">
                              Om: {row.metadata.newUserEmail}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          {TEMPLATE_LABELS[row.templateName] ?? row.templateName}
                        </td>
                        <td className="py-3 pr-4">
                          {statusBadge(row.status)}
                          {row.errorMessage && (
                            <div className="mt-0.5 text-xs text-destructive">
                              {row.errorMessage}
                            </div>
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
      </main>
    </div>
  );
}
