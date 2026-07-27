import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Monitor, Users } from "lucide-react";

export const Route = createFileRoute("/info")({
  head: () => ({
    meta: [
      { title: "HockeyEttan Södra · Grästorps IK" },
      {
        name: "description",
        content:
          "Broadcast-statistik för HockeyEttan Södra. Logga in för matchbriefing, spelarstatistik och vMix-integration.",
      },
    ],
  }),
  component: InfoPage,
});

type UserState = {
  email: string | null;
  roles: string[];
  status: "approved" | "pending" | "rejected" | "missing";
} | null;

function InfoPage() {
  const [user, setUser] = useState<UserState>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user;
      if (!sessionUser || cancelled) return;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("approval_status").eq("id", sessionUser.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", sessionUser.id),
      ]);
      const status = profile?.approval_status ?? "missing";
      setUser({
        email: sessionUser.email ?? null,
        roles: (roles ?? []).map((r) => r.role),
        status:
          status === "approved" || status === "pending" || status === "rejected"
            ? status
            : "missing",
      });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setUser(null);
      if (event === "SIGNED_IN" && session?.user) {
        const u = session.user;
        void Promise.all([
          supabase.from("profiles").select("approval_status").eq("id", u.id).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", u.id),
        ]).then(([{ data: profile }, { data: roles }]) => {
          const status = profile?.approval_status ?? "missing";
          setUser({
            email: u.email ?? null,
            roles: (roles ?? []).map((r) => r.role),
            status:
              status === "approved" || status === "pending" || status === "rejected"
                ? status
                : "missing",
          });
        });
      }
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isApproved = user?.status === "approved";
  const statusBadge =
    user?.status === "approved" ? (
      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Godkänd</Badge>
    ) : user?.status === "rejected" ? (
      <Badge variant="destructive">Nekad</Badge>
    ) : (
      <Badge variant="outline" className="text-amber-600 border-amber-600">Väntar</Badge>
    );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">HockeyEttan Södra</h1>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
              {statusBadge}
              <Button asChild variant="outline" size="sm">
                <Link to="/auth">Byt konto</Link>
              </Button>
            </div>
          ) : (
            <Button asChild variant="default" size="sm">
              <Link to="/auth">Logga in</Link>
            </Button>
          )}
        </div>
      </header>

      {user && (
        <div className="border-b border-border bg-muted/30">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="font-medium">Inloggad som:</span>{" "}
              <span className="text-muted-foreground">{user.email}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Roll:</span>
              <span>{user.roles.length > 0 ? user.roles.join(", ") : "Användare"}</span>
              <span className="mx-1 text-muted-foreground">·</span>
              <span className="text-muted-foreground">Status:</span>
              {statusBadge}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-12">
        <div className="space-y-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            HockeyEttan Stats
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Välj lag, få en komplett matchbriefing på sekunder och publicera data direkt till vMix.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {isApproved ? (
              <>
                <Button asChild size="lg">
                  <Link to="/">Gå till dashboard</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/spelare">Spelarstatistik</Link>
                </Button>
              </>
            ) : user ? (
              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" disabled>
                  {user.status === "rejected" ? "Konto nekat" : "Väntar på godkännande"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setUser(null);
                  }}
                >
                  Logga ut
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Monitor className="h-5 w-5" />
                Matchbriefing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Senaste form, målvakter, skott, special teams, tekningar och
                head-to-head – allt på ett ställe.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                Spelarstatistik
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Sök och filtrera bland alla spelare i ligan efter poäng, mål,
                assist och utvisningsminuter.
              </p>
            </CardContent>
          </Card>

          <Card className="sm:col-span-2 lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="20" height="14" x="2" y="3" rx="2" />
                  <line x1="8" x2="16" y1="21" y2="21" />
                  <line x1="12" x2="12" y1="17" y2="21" />
                </svg>
                vMix-integration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Publicera laguppställningar, resultat och tabell direkt till
              vMix.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
