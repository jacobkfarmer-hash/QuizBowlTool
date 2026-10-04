import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], resolve: { preserveSymlinks: true }, optimizeDeps: { esbuildOptions: { preserveSymlinks: true, tsconfigRaw: { compilerOptions: { target: 'ES2022', jsx: 'react-jsx' } } } }, worker: { format: 'es' }, test: { environment: 'jsdom', environmentOptions: { jsdom: { pretendToBeVisual: true } }, setupFiles: ['./tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'], restoreMocks: true }, build: { chunkSizeWarningLimit: 2200 } });
