import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { SessionUser } from "./types";
import { db } from "./db";

const COOKIE = "courtside_session";
const secret = () => process.env.SESSION_SECRET ?? "";

function encode(value: object) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decode(token?: string): SessionUser | null {
  if (!token || !secret()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionUser & { exp: number };
    return value.exp > Date.now() ? value : null;
  } catch { return null; }
}

export async function getSession() {
  const session = decode((await cookies()).get(COOKIE)?.value);
  if (!session || !Number.isInteger(session.session_version)) return null;
  const { data: user, error } = await db()
    .from("users")
    .select("id,name,role,session_version")
    .eq("id", session.id)
    .maybeSingle();
  if (error || !user || user.session_version !== session.session_version) return null;
  return user as SessionUser;
}

export async function setSession(user: SessionUser) {
  (await cookies()).set(COOKIE, encode({ ...user, exp: Date.now() + 30 * 864e5 }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400,
  });
}

export async function clearSession() { (await cookies()).delete(COOKIE); }
