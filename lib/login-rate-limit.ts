import { createHmac } from "node:crypto";

export const LOGIN_WINDOW_SECONDS = 10 * 60;
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_BLOCK_SECONDS = 10 * 60;
export const REGISTRATION_WINDOW_SECONDS = 60 * 60;
export const REGISTRATION_MAX_ATTEMPTS = 5;
export const REGISTRATION_BLOCK_SECONDS = 60 * 60;

export function normalizeLoginIdentifier(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ja-JP");
}

export function loginRateLimitKey(scope: "address" | "identity" | "registration-address", value: string, secret: string) {
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return createHmac("sha256", secret)
    .update(`${scope}\0${normalizeLoginIdentifier(value)}`)
    .digest("hex");
}

export function clientAddress(forwardedFor: string | null, realIp: string | null) {
  return forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
}
