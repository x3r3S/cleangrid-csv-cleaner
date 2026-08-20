import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  timeout: 20_000,
  use: {
    baseURL: "http://127.0.0.1:4273",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4273",
    env: { PORT: "4273" },
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
