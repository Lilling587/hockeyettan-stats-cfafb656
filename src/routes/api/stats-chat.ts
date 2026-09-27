import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { authorizeApprovedUser, DAILY_QUESTION_LIMIT } from "@/lib/ai/stats-chat.server";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai/run-id.server";
import { asJson } from "@/lib/json";

const MODEL = "openai/gpt-6-astra";

const bodySchema = z.object({ messages: z.array(z.unknown()) });

function systemPrompt(seasonLabels: string[], defaultSeason: string) {
  return `Du är statistikassistenten för HockeyEttan Södra i appen till Grästorps IK:s sändningar.
Svara alltid på svenska, kort och tydligt, gärna med en liten markdown-tabell när du listar flera spelare.
Använd ALLTID verktygen för att hämta siffror – hitta aldrig på statistik. Om data saknas, säg det.
Tillgängliga säsonger: ${seasonLabels.join(", ")}. Standard är ${defaultSeason} om användaren inte anger något.
Om en säsong saknar spelad statistik (alla värden tomma eller 0 matcher), säg det och använd föregående säsong istället.
Positioner: G = målvakt, D = back, F/C/LW/RW = forward. Målvakter har SV% (räddningsprocent), GAA (insläppta mål per match) och SO (hållna nollor).
Lagkoder är förkortningar (t.ex. GRÄ = Grästorps IK). Använd list_teams om du är osäker på en kod.
Vid topplistor på SV% eller GAA: räkna bara målvakter med minst 5 matcher om användaren inte säger annat, och nämn det.
Håll svaret under cirka 200 ord.`;
}

export const Route = createFileRoute("/api/stats-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authz = await authorizeApprovedUser(request);
        if (authz instanceof Response) return authz;
        const { supabase, userId } = authz;

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Ogiltig förfrågan.", { status: 400 });
        const messages = parsed.data.messages as UIMessage[];
        const last = messages[messages.length - 1];
        if (!last || last.role !== "user") return new Response("Ingen fråga hittades.", { status: 400 });

        // Daily limit
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { count, error: countErr } = await supabase
          .from("stats_chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("role", "user")
          .gte("created_at", since);
        if (countErr) return new Response("Kunde inte läsa historiken.", { status: 500 });
        if ((count ?? 0) >= DAILY_QUESTION_LIMIT) {
          return new Response(
            `Du har ställt ${DAILY_QUESTION_LIMIT} frågor senaste dygnet. Försök igen senare.`,
            { status: 429 },
          );
        }

        const { error: insErr } = await supabase.from("stats_chat_messages").insert({
          user_id: userId,
          role: "user",
          parts: asJson(last.parts),
          message_id: last.id,
        });
        if (insErr) return new Response("Kunde inte spara frågan.", { status: 500 });

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("AI-tjänsten är inte konfigurerad.", { status: 500 });

        const { SEASONS, DEFAULT_SEASON, getSeason } = await import("@/lib/seasons.config");
        const { fetchAllLeaguePlayers } = await import("@/lib/stats.server");
        const cache = new Map<string, Awaited<ReturnType<typeof fetchAllLeaguePlayers>>>();
        const loadPlayers = async (label?: string | null) => {
          const season = getSeason(label ?? DEFAULT_SEASON.label);
          if (!cache.has(season.label)) cache.set(season.label, await fetchAllLeaguePlayers(season));
          return { season: season.label, players: cache.get(season.label)! };
        };

        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const result = streamText({
          model: provider.responses(MODEL),
          system: systemPrompt(SEASONS.map((s) => s.label), DEFAULT_SEASON.label),
          messages: await convertToModelMessages(messages),
          abortSignal: request.signal,
          stopWhen: stepCountIs(50),
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
          tools: {
            search_players: tool({
              description:
                "Sök och sortera spelare/målvakter i ligan för en säsong. Filtrera på lagkod, position och namn. Returnerar högst limit rader.",
              inputSchema: z.object({
                season: z.string().nullable().describe("Säsongsetikett, t.ex. 2025-26. null = standard"),
                team: z.string().nullable().describe("Lagkod, t.ex. GRÄ. null = alla lag"),
                position: z.enum(["G", "D", "F", "all"]).describe("G=målvakt, D=back, F=forward"),
                nameContains: z.string().nullable(),
                sortBy: z.enum(["points", "goals", "assists", "pim", "gamesPlayed", "savePct", "gaa", "shutouts"]),
                limit: z.number().describe("Antal rader, rekommenderat 10"),
              }),
              execute: async (input) => {
                const { season, players } = await loadPlayers(input.season);
                const asc = input.sortBy === "gaa";
                let rows = players.filter((p) => {
                  const pos = p.position.toUpperCase();
                  if (input.position === "G" && !pos.startsWith("G")) return false;
                  if (input.position === "D" && !pos.startsWith("D")) return false;
                  if (input.position === "F" && (pos.startsWith("G") || pos.startsWith("D"))) return false;
                  if (input.team && p.team.toUpperCase() !== input.team.toUpperCase()) return false;
                  if (input.nameContains && !p.name.toLowerCase().includes(input.nameContains.toLowerCase())) return false;
                  return true;
                });
                rows = rows.sort((a, b) => {
                  const av = a[input.sortBy];
                  const bv = b[input.sortBy];
                  if (av == null) return 1;
                  if (bv == null) return -1;
                  return asc ? av - bv : bv - av;
                });
                const limit = Math.min(Math.max(1, Math.round(input.limit || 10)), 30);
                return { season, total: rows.length, rows: rows.slice(0, limit) };
              },
            }),
            list_teams: tool({
              description: "Lista lagkoder som finns i spelarstatistiken för en säsong.",
              inputSchema: z.object({ season: z.string().nullable() }),
              execute: async ({ season: s }) => {
                const { season, players } = await loadPlayers(s);
                return { season, teams: Array.from(new Set(players.map((p) => p.team))).sort() };
              },
            }),
          },
        });

        const response = result.toUIMessageStreamResponse({
          originalMessages: messages,
          sendReasoning: true,
          onFinish: async ({ responseMessage }) => {
            const { error } = await supabase.from("stats_chat_messages").insert({
              user_id: userId,
              role: "assistant",
              parts: asJson(responseMessage.parts),
              message_id: responseMessage.id,
            });
            if (error) console.error("stats-chat: failed to save assistant message", error);
          },
          onError: (error) => {
            console.error("stats-chat error", error);
            const status = (error as { statusCode?: number })?.statusCode;
            if (status === 402) return "AI-krediterna är slut. Fyll på i inställningarna.";
            if (status === 429) return "För många frågor just nu. Vänta en stund och försök igen.";
            if (status === 403) return "AI-tjänsten nekade förfrågan.";
            return "Något gick fel när svaret skulle skapas.";
          },
        });
        return withLovableAiGatewayRunIdHeader(response, runIdFetch);
      },
    },
  },
});
