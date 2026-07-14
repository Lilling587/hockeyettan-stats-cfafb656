// Server-only helper: sign / verify one-click unsubscribe tokens.
// HMAC-SHA256 keyed by CRON_SECRET (already an app-controlled server secret).
// Format: base64url(hmac).base64url(userId)
import { createHmac, timingSafeEqual } from "crypto";

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function keyOrThrow(): string {
  const k = process.env.CRON_SECRET;
  if (!k) throw new Error("CRON_SECRET missing; cannot sign unsubscribe tokens");
  return k;
}

export function signUnsubscribeToken(userId: string): string {
  const mac = createHmac("sha256", keyOrThrow()).update(userId).digest();
  return `${b64url(mac)}.${b64url(userId)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [macPart, uidPart] = parts;
  const userId = b64urlDecode(uidPart).toString("utf8");
  if (!userId) return null;
  const expected = createHmac("sha256", keyOrThrow()).update(userId).digest();
  const provided = b64urlDecode(macPart);
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? userId : null;
}
