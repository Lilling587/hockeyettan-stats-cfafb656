import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import type { Database } from "@/integrations/supabase/types";
import { detailsToJson } from "./json";

export type JsonPrimitive = string | number | boolean | null;
export type AuditMetadata = Record<string, JsonPrimitive>;

export type Profile = {
  id: string;
  email: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  userId: string | null;
  email: string | null;
  action: string;
  metadata: AuditMetadata | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

function assertApprovalStatus(value: string): ApprovalStatus {
  if (APPROVAL_STATUSES.includes(value as ApprovalStatus)) return value as ApprovalStatus;
  return "pending";
}

function mapProfile(row: Database["public"]["Tables"]["profiles"]["Row"]): Profile {
  return {
    id: row.id,
    email: row.email,
    approvalStatus: assertApprovalStatus(row.approval_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    userId: (row.user_id as string | null) ?? null,
    email: (row.user_email as string | null) ?? null,
    action: String(row.action),
    metadata: (row.metadata as AuditMetadata | null) ?? null,
    ipAddress: (row.ip_address as string | null) ?? null,
    userAgent: (row.user_agent as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

/**
 * Returns the current signed-in user's profile, including approval status.
 * Throws if the caller is not authenticated.
 */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, email, approval_status, created_at, updated_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      // Should not happen because of the trigger, but create defensively.
      const { data: inserted, error: insertErr } = await context.supabase
        .from("profiles")
        .insert({
          id: context.userId,
          email: (context.claims?.email as string | undefined) ?? null,
          approval_status: "pending",
        })
        .select("id, email, approval_status, created_at, updated_at")
        .single();
      if (insertErr) throw new Error(insertErr.message);
      return mapProfile(inserted);
    }
    return mapProfile(data);
  });

/**
 * Lists all user profiles with their approval status and admin role flag.
 * Admin-only.
 */
export const listUserProfiles = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(
    async ({
      context,
    }): Promise<{
      users: (Profile & { isAdmin: boolean; lastSignInAt: string | null })[];
    }> => {
      const { data: profileRows, error: profileErr } = await context.supabase
        .from("profiles")
        .select("id, email, approval_status, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (profileErr) throw new Error(profileErr.message);

      const { data: roleRows, error: roleErr } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (roleErr) throw new Error(roleErr.message);

      const adminIds = new Set((roleRows ?? []).map((r) => String(r.user_id)));

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: authUsers, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (authErr) throw new Error(authErr.message);

      const lastSignInById = new Map<string, string | null>();
      for (const u of authUsers.users) {
        lastSignInById.set(u.id, u.last_sign_in_at ?? null);
      }

      const users = (profileRows ?? []).map((row) => ({
        ...mapProfile(row),
        isAdmin: adminIds.has(String(row.id)),
        lastSignInAt: lastSignInById.get(String(row.id)) ?? null,
      }));

      return { users };
    },
  );

const userIdSchema = z.object({ userId: z.string().uuid() });

/**
 * Approves a pending or rejected user. Admin-only.
 */
export const approveUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => userIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ approval_status: "approved" })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await logAuditEventInternal(context.supabase, context.userId, "approve_user", {
      approvedUserId: data.userId,
    });
    return { ok: true };
  });

/**
 * Rejects or revokes approval for a user. Admin-only.
 * Admins cannot reject themselves.
 */
export const rejectUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => userIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (data.userId === context.userId) {
      throw new Error("Du kan inte neka din egen åtkomst");
    }
    const { error } = await context.supabase
      .from("profiles")
      .update({ approval_status: "rejected" })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await logAuditEventInternal(context.supabase, context.userId, "reject_user", {
      rejectedUserId: data.userId,
    });
    return { ok: true };
  });

const metadataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

/**
 * Records an audit event for the currently signed-in user.
 * Non-blocking: failures are silently ignored so logging never breaks the main flow.
 */
export const logAuditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.string().min(1),
        metadata: metadataSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await logAuditEventInternal(context.supabase, context.userId, data.action, data.metadata);
    return { ok: true };
  });

async function logAuditEventInternal(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: string,
  metadata?: AuditMetadata,
): Promise<void> {
  try {
    await supabase.from("audit_events").insert({
      user_id: userId,
      action,
      metadata: detailsToJson(metadata),
    });
  } catch {
    // Non-blocking.
  }
}

/**
 * Lists recent audit events. Admin-only.
 */
export const listAuditEvents = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<{ events: AuditEvent[] }> => {
    const { data, error } = await context.supabase
      .from("audit_events")
      .select(
        "id, user_id, action, metadata, ip_address, user_agent, created_at, user_email:profiles(email)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const events = (data ?? []).map((row: Record<string, unknown>) => {
      const userEmail = (row.user_email as { email?: string } | null)?.email ?? null;
      return mapAuditEvent({ ...row, user_email: userEmail });
    });
    return { events };
  });
