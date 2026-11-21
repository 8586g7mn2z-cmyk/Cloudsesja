// Kopia zapasowa na działającym systemie: spójna kopia bazy (VACUUM INTO) + pliki + klucz.
// Użycie: node scripts/kopia.mjs [katalog_docelowy]   (domyślnie DATA_DIR/kopie/RRRR-MM-DD_GGMM)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.env.DIAGNOS_DATA_DIR ?? './data');
const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
const target = path.resolve(process.argv[2] ?? path.join(dataDir, 'kopie', stamp));
fs.mkdirSync(target, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'diagnos.sqlite'));
db.exec(`VACUUM INTO '${path.join(target, 'diagnos.sqlite').replace(/'/g, "''")}'`);
db.close();
if (fs.existsSync(path.join(dataDir, 'files'))) fs.cpSync(path.join(dataDir, 'files'), path.join(target, 'files'), { recursive: true });
if (fs.existsSync(path.join(dataDir, 'secret.key'))) fs.copyFileSync(path.join(dataDir, 'secret.key'), path.join(target, 'secret.key'));
console.log(`Kopia zapisana w ${target}`);
