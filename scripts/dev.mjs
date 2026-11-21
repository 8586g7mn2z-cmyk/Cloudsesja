// Uruchamia backend (tsx watch, port 3000) i frontend (Vite, port 5173) jednocześnie.
import { spawn } from 'node:child_process';
const procs = [
  spawn('npx', ['tsx', 'watch', 'server/src/index.ts'], { stdio: 'inherit', env: { ...process.env, DIAGNOS_CLIENT_DIR: './client-none' } }),
  spawn('npx', ['vite', '--config', 'client/vite.config.ts'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
