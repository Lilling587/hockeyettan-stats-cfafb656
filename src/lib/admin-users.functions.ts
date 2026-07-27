import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/admin-middleware";

export type AdminUser = {
  userId: string;
  email: string | null;
  grantedAt: string | null;
  lastSignInAt: string | null;
};

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ admins: AdminUser[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "admin");
    if (roleErr) throw new Error(roleErr.message);

    const admins: AdminUser[] = [];
    for (const row of roleRows ?? []) {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
      if (error) {
        admins.push({ userId: row.user_id, email: null, grantedAt: row.created_at ?? null, lastSignInAt: null });
        continue;
      }
      admins.push({
        userId: row.user_id,
        email: data.user?.email ?? null,
        grantedAt: row.created_at ?? null,
        lastSignInAt: data.user?.last_sign_in_at ?? null,
      });
    }
    admins.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    return { admins };
  });

export const inviteAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; userId: string; invited: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    // Try to find an existing user with this email.
    let userId: string | null = null;
    let invited = false;

    const { data: existing, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);
    const match = existing.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) {
      userId = match.id;
    } else {
      const { data: inviteData, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo:
            (process.env.SITE_URL ?? "https://origin-playful-spark.lovable.app") +
            "/reset-password",
        });
      if (inviteErr) throw new Error(inviteErr.message);
      userId = inviteData.user?.id ?? null;
      invited = true;
    }

    if (!userId) throw new Error("Kunde inte skapa användare");

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleErr) throw new Error(roleErr.message);

    // Auto-approve invited admins so they can sign in immediately.
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, email, approval_status: "approved" }, { onConflict: "id" });

    // Notify existing users that they have been promoted — new users get the
    // Supabase invite email with a set-password link instead.
    // Must be awaited: Cloudflare Workers terminate once the response is sent,
    // so a fire-and-forget void promise would be killed before it runs.
    if (!invited) {
      try {
        const { notifyUserAdminGranted } = await import("./admin-notify.server");
        await notifyUserAdminGranted(email);
      } catch (err) {
        console.warn("[inviteAdmin] promotion email failed:", (err as Error).message);
      }
    }

    return { ok: true, userId, invited };
  });

const AUTH_EMAIL_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change'] as const;
export type AuthEmailType = (typeof AUTH_EMAIL_TYPES)[number];

export const sendAuthEmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      emailType: z.enum(AUTH_EMAIL_TYPES),
      newEmail: z.string().email().optional(),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (userErr || !userData.user) throw new Error("Kunde inte hitta användaren");
    const email = userData.user.email;
    if (!email) throw new Error("Användaren saknar e-postadress");

    const redirectTo = process.env.SITE_URL ?? "https://spdproduktion.se";

    if (data.emailType === "email_change") {
      if (!data.newEmail) throw new Error("Ny e-postadress krävs för e-postbyte");
      const { error } = await supabaseAdmin.auth.admin.generateLink({
        type: "email_change_current",
        email,
        newEmail: data.newEmail,
        options: { redirectTo },
      });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.auth.admin.generateLink({
        type: data.emailType,
        email,
        options: { redirectTo },
      });
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (data.userId === context.userId) {
      throw new Error("Du kan inte ta bort din egen admin-behörighet");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
