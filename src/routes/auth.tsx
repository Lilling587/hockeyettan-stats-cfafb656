import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/users.functions";

async function getApprovalStatus(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("approval_status")
    .eq("id", userId)
    .maybeSingle();
  return (data as { approval_status?: string } | null)?.approval_status ?? null;
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

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
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
      const status = await getApprovalStatus(data.session.user.id);
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
        const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
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
        const status = await getApprovalStatus(signInData.user!.id);
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


  const pending = search.pending;
  const pendingLabel =
    pending === "rejected"
      ? "Ditt konto har nekats åtkomst. Kontakta en admin om du tror detta är fel."
      : "Ditt konto väntar på godkännande av en admin. Du får åtkomst så snart den är klar.";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{pending ? "Väntar på godkännande" : title}</CardTitle>
        </CardHeader>
        <CardContent>
          {pending && (
            <div className="mb-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              {pendingLabel}
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
