import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getMyNotificationPrefs,
  saveMyNotificationPrefs,
  sendTestPregameEmail,
} from "@/lib/notifications.functions";
import { listTeams } from "@/lib/stats.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Email notifications · HockeyEttan Södra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const fetchPrefs = useServerFn(getMyNotificationPrefs);
  const savePrefs = useServerFn(saveMyNotificationPrefs);
  const sendTest = useServerFn(sendTestPregameEmail);
  const fetchTeams = useServerFn(listTeams);

  const prefsQuery = useQuery({
    queryKey: ["notification-prefs"],
    queryFn: () => fetchPrefs(),
  });
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => fetchTeams({ data: {} }),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const [email, setEmail] = useState("");
  const [favorite, setFavorite] = useState("Grästorps IK");
  const [enabled, setEnabled] = useState(false);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestDow, setDigestDow] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (prefsQuery.data) {
      setEmail(prefsQuery.data.email);
      setFavorite(prefsQuery.data.favorite_team);
      setEnabled(prefsQuery.data.enabled);
      setDigestEnabled(prefsQuery.data.digest_enabled);
      setDigestDow(prefsQuery.data.digest_dow);
    }
  }, [prefsQuery.data]);

  const teams: string[] = (teamsQuery.data?.teams as string[] | undefined) ?? [];

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await savePrefs({
        data: { email, favorite_team: favorite, enabled },
      });
      toast.success("Saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onSendTest = async () => {
    setTesting(true);
    try {
      await sendTest({ data: { email, favorite_team: favorite } });
      toast.success(`Test email sent to ${email}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Email notifications
            </h1>
            <p className="text-sm text-muted-foreground">
              Get a pre-game briefing email on the morning of game day.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Briefing
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your preferences</CardTitle>
          </CardHeader>
          <CardContent>
            {prefsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Send to</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Favorite team</Label>
                  <Select value={favorite} onValueChange={setFavorite}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(teams.length
                        ? teams
                        : [favorite]
                      ).map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    You'll only get an email on days your favorite team plays.
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">
                      Email me on game days
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Sent at 13:00 Europe/Stockholm.
                    </div>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save preferences"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onSendTest}
                    disabled={testing || !email}
                  >
                    {testing ? "Sending…" : "Send test email now"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={signOut}
                    className="ml-auto"
                  >
                    Sign out
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
