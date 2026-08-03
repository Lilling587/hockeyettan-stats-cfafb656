/**
 * Anchor-ID:n som finns i `BriefingView` (src/components/dashboard/briefing-view.tsx).
 * Används av Bitfocus Companion för att djuplänka direkt till en sektion i
 * producent-briefingen — ingen manuell copy/paste behövs.
 *
 * Anchors fungerar bara när en matchup är vald (BriefingView renderas) och
 * kräver en inloggad session i webbläsaren. De ligger på rot-routen `/`.
 */

export type BriefingAnchorId =
  | "briefing-capture"
  | "storylines"
  | "form"
  | "venue"
  | "periods"
  | "h2h"
  | "scorers"
  | "goalies"
  | "shots"
  | "special"
  | "faceoffs"
  | "probability"
  | "hot"
  | "streaks"
  | "discipline";

export type BriefingAnchor = {
  id: BriefingAnchorId;
  label: string;
};

export const BRIEFING_ANCHORS: readonly BriefingAnchor[] = [
  { id: "briefing-capture", label: "Toppen (hela briefingen)" },
  { id: "storylines", label: "Kommentatorns snackisar" },
  { id: "form", label: "Form" },
  { id: "venue", label: "Hemma/borta-svit" },
  { id: "periods", label: "Periodmål" },
  { id: "h2h", label: "Inbördes möten" },
  { id: "scorers", label: "Toppscorers" },
  { id: "goalies", label: "Målvakter" },
  { id: "shots", label: "Skottvolym" },
  { id: "special", label: "Special teams" },
  { id: "faceoffs", label: "Avtappningar" },
  { id: "probability", label: "Vinstsannolikhet" },
  { id: "hot", label: "Hetaste spelaren" },
  { id: "streaks", label: "Streak alerts" },
  { id: "discipline", label: "Disciplin" },
] as const;


export const BRIEFING_ENVIRONMENTS = {
  preview: "https://id-preview--b5d9d92f-3d6c-4d04-99c2-25be99cec0a2.lovable.app",
  published: "https://hockeyettan-stats.lovable.app",
  custom: "https://hockeyettan-stats.spdproduktion.se",
} as const;

export type BriefingEnvironment = keyof typeof BRIEFING_ENVIRONMENTS;

export function briefingAnchorUrl(env: BriefingEnvironment, id: BriefingAnchorId): string {
  return `${BRIEFING_ENVIRONMENTS[env]}/#${id}`;
}

export function buildBriefingAnchorMap(): Record<
  BriefingEnvironment,
  Record<BriefingAnchorId, string>
> {
  const envs = Object.keys(BRIEFING_ENVIRONMENTS) as BriefingEnvironment[];
  const out = {} as Record<BriefingEnvironment, Record<BriefingAnchorId, string>>;
  for (const env of envs) {
    const anchors = {} as Record<BriefingAnchorId, string>;
    for (const a of BRIEFING_ANCHORS) {
      anchors[a.id] = briefingAnchorUrl(env, a.id);
    }
    out[env] = anchors;
  }
  return out;
}
