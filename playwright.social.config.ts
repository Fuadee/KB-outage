import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/social", outputDir: ".tmp/social-browser", timeout: 30000,
  use: { baseURL: "http://localhost:3100", headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined) },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]
});
