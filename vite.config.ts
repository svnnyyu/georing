/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production build is served from GitHub Pages at https://svnnyyu.github.io/georing/,
// so its files live under /georing/. The dev server stays at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/georing/' : '/',
  plugins: [react()],
  test: {
    // Core logic has no DOM, so tests run in plain Node.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
