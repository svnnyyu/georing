/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Core logic has no DOM, so tests run in plain Node.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
