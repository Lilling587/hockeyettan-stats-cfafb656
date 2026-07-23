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
  const recent = split.results.slice(0, 10);
  return (
    <div className="space-y-1.5 text-sm sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium shrink-0">{label} · sen. {recent.length}</span>
        <Badge variant={streakVariant(split.streak?.type)} className="tabular-nums shrink-0">
          {streakLabel(split.streak)}
        </Badge>
      </div>
      <div className="flex items-center gap-1 flex-wrap sm:justify-end">
        {recent.length === 0 ? (
          <span className="text-xs text-muted-foreground">inga</span>
        ) : (
          recent.map((r, i) => (
            <Badge
              key={i}
              variant={resultVariant(r)}
              className="text-[10px] px-1.5 h-4"
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
        <CardTitle className="text-base">{team.name} · Form</CardTitle>
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
