import { defineConfig, devices } from "@playwright/test";

// UI end-to-end tests (spec §66.5). Runs against the Vite dev server so the
// development-only debug panel (§100) is available for setting up scenarios.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure", viewport: { width: 1400, height: 900 } },
  webServer: {
    command: "vite --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});
