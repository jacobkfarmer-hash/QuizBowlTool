import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { localPWA } from './scripts/pwa-plugin';
export default defineConfig({ plugins: [react(), localPWA()], resolve: { preserveSymlinks: true }, optimizeDeps: { esbuildOptions: { preserveSymlinks: true, tsconfigRaw: { compilerOptions: { target: 'ES2022', jsx: 'react-jsx' } } } }, worker: { format: 'es' }, test: { environment: 'jsdom', environmentOptions: { jsdom: { pretendToBeVisual: true } }, setupFiles: ['./tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'], restoreMocks: true }, build: { chunkSizeWarningLimit: 2200 } });
