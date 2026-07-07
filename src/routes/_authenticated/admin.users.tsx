import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import {
  inviteAdmin,
  listAdmins,
  revokeAdmin,
  type AdminUser,
} from "@/lib/admin-users.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  const invite = useServerFn(inviteAdmin);
  const revoke = useServerFn(revokeAdmin);

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

  const inviteMutation = useMutation({
    mutationFn: (e: string) => invite({ data: { email: e } }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
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

  const admins: AdminUser[] = listQuery.data?.admins ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin-användare</h1>
            <p className="text-sm text-muted-foreground">
              Bjud in nya administratörer och hantera behörigheter.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
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
