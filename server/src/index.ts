import { loadConfig, openDb, type Ctx } from './context.js';
import { buildApp } from './app.js';
import { ensureAdmin } from './auth.js';
import { startScheduler } from './services/scheduler.js';

process.env.TZ ??= 'Europe/Warsaw';

async function main() {
  const config = loadConfig();
  const db = openDb(config);
  const ctx: Ctx = { db, config };
  const pw = ensureAdmin(ctx);
  if (pw) {
    console.log('==============================================================');
    console.log(' Utworzono konto administratora.');
    console.log(' Login: admin');
    if (!process.env.DIAGNOS_ADMIN_PASSWORD) console.log(` Hasło startowe: ${pw}  (zapisane też w ${config.dataDir}/haslo-startowe-admin.txt)`);
    console.log(' Hasło trzeba zmienić przy pierwszym logowaniu.');
    console.log('==============================================================');
  }
  const app = await buildApp(ctx, { logger: process.env.DIAGNOS_LOG === '1' });
  if (config.scheduler) startScheduler(ctx, (m, e) => console.error(m, e));
  await app.listen({ port: config.port, host: config.host });
  console.log(`DIAGNOS CRM działa: http://localhost:${config.port}  (dane: ${config.dataDir})`);
  const stop = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
