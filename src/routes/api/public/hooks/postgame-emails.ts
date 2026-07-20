import { createFileRoute } from "@tanstack/react-router";

// Daily cron-driven endpoint. Delegates to the shared sender so the
// admin-triggered "Match avslutad – uppdatera" path uses identical logic.

export const Route = createFileRoute("/api/public/hooks/postgame-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.toLowerCase().startsWith("bearer ")
          ? auth.slice(7).trim()
          : "";
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { sendPostgameEmails } = await import(
          "@/lib/postgame-email-sender.server"
        );
        const origin = new URL(request.url).origin;
        try {
          const result = await sendPostgameEmails(origin);
          return Response.json(result);
        } catch (err) {
          return Response.json(
            { error: (err as Error).message },
            { status: 500 },
          );
        }
      },
    },
  },
});
