import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: ["quality.spec.ts", "accessibility.spec.ts", "performance.spec.ts"],
  workers: 1, fullyParallel: false, retries: 0,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3012", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.QUALITY_BROWSER_CHANNEL } }],
  // Server lifecycle is owned by quality-stack.mjs; a missing server is a failure, never a skip.
});
