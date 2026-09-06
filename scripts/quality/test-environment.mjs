import { createHmac } from "node:crypto";

export const jwtSecret = "local-quality-only-postgrest-jwt-secret-at-least-32";
export const sessionSecret = "local-quality-only-session-secret-at-least-32";
const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const payload = Buffer.from(JSON.stringify({ role: "service_role", exp: 4102444800 })).toString("base64url");
export const serviceKey = `${header}.${payload}.${createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url")}`;
export const qualityEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54331", SUPABASE_SERVICE_ROLE_KEY: serviceKey, SESSION_SECRET: sessionSecret,
  SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "", GEMINI_API_KEY: "", BREVO_API_KEY: "", MONITOR_SECRET: "quality-monitor-secret",
};
export const ids = { member: "70000000-0000-4000-8000-000000000001", admin: "70000000-0000-4000-8000-000000000002", superAdmin: "70000000-0000-4000-8000-000000000003", event: "71000000-0000-4000-8000-000000000001" };
