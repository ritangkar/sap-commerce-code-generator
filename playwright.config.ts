import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4173/sap-commerce-code-generator/',
    ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}),
  },
  webServer: {
    // Serve the production build under the GitHub Pages sub-path to verify base-path handling.
    command: 'node tests/browser/serve-subpath.mjs',
    url: 'http://localhost:4173/sap-commerce-code-generator/',
    reuseExistingServer: true,
  },
});
