import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.mjs';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['server.js', 'src/**'],
      exclude: ['tests/**', 'node_modules/**'],
      thresholds: {
        lines: 60,
        branches: 70,
        functions: 80,
        statements: 60
      }
    }
  }
}));
