import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:3000'
  },
  webServer: {
    command: 'AI_PROVIDER=mock REFERENCE_RESEARCH_URL= REFERENCE_RESEARCH_API_KEY= pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false
  },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } },
    { name: 'small-375', use: { browserName: 'webkit', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } }
  ]
});
