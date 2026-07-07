import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    playwright: 'src/playwright.ts',
    'presets/webgpu-radar': 'src/presets/webgpu-radar.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'es2022',
  external: ['@playwright/test', 'playwright', 'webgpu-radar'],
});
