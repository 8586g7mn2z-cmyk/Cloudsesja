// Serwer do testu przeglądarkowego: świeży katalog danych, lokalny SMTP testowy, znane hasło administratora.
// Wymaga wcześniejszego `npm run build`.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnos-e2e-'));
const env = { ...process.env, DIAGNOS_DATA_DIR: dir, PORT: '3200', DIAGNOS_ADMIN_PASSWORD: 'Start1234', DIAGNOS_SCHEDULER_MS: '3000', TZ: 'Europe/Warsaw' };
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'dist/server/index.js'], { stdio: 'inherit', env });
const stop = () => {
  srv.kill();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
srv.on('exit', (c) => process.exit(c ?? 0));
