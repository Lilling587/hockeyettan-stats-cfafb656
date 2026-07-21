import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { daysSinceLast, type TeamData } from "@/lib/dashboard-utils";

export function RestDaysCard({ home, away }: { home: TeamData; away: TeamData }) {
  const h = daysSinceLast(home);
  const a = daysSinceLast(away);
  const edge: "home" | "away" | "even" | null =
    h.days == null || a.days == null
      ? null
      : h.days === a.days
        ? "even"
        : h.days > a.days
          ? "home"
          : "away";
  const fmt = (n: number | null) =>
    n == null ? "—" : n === 0 ? "Idag" : n === 1 ? "1 dag" : `${n} dagar`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vila sedan senaste match</CardTitle>
        <p className="text-xs text-muted-foreground">Antal dagar sen senaste match.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className={`text-right ${edge === "home" ? "font-semibold" : ""}`}>
            <div className="text-xs text-muted-foreground">{home.name}</div>
            <div className="font-mono text-2xl">{fmt(h.days)}</div>
            {h.days != null && h.days <= 1 ? <Badge variant="destructive" className="mt-1">Back-to-back</Badge> : null}
          </div>
          <div className="text-center text-xs text-muted-foreground">vs</div>
          <div className={edge === "away" ? "font-semibold" : ""}>
            <div className="text-xs text-muted-foreground">{away.name}</div>
            <div className="font-mono text-2xl">{fmt(a.days)}</div>
            {a.days != null && a.days <= 1 ? <Badge variant="destructive" className="mt-1">Back-to-back</Badge> : null}
          </div>
        </div>
        <div className="mt-3 text-center">
          {edge === "even" ? (
            <Badge variant="secondary">Lika utvilade</Badge>
          ) : edge == null ? (
            <Badge variant="outline">Saknar data</Badge>
          ) : (
            <Badge variant="default">Fördel {edge === "home" ? home.name : away.name}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
