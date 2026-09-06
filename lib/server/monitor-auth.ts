import { timingSafeEqual } from "node:crypto";

export function isMonitorAuthorized(request: Request) {
  const secret = process.env.MONITOR_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return !!secret && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
