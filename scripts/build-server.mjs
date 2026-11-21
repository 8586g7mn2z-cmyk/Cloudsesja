// Buduje backend do jednego pliku dist/server/index.js (zależności z node_modules pozostają zewnętrzne).
import { build } from 'esbuild';
await build({
  entryPoints: ['server/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/server/index.js',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
