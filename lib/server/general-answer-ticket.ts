import { createHmac, timingSafeEqual } from "node:crypto";

function signature(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing session configuration");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
export function issueGeneralTicket(user: string, audience: string, question: string) {
  const payload = Buffer.from(JSON.stringify({ user, audience, question, expires: Date.now() + 15 * 60_000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyGeneralTicket(ticket: string, user: string, audience: string, question: string) {
  try {
    const [payload, mac] = ticket.split(".");
    const expected = Buffer.from(signature(payload));
    const supplied = Buffer.from(mac ?? "");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.user === user && data.audience === audience && data.question === question && data.expires > Date.now();
  } catch { return false; }
}
