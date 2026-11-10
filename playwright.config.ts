import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    // The app is used one-handed on phones; smoke tests run at phone width first.
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    // The coach/parent flows (e2e/flows.spec.ts) run once, at phone width; desktop keeps the smoke tests.
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /flows\.spec\.ts$/ },
  ],
  webServer: {
    // Dev server so the dev-only routes (/dev/components) exist for the smoke test.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
