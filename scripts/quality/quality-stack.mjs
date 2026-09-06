import { spawn } from "node:child_process";
import { qualityEnv, jwtSecret } from "./test-environment.mjs";

if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST) || process.env.PGDATABASE !== "fortylove_quality") throw new Error("Only an isolated local quality database is allowed");
const children = [];
function start(command, args, env) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: "inherit", windowsHide: true });
  children.push(child); child.on("error", () => { console.error("Quality service failed to start"); process.exitCode = 1; });
  return child;
}
function finished(child) { return new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Quality command failed (${code})`))); }); }
async function ready(url) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Quality service not ready");
}
try {
  start(process.env.POSTGREST_BIN || "postgrest", [], {
    PGRST_DB_URI: `postgresql://${encodeURIComponent(process.env.PGUSER || "postgres")}:${encodeURIComponent(process.env.PGPASSWORD || "")}@127.0.0.1:${process.env.PGPORT || "5432"}/fortylove_quality`,
    PGRST_DB_SCHEMAS: "public", PGRST_JWT_SECRET: jwtSecret, PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: "54330", PGRST_LOG_LEVEL: "error",
  });
  start(process.execPath, ["scripts/quality/test-gateway.mjs"]);
  // Build against the same isolated backend; NEXT_PUBLIC_* values are baked into the build.
  if (process.env.QUALITY_SKIP_BUILD !== "1" || process.env.GITHUB_ACTIONS) await finished(start(process.execPath, ["node_modules/next/dist/bin/next", "build"], qualityEnv));
  start(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3012"], qualityEnv);
  await ready("http://127.0.0.1:3012/api/health");
  await finished(start(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "-c", "playwright.quality.config.ts", ...process.argv.slice(2)], qualityEnv));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { for (const child of children.reverse()) if (child.exitCode === null) child.kill(); }
