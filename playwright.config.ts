import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:3000'
  },
  webServer: {
    command: 'AI_PROVIDER=mock pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } },
    { name: 'small-375', use: { browserName: 'webkit', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } }
  ]
});
