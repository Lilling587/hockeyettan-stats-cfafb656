import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Returns whether the current signed-in user has the `admin` role.
 * Returns `{ isAdmin: false }` for unauthenticated callers (no throw), since
 * this is also called from public routes and during SSR where no bearer token
 * is available.
 */
export const checkIsAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ isAdmin: boolean }> => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return { isAdmin: false };

    const authHeader = getRequest()?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return { isAdmin: false };

    const token = authHeader.slice("Bearer ".length).trim();
    if (token.split(".").length !== 3) return { isAdmin: false };

    const supabase = createClient<Database>(url, key, {
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          headers.set("Authorization", `Bearer ${token}`);
          return fetch(input, { ...init, headers });
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) return { isAdmin: false };

    const { data, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (error) {
      console.error("[checkIsAdmin] has_role failed", error.message);
      return { isAdmin: false };
    }
    return { isAdmin: Boolean(data) };
  },
);
