/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset URLs relative so the build works under
// https://<user>.github.io/<repo>/ and at any other static sub-path.
// Routing is hash-based, so no server rewrite is needed.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'], environment: 'node' },
});
