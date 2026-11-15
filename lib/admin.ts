import { timingSafeEqual } from "node:crypto";

/** Admin routes are disabled unless ADMIN_SECRET is set; callers send it as x-admin-secret. */
export function checkAdmin(req: Request): Response | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return new Response("Not found", { status: 404 });
  const given = Buffer.from(req.headers.get("x-admin-secret") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}
