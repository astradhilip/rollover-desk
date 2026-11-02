import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  clean: true,
  // Workspace packages ship TypeScript source, so they are bundled. Everything else stays external.
  noExternal: ['@rollover-desk/contracts'],
});
