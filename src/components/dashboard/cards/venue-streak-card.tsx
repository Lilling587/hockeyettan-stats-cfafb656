import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  resultLabel,
  resultVariant,
  streakLabel,
  streakVariant,
  type TeamData,
} from "@/lib/dashboard-utils";

function VenueRow({
  label,
  split,
}: {
  label: string;
  split: NonNullable<TeamData["venueForm"]>["home"];
}) {
  const recent = split.results.slice(0, 5);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium shrink-0">{label}</span>
        <Badge variant={streakVariant(split.streak?.type)} className="tabular-nums shrink-0">
          {streakLabel(split.streak)}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        {recent.length === 0 ? (
          <span className="text-sm text-muted-foreground">inga</span>
        ) : (
          recent.map((r, i) => (
            <Badge
              key={i}
              variant={resultVariant(r)}
             className="flex-1 min-w-0 justify-center"
              title={`match ${i + 1} av ${split.results.length} (senaste först)`}
            >
              {resultLabel(r)}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

export function VenueStreakCard({ team }: { team: TeamData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {team.name} · Form{" "}
          <span className="text-sm text-muted-foreground font-normal">senaste 5</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!team.venueForm ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <div className="space-y-3">
            <VenueRow label="Hemma" split={team.venueForm.home} />
            <VenueRow label="Borta" split={team.venueForm.away} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
