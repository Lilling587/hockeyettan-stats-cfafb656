import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const DAILY_QUESTION_LIMIT = 30;

/** Creates a Supabase client that acts as the caller (RLS applies). */
export function createUserClient(accessToken: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type UserClient = ReturnType<typeof createUserClient>;

/** Verifies bearer token + approved profile. Returns client and userId or an error Response. */
export async function authorizeApprovedUser(
  request: Request,
): Promise<{ supabase: UserClient; userId: string } | Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return new Response("Du måste vara inloggad.", { status: 401 });
  const supabase = createUserClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return new Response("Du måste vara inloggad.", { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("approval_status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile?.approval_status !== "approved") {
    return new Response("Ditt konto är inte godkänt ännu.", { status: 403 });
  }
  return { supabase, userId: data.user.id };
}
