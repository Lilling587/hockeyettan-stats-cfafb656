import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/users.functions";

type ProfileStatus = "approved" | "pending" | "rejected" | "missing";

async function getApprovalStatus(userId: string): Promise<ProfileStatus | null> {
  const { data } = await supabase
    .from("profiles")
    .select("approval_status")
    .eq("id", userId)
    .maybeSingle();
  const status = (data as { approval_status?: string } | null)?.approval_status;
  if (status === "approved" || status === "pending" || status === "rejected") return status;
  return status ? (status as ProfileStatus) : null;
}

async function getUserRoles(userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role);
}

const ALLOWED_NEXT = new Set([
  "/",
  "/notifications",
  "/admin/vmix",
  "/admin/health",
  "/admin/logs",
  "/admin/usage",
  "/admin/users",
  "/admin/audit",
]);
const DEFAULT_NEXT = "/";

const authSearchSchema = z.object({
  message: z.string().optional(),
  next: z.string().optional(),
  pending: z.string().optional(),
});

function safeNext(next: string | undefined): string {
  return next && ALLOWED_NEXT.has(next) ? next : DEFAULT_NEXT;
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · HockeyEttan Södra briefing" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: authSearchSchema,
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function isExistingAccountSignup(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  const identities = (user as { identities?: unknown }).identities;
  return Array.isArray(identities) && identities.length === 0;
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const logEvent = useServerFn(logAuditEvent);

  const next = safeNext(search.next);
  const isAdminFlow = next.startsWith("/admin/");

  useEffect(() => {
    if (search.message === "password-reset") {
      toast.success("Password reset successfully. Sign in with your new password.");
      navigate({ to: "/auth", search: { next: search.next }, replace: true });
    }
  }, [search.message, search.next, navigate]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled || !data.session?.user) return;
      const user = data.session.user;
      const [status, roles] = await Promise.all([
        getApprovalStatus(user.id),
        getUserRoles(user.id),
      ]);
      setUserEmail(user.email ?? null);
      setUserRoles(roles);
      if (status !== "approved") {
        navigate({ to: "/auth", search: { pending: status ?? "missing" }, replace: true });
        return;
      }
      navigate({ to: next, replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        toast.success("Check your inbox for a reset link");
        setMode("signin");
      } else if (mode === "signup") {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (isExistingAccountSignup(signUpData.user)) {
          toast.info("Kontot finns redan. Logga in eller återställ lösenordet om du saknar åtkomst.");
          setMode("signin");
          return;
        }
        if (signUpData.session?.user) {
          void logEvent({ data: { action: "signup" } });
        }
        toast.success("Kontot skapat! Kontrollera din e-post för att bekräfta.");
        setMode("signin");
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        const user = signInData.user!;
        const [status, roles] = await Promise.all([
          getApprovalStatus(user.id),
          getUserRoles(user.id),
        ]);
        setUserEmail(user.email ?? null);
        setUserRoles(roles);
        if (status !== "approved") {
          navigate({ to: "/auth", search: { pending: status ?? "missing" }, replace: true });
          return;
        }
        void logEvent({ data: { action: "login" } });
        navigate({ to: next, replace: true });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signup"
      ? "Skapa konto"
      : mode === "forgot"
        ? "Återställ lösenord"
        : isAdminFlow
          ? "Admin – logga in"
          : "Logga in";


  const pending = search.pending as ProfileStatus | undefined;
  const pendingLabel =
    pending === "rejected"
      ? "Ditt konto har nekats åtkomst. Kontakta en admin om du tror detta är fel."
      : pending === "missing"
        ? "Din profil saknas i systemet. Kontakta en admin."
        : "Ditt konto väntar på godkännande av en admin. Du får åtkomst så snart den är klar.";

  const statusBadge =
    pending === "approved" ? (
      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Godkänd</Badge>
    ) : pending === "rejected" ? (
      <Badge variant="destructive">Nekad</Badge>
    ) : (
      <Badge variant="outline" className="text-amber-600 border-amber-600">Väntar</Badge>
    );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{pending ? "Ditt konto" : title}</CardTitle>
        </CardHeader>
        <CardContent>
          {pending && (
            <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">E-post</span>
                <span className="truncate text-sm">{userEmail ?? "–"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">Status</span>
                {statusBadge}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">Roll</span>
                <span className="text-sm">
                  {userRoles.length > 0 ? userRoles.join(", ") : "Användare"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground pt-1 border-t border-border">
                {pendingLabel}
              </p>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => setMode("forgot")}
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>
            )}
           <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? "Vänta…"
                : mode === "signup"
                  ? "Skapa konto"
                  : mode === "forgot"
                    ? "Skicka återställningslänk"
                    : "Logga in"}
            </Button>

            {mode === "forgot" && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline w-full text-center"
                onClick={() => setMode("signin")}
              >
                ← Tillbaka till inloggning
              </button>
            )}

            {!isAdminFlow && mode !== "forgot" && (
              <p className="text-center text-xs text-muted-foreground">
                {mode === "signin" ? (
                  <>
                    Inget konto?{" "}
                    <button
                      type="button"
                      className="hover:underline font-medium"
                      onClick={() => setMode("signup")}
                    >
                      Skapa konto
                    </button>
                  </>
                ) : (
                  <>
                    Har du redan ett konto?{" "}
                    <button
                      type="button"
                      className="hover:underline font-medium"
                      onClick={() => setMode("signin")}
                    >
                      Logga in
                    </button>
                  </>
                )}
              </p>
            )}

            {isAdminFlow && (
              <p className="text-center text-xs text-muted-foreground">
                Adminbehörighet krävs. Kontakta en befintlig admin för att få åtkomst.
              </p>
            )}

            <div className="text-center">
              <Link to="/" className="text-xs text-muted-foreground hover:underline">
                ← Tillbaka till matchstatistik
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
