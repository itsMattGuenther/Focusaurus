import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', timeout: 30_000, expect: { timeout: 7000 },
  workers: 1, fullyParallel: false, reporter: 'list', outputDir: 'test-results',
});
