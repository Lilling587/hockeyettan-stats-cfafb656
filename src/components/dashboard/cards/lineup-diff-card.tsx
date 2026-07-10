import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GameFlowResultDto } from "@/lib/game-flow.functions";

export function LineupDiffCard({
  teamName,
  data,
}: {
  teamName: string;
  data: GameFlowResultDto | null | undefined;
}) {
  const diff = data?.lineupDiff;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{teamName} · Laguppställning</CardTitle>
        <p className="text-xs text-muted-foreground">
          Avvikelser mellan aktuell trupp och senaste spelade matchens laguppställning.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!diff || !diff.lineupAvailable ? (
          <p className="text-sm text-muted-foreground">
            {diff?.gameId
              ? "Laguppställning saknas för senaste matchen."
              : "Ingen spelad match hittades."}
          </p>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              Senaste match: {diff.date} mot {diff.opponent} · {diff.playedCount} spelare
              i truppen ({diff.rosterSize} på säsongens lagsida)
            </div>

            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                <span>På truppen — ej med senast</span>
                <Badge variant="secondary">{diff.missingFromLastGame.length}</Badge>
              </div>
              {diff.missingFromLastGame.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ingen avvikelse.</p>
              ) : (
                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
                  {diff.missingFromLastGame.map((name) => (
                    <li key={name} className="font-mono text-xs">
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {diff.playedButNotOnRoster.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                  <span>Spelade senast — ej på trupplistan</span>
                  <Badge variant="outline">{diff.playedButNotOnRoster.length}</Badge>
                </div>
                <ul className="max-h-32 space-y-0.5 overflow-y-auto text-sm">
                  {diff.playedButNotOnRoster.map((name) => (
                    <li key={name} className="font-mono text-xs">
                      {name}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Ofta uppflyttade juniorer eller nyförvärv som inte hunnit läggas till
                  på trupplistan.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
