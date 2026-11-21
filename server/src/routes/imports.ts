import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { isManager, requireUser } from '../auth.js';
import { bad, forbidden } from '../util.js';
import { DEFAULT_FILE_SOURCE, IMPORT_KINDS, fieldsFor, prepareImport, runImport } from '../services/importer.js';
import { readUpload } from './core.js';

export async function importRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  app.get('/api/import/kinds', async (req) => {
    requireUser(req);
    return {
      default_source: DEFAULT_FILE_SOURCE,
      kinds: Object.fromEntries(Object.entries(IMPORT_KINDS).map(([k, v]) => [k, { label: v.label, fields: fieldsFor(ctx, k) }])),
    };
  });
  const manager = (req: any) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden('Import danych wykonuje kierownik lub administrator.');
    return u;
  };
  app.post('/api/import/upload', async (req) => {
    manager(req);
    const { fields, files } = await readUpload(req);
    if (!files.length) throw bad('Wybierz plik XLSX lub CSV.');
    return prepareImport(ctx, fields.kind, files[0].filename, files[0].data);
  });
  app.post('/api/import/run', async (req) => {
    const u = manager(req);
    const b = req.body as any;
    // nowe pozycje słowników może przy okazji importu zakładać tylko administrator
    return runImport(ctx, String(b.token), b.mapping ?? {}, u.id, !!b.dry_run, { create_dicts: u.role === 'admin' && b.create_dicts !== false, source: b.source });
  });
  app.get('/api/import/logs', async (req) => {
    manager(req);
    return db.all('SELECT l.*, o.name AS operator FROM import_logs l LEFT JOIN operators o ON o.id = l.created_by ORDER BY l.id DESC LIMIT 200');
  });
  app.get('/api/import/logs/:id', async (req) => {
    manager(req);
    const l = db.get<any>('SELECT * FROM import_logs WHERE id = ?', Number((req.params as any).id));
    return l ? { ...l, details: JSON.parse(l.details || '[]') } : null;
  });
}
