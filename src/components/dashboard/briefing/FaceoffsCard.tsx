import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Briefing } from "@/lib/stats.functions";
import { Info } from "lucide-react";


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
          <CardTitle className="text-base flex items-center gap-2">
            Tekningar (FO%)
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Förklaring av FO%"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>
                    FO% (Faceoff-procent) visar hur stor andel av lagets tekningar
                    som vunnits. Lagvärdet är det totala antalet vunna tekningar
                    dividerat med alla tekningar för laget.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
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
