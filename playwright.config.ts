import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  workers: 1,
  timeout: 30_000,
  reporter: [["list"]],
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://localhost:4321/test/fixtures/demo.html",
    reuseExistingServer: true,
  },
});
