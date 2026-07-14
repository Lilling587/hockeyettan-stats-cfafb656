// Plain HTML email templates. Kept dependency-free so the cron route can
// build messages without React rendering.

export type PregameEmailInput = {
  favoriteTeam: string;
  home: string;
  away: string;
  dateISO: string;
  briefingUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
};


export function renderPregameEmail(input: PregameEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { favoriteTeam, home, away, dateISO, briefingUrl, unsubscribeUrl, manageUrl } = input;
  const isHome = home === favoriteTeam;
  const opponent = isHome ? away : home;
  const venue = isHome ? "home" : "away";

  const subject = `${favoriteTeam} plays today — ${home} vs ${away}`;
  const text = `${favoriteTeam} plays ${opponent} (${venue}) today, ${dateISO}.\n\nFull producer briefing: ${briefingUrl}\n\nManage notifications: ${manageUrl}\nUnsubscribe: ${unsubscribeUrl}\n`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">Game day · ${escapeHtml(dateISO)}</div>
    <h1 style="margin:8px 0 4px;font-size:22px;line-height:1.25;color:#f8fafc">
      ${escapeHtml(home)} <span style="color:#64748b">vs</span> ${escapeHtml(away)}
    </h1>
    <p style="margin:0 0 20px;color:#cbd5e1;font-size:14px">
      ${escapeHtml(favoriteTeam)} plays <strong>${escapeHtml(opponent)}</strong> (${venue}) today.
    </p>
    <a href="${escapeAttr(briefingUrl)}"
       style="display:inline-block;background:#22d3ee;color:#0b1220;font-weight:600;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">
      Open producer briefing →
    </a>
    <p style="margin:24px 0 0;color:#64748b;font-size:11px;line-height:1.6">
      You're getting this because you enabled game-day notifications.<br>
      <a href="${escapeAttr(manageUrl)}" style="color:#94a3b8;text-decoration:underline">Manage notifications</a>
      &nbsp;·&nbsp;
      <a href="${escapeAttr(unsubscribeUrl)}" style="color:#94a3b8;text-decoration:underline">Unsubscribe</a>
    </p>
  </div>
</body></html>`;


  return { subject, html, text };
}

export type PostgameEmailInput = {
  favoriteTeam: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  dateISO: string;
  recapUrl: string;
  topScorers: Array<{ name: string; teamCode: string; goals: number; assists: number }>;
  gameUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
};

export function renderPostgameEmail(input: PostgameEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { favoriteTeam, home, away, homeGoals, awayGoals, dateISO, recapUrl, topScorers, gameUrl, unsubscribeUrl, manageUrl } = input;
  const favGoals = home === favoriteTeam ? homeGoals : awayGoals;
  const oppGoals = home === favoriteTeam ? awayGoals : homeGoals;
  const opponent = home === favoriteTeam ? away : home;
  const outcome =
    favGoals > oppGoals ? "Vinst" : favGoals < oppGoals ? "Förlust" : "Oavgjort";

  const subject = `${outcome} ${favGoals}–${oppGoals} mot ${opponent} — ${dateISO}`;
  const scorersText = topScorers
    .slice(0, 5)
    .map((p) => `  ${p.teamCode}  ${p.name}  ${p.goals}M ${p.assists}A`)
    .join("\n");
  const text = `${home} ${homeGoals}–${awayGoals} ${away}\n${outcome} för ${favoriteTeam}.\n\nTopp-poängplockare:\n${scorersText || "  (inga måldata)"}\n\nRecap: ${recapUrl}\nMatchprotokoll: ${gameUrl}\n\nHantera notiser: ${manageUrl}\nAvregistrera: ${unsubscribeUrl}\n`;

  const scorersHtml = topScorers
    .slice(0, 5)
    .map(
      (p) =>
        `<tr><td style="padding:4px 8px 4px 0;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#94a3b8">${escapeHtml(p.teamCode)}</td><td style="padding:4px 0;color:#e5e7eb;font-size:14px">${escapeHtml(p.name)}</td><td style="padding:4px 0;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#94a3b8">${p.goals}M ${p.assists}A</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee">Postgame · ${escapeHtml(dateISO)}</div>
    <h1 style="margin:8px 0 4px;font-size:22px;line-height:1.25;color:#f8fafc">
      ${escapeHtml(home)} <span style="color:#64748b">${homeGoals} – ${awayGoals}</span> ${escapeHtml(away)}
    </h1>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:14px">
      <strong>${escapeHtml(outcome)}</strong> för ${escapeHtml(favoriteTeam)} mot ${escapeHtml(opponent)}.
    </p>
    ${scorersHtml ? `<table style="width:100%;border-collapse:collapse;margin:0 0 20px"><tbody>${scorersHtml}</tbody></table>` : ""}
    <a href="${escapeAttr(recapUrl)}"
       style="display:inline-block;background:#22d3ee;color:#0b1220;font-weight:600;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">
      Öppna full recap →
    </a>
    <p style="margin:16px 0 0;font-size:12px">
      <a href="${escapeAttr(gameUrl)}" style="color:#94a3b8">Matchprotokoll ↗</a>
    </p>
    <p style="margin:24px 0 0;color:#64748b;font-size:11px;line-height:1.6">
      You're getting this because you enabled game-day notifications.<br>
      <a href="${escapeAttr(manageUrl)}" style="color:#94a3b8;text-decoration:underline">Hantera notiser</a>
      &nbsp;·&nbsp;
      <a href="${escapeAttr(unsubscribeUrl)}" style="color:#94a3b8;text-decoration:underline">Avregistrera</a>
    </p>
  </div>
</body></html>`;


  return { subject, html, text };
}


function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type DigestGame = {
  dateISO: string;
  home: string;
  away: string;
  isHome: boolean;
  opponent: string;
};

export type DigestEmailInput = {
  favoriteTeam: string;
  weekLabel: string;
  games: DigestGame[];
  briefingUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
};

export function renderDigestEmail(input: DigestEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { favoriteTeam, weekLabel, games, briefingUrl, unsubscribeUrl, manageUrl } = input;
  const count = games.length;
  const subject =
    count === 0
      ? `${favoriteTeam} — inga matcher denna vecka (${weekLabel})`
      : `${favoriteTeam} — ${count} match${count === 1 ? "" : "er"} denna vecka (${weekLabel})`;

  const textLines = games.length
    ? games.map(
        (g) =>
          `  ${g.dateISO}  ${g.home} vs ${g.away}  (${g.isHome ? "hemma" : "borta"} mot ${g.opponent})`,
      )
    : ["  Inga matcher denna vecka."];
  const text = `Veckans matcher för ${favoriteTeam} (${weekLabel}):\n${textLines.join("\n")}\n\nBriefing: ${briefingUrl}\n\nHantera notiser: ${manageUrl}\nAvregistrera: ${unsubscribeUrl}\n`;

  const rowsHtml = games.length
    ? games
        .map(
          (g) =>
            `<tr><td style="padding:8px 12px 8px 0;color:#94a3b8;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:nowrap">${escapeHtml(g.dateISO)}</td><td style="padding:8px 0;color:#e5e7eb;font-size:14px">${escapeHtml(g.home)} <span style="color:#64748b">vs</span> ${escapeHtml(g.away)}</td><td style="padding:8px 0 8px 12px;text-align:right;color:#94a3b8;font-size:12px;white-space:nowrap">${g.isHome ? "hemma" : "borta"}</td></tr>`,
        )
        .join("")
    : `<tr><td style="padding:12px 0;color:#94a3b8;font-size:14px">Inga matcher denna vecka.</td></tr>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee">Veckans digest · ${escapeHtml(weekLabel)}</div>
    <h1 style="margin:8px 0 4px;font-size:22px;line-height:1.25;color:#f8fafc">${escapeHtml(favoriteTeam)}</h1>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:14px">${count === 0 ? "Inga matcher denna vecka." : `${count} match${count === 1 ? "" : "er"} kommer.`}</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px"><tbody>${rowsHtml}</tbody></table>
    <a href="${escapeAttr(briefingUrl)}" style="display:inline-block;background:#22d3ee;color:#0b1220;font-weight:600;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Öppna briefing →</a>
    <p style="margin:24px 0 0;color:#64748b;font-size:11px;line-height:1.6">
      Du får detta veckobrev för att du aktiverat digest-notiser.<br>
      <a href="${escapeAttr(manageUrl)}" style="color:#94a3b8;text-decoration:underline">Hantera notiser</a>
      &nbsp;·&nbsp;
      <a href="${escapeAttr(unsubscribeUrl)}" style="color:#94a3b8;text-decoration:underline">Avregistrera</a>
    </p>
  </div>
</body></html>`;

  return { subject, html, text };
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
