import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/integrations/supabase/admin-middleware";

const AUTH_TEMPLATES = [
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
  "reauthentication",
] as const;

export type AuthEmailAttempt = {
  id: string;
  messageId: string | null;
  template: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

export type AuthEmailUser = {
  userId: string;
  email: string;
  approvalStatus: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  suppressed: { reason: string; createdAt: string } | null;
  latestStatus: string | null;
  latestAt: string | null;
  attempts: AuthEmailAttempt[];
};

export const listAuthEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ users: AuthEmailUser[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Users (profiles) — one row per user, with email + status.
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, approval_status, created_at")
      .order("created_at", { ascending: false });
    if (profErr) throw new Error(profErr.message);

    const emails = (profiles ?? [])
      .map((p) => (p.email ?? "").toLowerCase())
      .filter((e) => e.length > 0);

    // Auth email log rows for those recipients.
    const { data: logs, error: logErr } = await supabaseAdmin
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .in("template_name", AUTH_TEMPLATES as unknown as string[])
      .in("recipient_email", emails.length > 0 ? emails : ["__none__"])
      .order("created_at", { ascending: false })
      .limit(2000);
    if (logErr) throw new Error(logErr.message);

    // Suppression rows.
    const { data: suppressed, error: supErr } = await supabaseAdmin
      .from("suppressed_emails")
      .select("email, reason, created_at")
      .in("email", emails.length > 0 ? emails : ["__none__"]);
    if (supErr) throw new Error(supErr.message);

    const suppressedByEmail = new Map<string, { reason: string; createdAt: string }>();
    for (const s of suppressed ?? []) {
      suppressedByEmail.set((s.email ?? "").toLowerCase(), {
        reason: s.reason,
        createdAt: s.created_at,
      });
    }

    // Dedupe by message_id (latest row wins — logs already sorted DESC).
    const seenMessages = new Set<string>();
    const attemptsByEmail = new Map<string, AuthEmailAttempt[]>();
    for (const row of logs ?? []) {
      const key = row.message_id ?? row.id;
      if (row.message_id) {
        if (seenMessages.has(row.message_id)) continue;
        seenMessages.add(row.message_id);
      }
      const email = (row.recipient_email ?? "").toLowerCase();
      const list = attemptsByEmail.get(email) ?? [];
      list.push({
        id: row.id,
        messageId: row.message_id,
        template: row.template_name,
        status: row.status,
        errorMessage: row.error_message,
        createdAt: row.created_at,
      });
      attemptsByEmail.set(email, list);
    }

    // Last sign-in timestamps via auth admin.
    const lastSignInByUserId = new Map<string, string | null>();
    for (const p of profiles ?? []) {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(p.id);
        lastSignInByUserId.set(p.id, data.user?.last_sign_in_at ?? null);
      } catch {
        lastSignInByUserId.set(p.id, null);
      }
    }

    const users: AuthEmailUser[] = (profiles ?? []).map((p) => {
      const email = (p.email ?? "").toLowerCase();
      const attempts = (attemptsByEmail.get(email) ?? []).slice(0, 20);
      const latest = attempts[0] ?? null;
      return {
        userId: p.id,
        email: p.email ?? "",
        approvalStatus: p.approval_status ?? null,
        createdAt: p.created_at ?? null,
        lastSignInAt: lastSignInByUserId.get(p.id) ?? null,
        suppressed: suppressedByEmail.get(email) ?? null,
        latestStatus: latest?.status ?? null,
        latestAt: latest?.createdAt ?? null,
        attempts,
      };
    });

    return { users };
  });
