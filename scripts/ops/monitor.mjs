import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function seal(state, secret) {
  if (!secret || secret.length < 32) throw new Error("MONITOR_STATE_KEY must be at least 32 characters");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(state)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}
export function unseal(bytes, secret) {
  if (!secret || secret.length < 32) throw new Error("MONITOR_STATE_KEY must be at least 32 characters");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
}

export function transition(previous, healthy, now) {
  const state = { ...previous, failures: healthy ? 0 : (previous.failures ?? 0) + 1, successes: healthy ? (previous.successes ?? 0) + 1 : 0 };
  let notification = null;
  if (!healthy && state.failures >= 2 && !state.incident) notification = "outage";
  if (healthy && state.successes >= 2 && state.incident) notification = "recovery";
  return { state: { ...state, checkedAt: now }, notification };
}

export async function runMonitor({ config, previous = {}, fetcher = fetch, now = Date.now() }) {
  const target = new URL(config.url);
  if (target.protocol !== "https:" && !(config.localTest && ["127.0.0.1", "localhost"].includes(target.hostname))) throw new Error("Monitor requires HTTPS");
  if (target.username || target.password || target.search || target.hash || target.pathname !== "/") throw new Error("Use a bare site origin");
  if (!config.secret) throw new Error("MONITOR_SECRET is required");
  let settings = previous.settings, healthy = false;
  const startedAt = Date.now();
  try {
    const [healthResponse, settingsResponse] = await Promise.all([
      fetcher(new URL("/api/health", target), { headers: { authorization: `Bearer ${config.secret}` }, signal: AbortSignal.timeout(10000), redirect: "error", cache: "no-store" }),
      fetcher(new URL("/api/ops/monitor-config", target), { headers: { authorization: `Bearer ${config.secret}` }, signal: AbortSignal.timeout(10000), redirect: "error", cache: "no-store" }),
    ]);
    if (settingsResponse.ok) {
      const candidate = await settingsResponse.json();
      if (typeof candidate.enabled !== "boolean" || typeof candidate.email !== "string" || typeof candidate.revision !== "string" || candidate.email.length > 254 || candidate.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email) || candidate.enabled && !candidate.email) throw new Error("Invalid settings");
      settings = candidate;
    }
    const body = await healthResponse.json();
    healthy = healthResponse.ok && settingsResponse.ok && body.status === "ok" && body.database === "ok";
  } catch { /* No response data or credentials in console output. Last good recipient survives outages. */ }
  const { state, notification } = transition(previous, healthy, now);
  state.settings = settings;
  state.samples = [...(previous.samples ?? []).filter((s) => s.at >= now - 31 * 86400000), { at: now, healthy, latencyMs: Date.now() - startedAt }].slice(-10000);
  let delivery = "none", failed = false;
  if (notification && settings?.enabled && settings.email) {
    try {
      if (!config.apiKey || !config.sender) throw new Error("Missing provider");
      const response = await fetcher("https://api.brevo.com/v3/smtp/email", {
        method: "POST", signal: AbortSignal.timeout(10000), redirect: "error",
        headers: { "api-key": config.apiKey, "content-type": "application/json" },
        body: JSON.stringify({ sender: { email: config.sender, name: config.senderName || "Fortylove" }, to: [{ email: settings.email }], subject: `【Fortylove】${notification === "outage" ? "障害を検知しました" : "復旧を確認しました"}`, textContent: `外部監視で${notification === "outage" ? "2回連続の異常" : "2回連続の正常応答"}を確認しました。\n監視対象: Health API・監視設定API\n確認時刻: ${new Date(now).toISOString()}\n利用者の個人情報は含まれていません。` }),
      });
      if (!response.ok) throw new Error("Delivery failed");
      state.incident = notification === "outage"; delivery = notification;
    } catch { delivery = "failed"; failed = true; }
  } else if (!settings?.enabled) {
    // Muting discards an old incident; re-enabling during an outage sends a fresh alert.
    state.incident = false;
  }
  if (!settings) failed = true;
  const latencies = state.samples.map((s) => s.latencyMs).sort((a, b) => a - b);
  return { state, failed, summary: { healthy, delivery, configured: !!settings, sampleCount: state.samples.length, sampledAvailability: state.samples.filter((s) => s.healthy).length / state.samples.length, p95Ms: latencies[Math.ceil(latencies.length * .95) - 1] } };
}

async function main() {
  const statePath = resolve(process.env.MONITOR_STATE_PATH || ".ops-cache/state.enc");
  const key = process.env.MONITOR_STATE_KEY;
  let previous = {};
  try { previous = unseal(await readFile(statePath), key); } catch (error) { if (error.code !== "ENOENT") throw new Error("Cannot decrypt monitor state; restore the correct key"); }
  const result = await runMonitor({ config: { url: process.env.MONITOR_URL, secret: process.env.MONITOR_SECRET, apiKey: process.env.BREVO_API_KEY, sender: process.env.BREVO_SENDER_EMAIL, senderName: process.env.BREVO_SENDER_NAME }, previous });
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  await writeFile(`${statePath}.tmp`, seal(result.state, key), { mode: 0o600 });
  await rename(`${statePath}.tmp`, statePath);
  console.log(JSON.stringify(result.summary));
  if (result.failed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error("Monitor failed. Check secrets, endpoint availability and encrypted state."); process.exitCode = 1; });
