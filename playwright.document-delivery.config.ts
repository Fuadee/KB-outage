import { defineConfig } from "@playwright/test";
import socialConfig from "./playwright.social.config";

export default defineConfig({
  ...socialConfig,
  testDir: "./tests/document-delivery",
  outputDir: ".tmp/document-delivery-browser"
});
