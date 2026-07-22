import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserMinus, UserPlus } from "lucide-react";
import type { GameFlowResultDto } from "@/lib/game-flow.functions";

function formatName(raw: string): string {
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length === 2 && parts[1]) return `${parts[1]} ${parts[0]}`;
  return raw;
}

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
        {diff?.lineupAvailable && diff.previousDate && (
          <p className="text-xs text-muted-foreground">
            Förändringar jämfört med {diff.previousDate}
            {diff.previousOpponent ? ` mot ${diff.previousOpponent}` : ""}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {!diff?.lineupAvailable ? (
          <p className="text-sm text-muted-foreground">
            Laguppställning saknas — behöver minst två spelade matcher.
          </p>
        ) : diff.newInLineup.length === 0 && diff.outOfLineup.length === 0 ? (
          <p className="text-sm text-muted-foreground">Oförändrad laguppställning.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* In */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <UserPlus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>In</span>
                <Badge variant="outline">{diff.newInLineup.length}</Badge>
              </div>
              {diff.newInLineup.length === 0 ? (
                <p className="text-xs text-muted-foreground">Inga nya.</p>
              ) : (
                <ul className="space-y-1">
                  {diff.newInLineup.map((name) => (
                    <li key={name} className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      {formatName(name)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Out */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <UserMinus className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Ut</span>
                <Badge variant="outline">{diff.outOfLineup.length}</Badge>
              </div>
              {diff.outOfLineup.length === 0 ? (
                <p className="text-xs text-muted-foreground">Inga borta.</p>
              ) : (
                <ul className="space-y-1">
                  {diff.outOfLineup.map((name) => (
                    <li key={name} className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      {formatName(name)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
