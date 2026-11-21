import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import type { Ctx } from '../context.js';
import { isManager, requireUser, type User } from '../auth.js';
import { audit, bad, forbidden, isValidEmail, isValidNip, isValidRegon, normalizeNip, notFound, nowIso, str, toInt, toNum, HttpError } from '../util.js';
import { fireEvent } from '../services/tasks.js';
import { contentDisposition, extOf, filePath, getFile, saveFile } from '../services/files.js';
import { documentLevel, documentLevels, logDocument } from '../services/docperms.js';
import { readUpload } from './core.js';

const FIELDS = [
  'name', 'short_name', 'type_id', 'status_id', 'group_id', 'subgroup_id', 'price_group_id', 'source_id', 'owner_id', 'nip', 'regon', 'krs', 'tax_office',
  'contract_no', 'permissions_note', 'referred_by_id', 'headquarters_id', 'credit_limit', 'street', 'postal_code', 'city', 'voivodeship', 'country', 'phone',
  'phone2', 'fax', 'email', 'www', 'is_key', 'notes', 'active',
];
const ID_FIELDS = new Set(['type_id', 'status_id', 'group_id', 'subgroup_id', 'price_group_id', 'source_id', 'owner_id', 'referred_by_id', 'headquarters_id']);

export const OWNER_TYPES = new Set(['contractor', 'correspondence', 'project', 'task', 'order']);

/** Czy użytkownik ma dostęp do obiektu, do którego należy załącznik. */
function ownerExists(ctx: Ctx, type: string, id: number) {
  const table = { contractor: 'contractors', correspondence: 'correspondence', project: 'projects', task: 'tasks', order: 'orders' }[type];
  if (!table) throw bad('Nieznany typ obiektu.');
  if (!ctx.db.get(`SELECT id FROM ${table} WHERE id = ?`, id)) throw notFound();
}

export function contractorList(ctx: Ctx, opts: { includeInactive?: boolean; ids?: number[] } = {}) {
  const rows = ctx.db.all<any>(
    `SELECT c.*, t.name AS type_name, s.name AS status_name, s.color AS status_color, g.name AS group_name, sg.name AS subgroup_name,
            pg.name AS price_group_name, src.name AS source_name, o.name AS owner_name,
            (SELECT MAX(event_at) FROM correspondence k WHERE k.contractor_id = c.id) AS last_contact
     FROM contractors c
     LEFT JOIN dict_items t ON t.id = c.type_id LEFT JOIN dict_items s ON s.id = c.status_id
     LEFT JOIN dict_items g ON g.id = c.group_id LEFT JOIN dict_items sg ON sg.id = c.subgroup_id
     LEFT JOIN dict_items pg ON pg.id = c.price_group_id LEFT JOIN dict_items src ON src.id = c.source_id
     LEFT JOIN operators o ON o.id = c.owner_id
     ${opts.includeInactive ? '' : 'WHERE c.active = 1'}
     ORDER BY c.name`,
  );
  const contacts = ctx.db.all<any>('SELECT contractor_id, first_name, last_name, phone, mobile, email, position FROM contacts WHERE active = 1');
  const byC = new Map<number, any[]>();
  for (const p of contacts) (byC.get(p.contractor_id) ?? byC.set(p.contractor_id, []).get(p.contractor_id)!).push(p);
  const members = ctx.db.all<any>('SELECT m.contractor_id, d.name FROM contractor_group_members m JOIN dict_items d ON d.id = m.group_id');
  const memB = new Map<number, string[]>();
  for (const m of members) (memB.get(m.contractor_id) ?? memB.set(m.contractor_id, []).get(m.contractor_id)!).push(m.name);
  return rows.map((c) => {
    const ps = byC.get(c.id) ?? [];
    return {
      ...c,
      custom: c.custom ? JSON.parse(c.custom) : {},
      contacts_text: ps.map((p) => [p.first_name, p.last_name].filter(Boolean).join(' ')).join(', '),
      contacts_search: ps.map((p) => [p.first_name, p.last_name, p.phone, p.mobile, p.email].filter(Boolean).join(' ')).join(' | '),
      groups_text: (memB.get(c.id) ?? []).join(', '),
      contacts_count: ps.length,
    };
  });
}

