import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, UserMinus, UserPlus } from "lucide-react";
import type {
  GameFlowResultDto,
  LineupPlayerChangeDto,
} from "@/lib/game-flow.functions";

function formatName(raw: string): string {
  // "Lastname, Firstname" → "Firstname Lastname"
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length === 2 && parts[1]) return `${parts[1]} ${parts[0]}`;
  return raw;
}

function PlayerRow({
  player,
  sampleSize,
  emphasis,
}: {
  player: LineupPlayerChangeDto;
  sampleSize: number;
  emphasis?: "warn" | "positive" | "muted";
}) {
  const priorSamples = Math.max(0, sampleSize - 1);
  const rateLabel =
    priorSamples > 0
      ? `${player.gamesPlayedOfLastN}/${sampleSize} senaste`
      : null;
  const lastLabel = player.lastPlayedDate
    ? `senast ${player.lastPlayedDate}${
        player.lastPlayedOpponent ? ` mot ${player.lastPlayedOpponent}` : ""
      }`
    : "har inte spelat i urvalet";

  const tone =
    emphasis === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : emphasis === "positive"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-muted-foreground";

  return (
    <li className="flex flex-col gap-0.5 border-l-2 border-border/60 pl-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{formatName(player.name)}</span>
        {!player.onRoster && (
          <Badge variant="outline" className="text-[10px]">
            ej på trupplistan
          </Badge>
        )}
      </div>
      <div className={`text-[11px] ${tone}`}>
        {rateLabel ? `${rateLabel} · ${lastLabel}` : lastLabel}
      </div>
    </li>
  );
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
        <p className="text-xs text-muted-foreground">
          Skador och förändringar jämfört med senaste matcherna.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!diff || !diff.lineupAvailable ? (
          <p className="text-sm text-muted-foreground">
            {diff?.gameId
              ? "Laguppställning saknas för senaste matchen."
              : "Ingen spelad match hittades."}
          </p>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              Senaste match: {diff.date} mot {diff.opponent} · {diff.playedCount}{" "}
              spelare i truppen ({diff.rosterSize} på säsongens lagsida).
              {diff.lineupSampleSize > 1 && (
                <> Jämför mot senaste {diff.lineupSampleSize} spelade matcher.</>
              )}
            </div>

            {/* Likely injured / absent */}
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Troligen skadad / borta</span>
                <Badge variant="secondary">{diff.likelyInjured.length}</Badge>
              </div>
              {diff.likelyInjured.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Ingen ordinarie spelare saknas.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {diff.likelyInjured.slice(0, 12).map((p) => (
                    <PlayerRow
                      key={p.name}
                      player={p}
                      sampleSize={diff.lineupSampleSize}
                      emphasis="warn"
                    />
                  ))}
                </ul>
              )}
            </section>

            {/* Diff vs previous game */}
            {(diff.newInLineup.length > 0 || diff.outOfLineup.length > 0) &&
              diff.previousDate && (
                <section>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Förändringar mot {diff.previousDate}
                    {diff.previousOpponent ? ` (${diff.previousOpponent})` : ""}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <UserPlus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>In i laguppställningen</span>
                        <Badge variant="outline">{diff.newInLineup.length}</Badge>
                      </div>
                      {diff.newInLineup.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Inga nya.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {diff.newInLineup.map((p) => (
                            <PlayerRow
                              key={p.name}
                              player={p}
                              sampleSize={diff.lineupSampleSize}
                              emphasis="positive"
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <UserMinus className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Ut ur laguppställningen</span>
                        <Badge variant="outline">{diff.outOfLineup.length}</Badge>
                      </div>
                      {diff.outOfLineup.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Inga borta.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {diff.outOfLineup.map((p) => (
                            <PlayerRow
                              key={p.name}
                              player={p}
                              sampleSize={diff.lineupSampleSize}
                              emphasis="warn"
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              )}

            {/* New call-ups / not on roster */}
            {diff.playedButNotOnRoster.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Spelade senast — ej på trupplistan</span>
                  <Badge variant="outline">{diff.playedButNotOnRoster.length}</Badge>
                </div>
                <ul className="space-y-0.5 text-sm">
                  {diff.playedButNotOnRoster.map((name) => (
                    <li key={name} className="font-medium">
                      {formatName(name)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Ofta uppflyttade juniorer eller nyförvärv som inte hunnit läggas
                  till på trupplistan.
                </p>
              </section>
            )}

            {/* Healthy scratches */}
            {diff.healthyScratches.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  <span>På trupp — spelar sällan</span>
                  <Badge variant="outline">{diff.healthyScratches.length}</Badge>
                </div>
                <ul className="space-y-0.5 text-sm">
                  {diff.healthyScratches.slice(0, 10).map((p) => (
                    <li key={p.name} className="text-muted-foreground">
                      {formatName(p.name)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
