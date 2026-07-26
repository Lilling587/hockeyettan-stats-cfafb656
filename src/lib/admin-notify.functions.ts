import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Notify all admins that a new user is waiting for approval.
 * No auth required — called immediately after signup before the user has a session.
 * The function verifies the email is actually pending in the DB before sending,
 * so a random caller cannot use it to spam admins with fake emails.
 */
export const notifyAdminsNewSignupFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only send if this email genuinely has a pending profile.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("email", data.email)
      .eq("approval_status", "pending")
      .maybeSingle();

    if (!profile) return { ok: true };

    const { notifyAdminsNewSignup } = await import("./admin-notify.server");
    await notifyAdminsNewSignup(data.email);
    return { ok: true };
  });
