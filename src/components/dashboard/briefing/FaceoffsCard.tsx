import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Briefing } from "@/lib/stats.functions";

type TeamFaceoffs = NonNullable<Briefing["home"]["faceoffs"]>;

function TeamColumn({ team }: { team: Briefing["home"] }) {
  const fo: TeamFaceoffs | null = team.faceoffs ?? null;
  const teamPct = fo?.teamFoPct;
  const players = fo?.players?.slice(0, 3) ?? [];

  if (!fo) {
    return (
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {team.name}
        </div>
        <p className="text-sm text-muted-foreground">Ingen data</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {team.name}
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {teamPct == null ? "–" : `${teamPct.toFixed(1)}%`}
      </div>
      {players.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {players.map((p) => (
            <li key={p.name} className="tabular-nums">
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground">
                {" "}
                — {p.foPct.toFixed(1)}% ({p.foTotal})
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Inga spelare med minst 10 tekningar</p>
      )}
    </div>
  );
}

export function FaceoffsCard({ briefing }: { briefing: Briefing }) {
  return (
    <section id="faceoffs">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tekningar (FO%)</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Spelare med minst 10 tekningar</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <TeamColumn team={briefing.home} />
            <TeamColumn team={briefing.away} />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
