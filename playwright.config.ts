import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('./.browsers', import.meta.url));
export default defineConfig({ testDir: './e2e', fullyParallel: false, retries: 0, workers: 1, reporter: 'list', use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' }, webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60000 } });