function checkContractor(ctx: Ctx, id: number | null, b: any) {
  const data: Record<string, any> = {};
  for (const f of FIELDS) {
    if (b[f] === undefined) continue;
    if (ID_FIELDS.has(f)) data[f] = toInt(b[f]);
    else if (f === 'credit_limit') data[f] = toNum(b[f]);
    else if (f === 'is_key' || f === 'active') data[f] = b[f] === true || b[f] === 1 || b[f] === '1' ? 1 : 0;
    else data[f] = str(b[f]);
  }
  if (!id && !data.name) throw bad('Podaj pełną nazwę kontrahenta.');
  if (id && b.name !== undefined && !data.name) throw bad('Podaj pełną nazwę kontrahenta.');
  if (data.nip) {
    data.nip = normalizeNip(data.nip);
    if (!isValidNip(data.nip)) throw bad('Niepoprawny NIP (błędna suma kontrolna lub długość).');
  }
  if (data.regon) {
    data.regon = data.regon.replace(/\D/g, '');
    if (!isValidRegon(data.regon)) throw bad('Niepoprawny REGON (błędna suma kontrolna lub długość).');
  }
  if (data.email && !isValidEmail(data.email)) throw bad('Niepoprawny adres e-mail.');
  if (data.credit_limit != null && data.credit_limit < 0) throw bad('Limit kredytu nie może być ujemny.');
  if (data.subgroup_id) {
    const sg = ctx.db.get<any>('SELECT parent_id FROM dict_items WHERE id = ?', data.subgroup_id);
    const gid = data.group_id ?? (id ? ctx.db.get<any>('SELECT group_id FROM contractors WHERE id = ?', id)?.group_id : null);
    if (!sg || sg.parent_id !== gid) throw bad('Podgrupa nie należy do wybranej grupy.');
  }
  if (id && (data.referred_by_id === id || data.headquarters_id === id)) throw bad('Kontrahent nie może wskazywać sam na siebie.');
  if (b.custom !== undefined) {
    const defs = ctx.db.all<any>("SELECT code, type, label, options FROM custom_fields WHERE entity = 'contractor'");
    const out: Record<string, any> = {};
    for (const d of defs) {
      const v = b.custom?.[d.code];
      if (v === undefined || v === null || v === '') continue;
      if (d.type === 'number') {
        const n = toNum(v);
        if (n == null) throw bad(`Pole „${d.label}” wymaga liczby.`);
        out[d.code] = n;
      } else if (d.type === 'bool') out[d.code] = !!v;
      else if (d.type === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw bad(`Pole „${d.label}” wymaga daty.`);
        out[d.code] = String(v);
      } else if (d.type === 'select') {
        const opts = JSON.parse(d.options || '[]');
        if (!opts.includes(v)) throw bad(`Pole „${d.label}”: wartość spoza listy.`);
        out[d.code] = v;
      } else out[d.code] = String(v);
    }
    data.custom = JSON.stringify(out);
  }
  return data;
}

function duplicatesForNip(ctx: Ctx, nip: string, exceptId: number | null) {
  return ctx.db.all<any>('SELECT id, name, city FROM contractors WHERE nip = ? AND id <> ?', normalizeNip(nip), exceptId ?? 0);
}

export function attachmentsFor(ctx: Ctx, u: User, type: string, id: number) {
  return ctx.db.all<any>(
    `SELECT a.id, a.owner_type, a.owner_id, a.file_id, a.source_document_id, a.created_at, f.original_name AS name, f.size, f.mime, o.name AS author
     FROM attachments a JOIN files f ON f.id = a.file_id LEFT JOIN operators o ON o.id = a.created_by
     WHERE a.owner_type = ? AND a.owner_id = ? ORDER BY a.id`,
    type,
    id,
  ).map((a) => ({ ...a, ext: extOf(a.name) }));
}

