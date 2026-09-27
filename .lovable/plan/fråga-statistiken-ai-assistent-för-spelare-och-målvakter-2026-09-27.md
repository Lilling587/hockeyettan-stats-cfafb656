# Fråga statistiken – AI-assistent för spelare och målvakter

## Vad du får
- En ny sida **"Fråga statistiken"** (länk från Spelare-sidan) där inloggade, godkända användare ställer frågor på svenska, t.ex. "Vilken målvakt har bäst SV% i Grästorp?" eller "Vem har flest PIM bland backar?".
- En enda konversation per konto, sparad i databasen så den finns kvar mellan enheter. Knappen "Börja om" rensar den.
- Svaren bygger på appens egen statistik (samma data som Spelare-sidan: GP, G, A, P, PIM, SV%, GAA, SO) för vald säsong. Assistenten hittar inte på siffror; saknas data säger den det.
- Verktygsanrop visas som små hopfällda rutor ("Hämtade spelarstatistik 2025–26") så man ser varifrån svaret kommer.
- Tydliga felmeddelanden om AI-krediterna är slut eller om för många frågor ställs.

## Kostnadsskydd
- Endast godkända konton når sidan (samma spärr som admin-sidorna).
- Enkel gräns: max 30 frågor per användare och dygn.

## Teknisk sektion
- **Databas:** tabell `stats_chat_messages` (id uuid, user_id, role, parts jsonb, message_id text, created_at) med GRANT + RLS scoped till `auth.uid()`. Dygnsgränsen räknas på user-rader senaste 24 h.
- **Route:** `src/routes/_authenticated/fraga.tsx` (lägg `/fraga` i `ALLOWED_NEXT`), egen `head()`.
- **Server:** streaming-endpoint `src/routes/api/stats-chat.ts` som verifierar bearer-token + `approval_status`, laddar historik, kör AI SDK `streamText` mot Lovable AI Gateway Responses (`openai/gpt-6-astra`, reasoning low/medium, `store:false`), `stopWhen(stepCountIs(50))`, sparar meddelanden i `onFinish` med felkontroll.
- **Verktyg (Zod, kompakta resultat):** `search_players` (säsong, lag, position, sortering, limit) och `get_player` (namn) som anropar befintliga `fetchAllLeaguePlayers`; `list_teams` via `team-short-names.ts`.
- Provider via Responses-hjälpare (`@ai-sdk/openai` `.responses`) med run-ID-fetch; `LOVABLE_API_KEY` server-side. Fel 402/403/429 skickas vidare till UI.
- **UI:** AI Elements (Conversation, Message, MessageResponse, PromptInput, Tool) + `useChat`, textfält alltid i fokus, egen hockey-ikon som assistentidentitet.
- **Verifiering:** typecheck, befintliga tester, riktig fråga i webbläsaren inloggad, omladdning visar sparad konversation.
