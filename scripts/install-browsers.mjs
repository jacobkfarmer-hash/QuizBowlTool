import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, [root + 'node_modules/playwright/cli.js', 'install', 'chromium'], { stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: root + '.browsers' } });
process.exit(result.status ?? 1);