export async function contractorRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/api/contractors', async (req) => {
    requireUser(req);
    return contractorList(ctx, { includeInactive: (req.query as any).all === '1' });
  });
  app.get('/api/contractors/lookup', async (req) => {
    requireUser(req);
    return db.all('SELECT id, name, short_name, nip, city, email, phone, owner_id, active FROM contractors ORDER BY name');
  });
  app.get('/api/contractors/check-nip', async (req) => {
    requireUser(req);
    const q = req.query as any;
    const nip = normalizeNip(q.nip);
    return { valid: isValidNip(nip), duplicates: nip ? duplicatesForNip(ctx, nip, toInt(q.id)) : [] };
  });
  app.get('/api/contractors/:id', async (req) => {
    requireUser(req);
    const id = Number((req.params as any).id);
    const c = contractorList(ctx, { includeInactive: true }).find((x) => x.id === id);
    if (!c) throw notFound('Kontrahent nie istnieje.');
    const addresses = db.all('SELECT * FROM contractor_addresses WHERE contractor_id = ? ORDER BY id', id);
    const groups = db.all<any>('SELECT group_id FROM contractor_group_members WHERE contractor_id = ?', id).map((r) => r.group_id);
    const referred = c.referred_by_id ? db.get<any>('SELECT id, name FROM contractors WHERE id = ?', c.referred_by_id) : null;
    const hq = c.headquarters_id ? db.get<any>('SELECT id, name FROM contractors WHERE id = ?', c.headquarters_id) : null;
    const branches = db.all('SELECT id, name, city FROM contractors WHERE headquarters_id = ?', id);
    return { ...c, addresses, groups, referred_by: referred, headquarters: hq, branches };
  });
  app.post('/api/contractors', async (req, reply) => {
    const u = requireUser(req);
    const b = req.body as any;
    const data = checkContractor(ctx, null, b);
    if (data.nip && !b.confirm_duplicate) {
      const d = duplicatesForNip(ctx, data.nip, null);
      if (d.length) return reply.code(409).send({ error: `Kontrahent z NIP ${data.nip} już istnieje: ${d.map((x) => x.name).join(', ')}.`, duplicates: d });
    }
    const id = db.tx(() => {
      const id = db.insert('contractors', { country: 'Polska', ...data, created_at: nowIso(), created_by: u.id, owner_id: data.owner_id ?? u.id });
      if (Array.isArray(b.groups)) for (const g of b.groups) db.run('INSERT INTO contractor_group_members (contractor_id, group_id) VALUES (?, ?)', id, g);
      audit(db, u.id, 'contractor', id, 'dodanie');
      fireEvent(ctx, 'contractor.created', { contractor_id: id, actor_id: u.id });
      return id;
    });
    return { id };
  });
  app.put('/api/contractors/:id', async (req, reply) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    if (!db.get('SELECT id FROM contractors WHERE id = ?', id)) throw notFound();
    const b = req.body as any;
    const data = checkContractor(ctx, id, b);
    if (data.nip && !b.confirm_duplicate) {
      const d = duplicatesForNip(ctx, data.nip, id);
      if (d.length) return reply.code(409).send({ error: `Kontrahent z NIP ${data.nip} już istnieje: ${d.map((x) => x.name).join(', ')}.`, duplicates: d });
    }
    db.tx(() => {
      db.update('contractors', id, { ...data, updated_at: nowIso(), updated_by: u.id });
      if (Array.isArray(b.groups)) {
        db.run('DELETE FROM contractor_group_members WHERE contractor_id = ?', id);
        for (const g of b.groups) db.run('INSERT INTO contractor_group_members (contractor_id, group_id) VALUES (?, ?)', id, g);
      }
      audit(db, u.id, 'contractor', id, 'zmiana', Object.keys(data));
    });
    return { id };
  });
  app.delete('/api/contractors/:id', async (req) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden('Usuwać kontrahentów może kierownik lub administrator.');
    const id = Number((req.params as any).id);
    const rel = db.get<any>(
      `SELECT (SELECT COUNT(*) FROM correspondence WHERE contractor_id = ?) + (SELECT COUNT(*) FROM tasks WHERE contractor_id = ?) +
              (SELECT COUNT(*) FROM orders WHERE contractor_id = ?) + (SELECT COUNT(*) FROM sales WHERE contractor_id = ?) +
              (SELECT COUNT(*) FROM documents WHERE contractor_id = ?) + (SELECT COUNT(*) FROM projects WHERE contractor_id = ?) AS n`,
      id, id, id, id, id, id,
    )!.n;
    if (rel > 0) throw new HttpError(409, 'Kontrahent ma powiązaną korespondencję, zadania, zamówienia, sprzedaż, projekty lub dokumenty. Oznacz go jako nieaktywnego zamiast usuwać.');
    db.tx(() => {
      db.run('UPDATE contractors SET referred_by_id = NULL WHERE referred_by_id = ?', id);
      db.run('UPDATE contractors SET headquarters_id = NULL WHERE headquarters_id = ?', id);
      db.run("DELETE FROM attachments WHERE owner_type = 'contractor' AND owner_id = ?", id);
      db.run('DELETE FROM contractors WHERE id = ?', id);
      audit(db, u.id, 'contractor', id, 'usunięcie');
    });
    return { ok: true };
  });

  // ---------- Adresy ----------
  const addrData = (b: any) => {
    if (!['korespondencyjny', 'dostawy', 'inny'].includes(b.kind)) throw bad('Wybierz rodzaj adresu.');
    return { kind: b.kind, street: str(b.street), postal_code: str(b.postal_code), city: str(b.city), voivodeship: str(b.voivodeship), country: str(b.country), notes: str(b.notes) };
  };
  app.post('/api/contractors/:id/addresses', async (req) => {
    requireUser(req);
    const id = Number((req.params as any).id);
    return { id: db.insert('contractor_addresses', { ...addrData(req.body), contractor_id: id }) };
  });
  app.put('/api/addresses/:id', async (req) => {
    requireUser(req);
    db.update('contractor_addresses', Number((req.params as any).id), addrData(req.body));
    return { ok: true };
  });
  app.delete('/api/addresses/:id', async (req) => {
    requireUser(req);
    db.run('DELETE FROM contractor_addresses WHERE id = ?', Number((req.params as any).id));
    return { ok: true };
  });

  // ---------- Osoby kontaktowe ----------
  const contactData = (b: any) => {
    if (!str(b.last_name)) throw bad('Podaj nazwisko osoby kontaktowej.');
    if (b.email && !isValidEmail(b.email)) throw bad('Niepoprawny adres e-mail.');
    return {
      first_name: str(b.first_name),
      last_name: str(b.last_name),
      position: str(b.position),
      phone: str(b.phone),
      mobile: str(b.mobile),
      email: str(b.email),
      notes: str(b.notes),
      is_primary: b.is_primary ? 1 : 0,
      active: b.active === false ? 0 : 1,
    };
  };
  app.get('/api/contacts', async (req) => {
    requireUser(req);
    const q = req.query as any;
    return db.all(
      `SELECT p.*, c.name AS contractor_name, c.short_name AS contractor_short FROM contacts p JOIN contractors c ON c.id = p.contractor_id
       WHERE (? IS NULL OR p.contractor_id = ?) ORDER BY p.last_name, p.first_name`,
      toInt(q.contractor_id),
      toInt(q.contractor_id),
    );
  });
  app.post('/api/contractors/:id/contacts', async (req) => {
    const u = requireUser(req);
    const cid = Number((req.params as any).id);
    if (!db.get('SELECT id FROM contractors WHERE id = ?', cid)) throw notFound();
    const d = contactData(req.body);
    const id = db.tx(() => {
      if (d.is_primary) db.run('UPDATE contacts SET is_primary = 0 WHERE contractor_id = ?', cid);
      return db.insert('contacts', { ...d, contractor_id: cid, created_at: nowIso() });
    });
    audit(db, u.id, 'contact', id, 'dodanie');
    return { id };
  });
  app.put('/api/contacts/:id', async (req) => {
    requireUser(req);
    const id = Number((req.params as any).id);
    const cur = db.get<any>('SELECT contractor_id FROM contacts WHERE id = ?', id);
    if (!cur) throw notFound();
    const d = contactData(req.body);
    db.tx(() => {
      if (d.is_primary) db.run('UPDATE contacts SET is_primary = 0 WHERE contractor_id = ?', cur.contractor_id);
      db.update('contacts', id, d);
    });
    return { ok: true };
  });
  app.delete('/api/contacts/:id', async (req) => {
    requireUser(req);
    const id = Number((req.params as any).id);
    const used = db.get<any>('SELECT (SELECT COUNT(*) FROM correspondence WHERE contact_id = ?) + (SELECT COUNT(*) FROM tasks WHERE contact_id = ?) AS n', id, id)!.n;
    if (used) db.run('UPDATE contacts SET active = 0 WHERE id = ?', id);
    else db.run('DELETE FROM contacts WHERE id = ?', id);
    return { ok: true, deactivated: !!used };
  });

  // ---------- Notatki i komentarze ----------
  app.get('/api/contractors/:id/notes', async (req) => {
    requireUser(req);
    return db.all(
      'SELECT n.*, o.name AS author FROM notes n LEFT JOIN operators o ON o.id = n.author_id WHERE n.contractor_id = ? ORDER BY n.created_at DESC',
      Number((req.params as any).id),
    );
  });
  app.post('/api/contractors/:id/notes', async (req) => {
    const u = requireUser(req);
    const b = req.body as any;
    if (!str(b.body)) throw bad('Wpisz treść notatki.');
    return { id: db.insert('notes', { contractor_id: Number((req.params as any).id), kind: b.kind === 'komentarz' ? 'komentarz' : 'notatka', body: str(b.body), author_id: u.id, created_at: nowIso() }) };
  });
  app.delete('/api/notes/:id', async (req) => {
    const u = requireUser(req);
    const n = db.get<any>('SELECT author_id FROM notes WHERE id = ?', Number((req.params as any).id));
    if (!n) throw notFound();
    if (n.author_id !== u.id && u.role !== 'admin') throw forbidden('Usunąć notatkę może jej autor lub administrator.');
    db.run('DELETE FROM notes WHERE id = ?', Number((req.params as any).id));
    return { ok: true };
  });

  // ---------- Załączniki ----------
  app.get('/api/attachments/:type/:id', async (req) => {
    const u = requireUser(req);
    const { type, id } = req.params as any;
    ownerExists(ctx, type, Number(id));
    return attachmentsFor(ctx, u, type, Number(id));
  });
  app.post('/api/attachments/:type/:id', async (req) => {
    const u = requireUser(req);
    const { type, id } = req.params as any;
    ownerExists(ctx, type, Number(id));
    const { files } = await readUpload(req);
    if (!files.length) throw bad('Wybierz plik do dodania.');
    const ids = db.tx(() =>
      files.map((f) => {
        const fileId = saveFile(ctx, f.data, f.filename, f.mimetype, u.id);
        return db.insert('attachments', { owner_type: type, owner_id: Number(id), file_id: fileId, created_by: u.id, created_at: nowIso() });
      }),
    );
    return { ids };
  });
  /** Dołączenie dokumentu z rejestru (bieżącej wersji) jako załącznika. */
  app.post('/api/attachments/:type/:id/from-document', async (req) => {
    const u = requireUser(req);
    const { type, id } = req.params as any;
    ownerExists(ctx, type, Number(id));
    const docId = toInt((req.body as any)?.document_id);
    const doc = db.get<any>('SELECT * FROM documents WHERE id = ?', docId);
    if (!doc) throw notFound('Dokument nie istnieje.');
    if (documentLevel(ctx, u, doc) === 'none') throw forbidden('Brak uprawnień do tego dokumentu.');
    const v = db.get<any>('SELECT file_id FROM document_versions WHERE document_id = ? AND version = ?', doc.id, doc.current_version);
    const aid = db.insert('attachments', { owner_type: type, owner_id: Number(id), file_id: v.file_id, source_document_id: doc.id, created_by: u.id, created_at: nowIso() });
    logDocument(ctx, doc.id, u.id, 'dołączenie jako załącznik', doc.current_version, `${type} #${id}`);
    return { id: aid };
  });
  app.get('/api/attachments/:id/file', async (req, reply) => {
    const u = requireUser(req);
    const a = db.get<any>('SELECT * FROM attachments WHERE id = ?', Number((req.params as any).id));
    if (!a) throw notFound();
    if (a.source_document_id) {
      const doc = db.get<any>('SELECT * FROM documents WHERE id = ?', a.source_document_id);
      if (doc && documentLevel(ctx, u, doc) === 'none') throw forbidden('Brak uprawnień do dokumentu źródłowego.');
      if (doc) logDocument(ctx, doc.id, u.id, 'pobranie (jako załącznik)', null);
    }
    const f = getFile(ctx, a.file_id)!;
    const inline = (req.query as any).inline === '1';
    reply.header('Content-Type', f.mime ?? 'application/octet-stream');
    reply.header('Content-Disposition', contentDisposition(f.original_name, inline));
    return reply.send(fs.createReadStream(filePath(ctx, f)));
  });
  app.delete('/api/attachments/:id', async (req) => {
    const u = requireUser(req);
    const a = db.get<any>('SELECT * FROM attachments WHERE id = ?', Number((req.params as any).id));
    if (!a) throw notFound();
    if (a.created_by !== u.id && !isManager(u)) throw forbidden('Usunąć załącznik może jego autor, kierownik lub administrator.');
    db.run('DELETE FROM attachments WHERE id = ?', a.id);
    return { ok: true };
  });

  /** Wszystkie załączniki związane z kontrahentem, z podziałem wg źródła. */
  app.get('/api/contractors/:id/attachments', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const direct = attachmentsFor(ctx, u, 'contractor', id).map((a) => ({ ...a, source: 'kartoteka', source_label: 'Dodane do kartoteki' }));
    const corr = db
      .all<any>(
        `SELECT a.id, a.file_id, a.created_at, a.source_document_id, f.original_name AS name, f.size, f.mime, o.name AS author, k.id AS correspondence_id, k.number, k.topic_text, d.name AS topic
         FROM attachments a JOIN correspondence k ON a.owner_type = 'correspondence' AND a.owner_id = k.id JOIN files f ON f.id = a.file_id
         LEFT JOIN operators o ON o.id = a.created_by LEFT JOIN dict_items d ON d.id = k.topic_id WHERE k.contractor_id = ? ORDER BY a.id`,
        id,
      )
      .map((a) => ({ ...a, ext: extOf(a.name), source: 'korespondencja', source_label: `Korespondencja ${a.number}` }));
    const projAtt = db
      .all<any>(
        `SELECT a.id, a.file_id, a.created_at, f.original_name AS name, f.size, f.mime, o.name AS author, p.name AS project
         FROM attachments a JOIN projects p ON a.owner_type = 'project' AND a.owner_id = p.id JOIN files f ON f.id = a.file_id
         LEFT JOIN operators o ON o.id = a.created_by WHERE p.contractor_id = ?`,
        id,
      )
      .map((a) => ({ ...a, ext: extOf(a.name), source: 'projekt', source_label: `Projekt: ${a.project}` }));
    const docs = db.all<any>(
      `SELECT d.id, d.number, d.name, d.folder_id, d.author_id, d.current_version, d.published_at, f.original_name, f.size, f.mime, o.name AS author
       FROM documents d JOIN document_versions v ON v.document_id = d.id AND v.version = d.current_version JOIN files f ON f.id = v.file_id
       LEFT JOIN operators o ON o.id = d.author_id WHERE d.contractor_id = ?`,
      id,
    );
    const lv = documentLevels(ctx, u, docs);
    const fromDocs = docs
      .filter((d) => lv.get(d.id) !== 'none')
      .map((d) => ({ id: d.id, document_id: d.id, name: d.original_name, title: d.name, size: d.size, mime: d.mime, ext: extOf(d.original_name), created_at: d.published_at, author: d.author, source: 'dokumenty', source_label: `Rejestr dokumentów ${d.number}` }));
    return [...direct, ...corr, ...projAtt, ...fromDocs];
  });
}
