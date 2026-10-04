import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('./.browsers', import.meta.url));
export default defineConfig({ testDir: './e2e-production', fullyParallel: false, workers: 1, reporter: 'list', use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure', screenshot: 'only-on-failure' }, webServer: { command: 'npm run preview -- --port 5175 --strictPort', url: 'http://127.0.0.1:5175', reuseExistingServer: !process.env.CI, timeout: 60000 } });
