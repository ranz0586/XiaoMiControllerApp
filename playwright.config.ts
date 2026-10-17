import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5178', browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_EDGE ? { channel: 'msedge' } : {} },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5178 --strictPort', url: 'http://127.0.0.1:5178', reuseExistingServer: false },
});
