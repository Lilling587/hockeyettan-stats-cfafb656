import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import {
  inviteAdmin,
  listAdmins,
  revokeAdmin,
  type AdminUser,
} from "@/lib/admin-users.functions";
import {
  listUserProfiles,
  approveUser,
  rejectUser,
  type Profile,
} from "@/lib/users.functions";
import {
  listNotificationSubscribers,
  type NotificationSubscriber,
} from "@/lib/notifications.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Admin-användare · HockeyEttan Södra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchList = useServerFn(listAdmins);
  const fetchSubscribers = useServerFn(listNotificationSubscribers);
  const fetchProfiles = useServerFn(listUserProfiles);
  const invite = useServerFn(inviteAdmin);
  const revoke = useServerFn(revokeAdmin);
  const approve = useServerFn(approveUser);
  const reject = useServerFn(rejectUser);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

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
      toast.error("Du har inte behörighet att se admin-sidan.");
      navigate({ to: "/", replace: true });
    }
  }, [adminQuery.isError, adminQuery.data, navigate]);

  const listQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchList(),
    enabled: adminQuery.data?.isAdmin === true,
  });

  const subscribersQuery = useQuery({
    queryKey: ["notification-subscribers"],
    queryFn: () => fetchSubscribers(),
    enabled: adminQuery.data?.isAdmin === true,
  });

  const profilesQuery = useQuery({
    queryKey: ["user-profiles"],
    queryFn: () => fetchProfiles(),
    enabled: adminQuery.data?.isAdmin === true,
  });

  const inviteMutation = useMutation({
    mutationFn: (e: string) => invite({ data: { email: e } }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-profiles"] });
      setEmail("");
      toast.success(res.invited ? "Inbjudan skickad" : "Admin-behörighet tillagd");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => revoke({ data: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Admin-behörighet borttagen");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: (userId: string) => approve({ data: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profiles"] });
      toast.success("Användaren godkänd");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (userId: string) => reject({ data: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profiles"] });
      toast.success("Användaren nekad");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const admins: AdminUser[] = listQuery.data?.admins ?? [];
  const users: (Profile & { isAdmin: boolean; lastSignInAt: string | null })[] =
    profilesQuery.data?.users ?? [];
  const pendingUsers = users.filter((u) => u.approvalStatus === "pending");
  const approvedUsers = users.filter((u) => u.approvalStatus === "approved");
  const rejectedUsers = users.filter((u) => u.approvalStatus === "rejected");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6">
          <AdminNav />
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Admin-användare</h1>
              <p className="text-sm text-muted-foreground">
                Hantera godkännanden, administratörer och notisprenumeranter.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Bjud in admin</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (!email.trim()) return;
                inviteMutation.mutate(email.trim());
              }}
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="invite-email">E-postadress</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="namn@example.com"
                  required
                />
              </div>
              <Button type="submit" disabled={inviteMutation.isPending}>
                <UserPlus className="mr-2 h-4 w-4" />
                {inviteMutation.isPending ? "Skickar…" : "Bjud in"}
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              Personen får ett mejl för att sätta sitt lösenord. Om kontot redan
              finns läggs admin-rollen till direkt.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Väntar på godkännande ({pendingUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {profilesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : pendingUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Inga användare väntar på godkännande.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {pendingUsers.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {u.email ?? u.id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Registrerad {new Date(u.createdAt).toLocaleDateString("sv-SE")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={approveMutation.isPending}
                        onClick={() => approveMutation.mutate(u.id)}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Godkänn
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate(u.id)}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Neka
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Godkända användare ({approvedUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {profilesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : approvedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga godkända användare.</p>
            ) : (
              <ul className="divide-y divide-border">
                {approvedUsers.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <li
                      key={u.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {u.email ?? u.id}
                          {u.isAdmin && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (admin)
                            </span>
                          )}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">(du)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {u.lastSignInAt
                            ? `Senast inloggad ${new Date(u.lastSignInAt).toLocaleDateString("sv-SE")}`
                            : "Har ännu inte loggat in"}
                        </div>
                      </div>
                      {!u.isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSelf || rejectMutation.isPending}
                          onClick={() => rejectMutation.mutate(u.id)}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Återkalla åtkomst
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nekade användare ({rejectedUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {profilesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : rejectedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga nekade användare.</p>
            ) : (
              <ul className="divide-y divide-border">
                {rejectedUsers.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {u.email ?? u.id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Registrerad {new Date(u.createdAt).toLocaleDateString("sv-SE")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={approveMutation.isPending}
                        onClick={() => approveMutation.mutate(u.id)}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Godkänn
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Notisprenumeranter ({subscribersQuery.data?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscribersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : (subscribersQuery.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Inga prenumeranter ännu.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(subscribersQuery.data as NotificationSubscriber[]).map((s) => (
                  <li key={s.userId} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.favoriteTeam || "Inget favoritlag"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {s.enabled && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                            För-/eftermatch
                          </span>
                        )}
                        {s.digestEnabled && (
                          <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-600 dark:text-blue-400">
                            Veckodigest
                          </span>
                        )}
                        {!s.enabled && !s.digestEnabled && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            Inaktiv
                          </span>
                        )}
                      </div>
                    </div>
                    {s.lastPostgameEmailDate && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        Senaste matchmail: {s.lastPostgameEmailDate}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nuvarande administratörer ({admins.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Laddar…</p>
            ) : admins.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga administratörer.</p>
            ) : (
              <ul className="divide-y divide-border">
                {admins.map((a) => {
                  const isSelf = a.userId === currentUserId;
                  return (
                    <li
                      key={a.userId}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {a.email ?? a.userId}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (du)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.lastSignInAt
                            ? `Senast inloggad ${new Date(a.lastSignInAt).toLocaleDateString("sv-SE")}`
                            : "Har ännu inte loggat in"}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSelf || revokeMutation.isPending}
                        onClick={() => {
                          if (confirm(`Ta bort admin-behörighet för ${a.email ?? a.userId}?`)) {
                            revokeMutation.mutate(a.userId);
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Ta bort
                      </Button>
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
