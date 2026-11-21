// Buduje backend do plików dist/server/*.js (zależności z node_modules pozostają zewnętrzne).
import { build } from 'esbuild';
for (const [entry, out] of [
  ['server/src/index.ts', 'dist/server/index.js'],
  ['server/src/seed.ts', 'dist/server/seed.js'],
]) {
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: out, packages: 'external', sourcemap: true, logLevel: 'warning' });
}
console.log('Zbudowano backend: dist/server/index.js, dist/server/seed.js');
