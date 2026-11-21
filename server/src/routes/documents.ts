import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import type { Ctx } from '../context.js';
import { isManager, requireUser, type User } from '../auth.js';
import { bad, forbidden, fmtDatePl, fmtMoney, makeNumber, notFound, nowIso, renderTemplate, str, todayIso, toInt } from '../util.js';
import { contentDisposition, extOf, filePath, getFile, saveFile } from '../services/files.js';
import { documentLevel, documentLevels, folderLevel, logDocument, permEntries, type Level } from '../services/docperms.js';
import { company, templatePdf, type DocItem } from '../services/pdf.js';
import { readUpload } from './core.js';

export const TEMPLATE_FIELDS: Record<string, string> = {
  '{{numer}}': 'numer nadany dokumentowi w rejestrze',
  '{{data}}': 'data wygenerowania',
  '{{waznosc}}': 'data ważności dokumentu',
  '{{kontrahent.nazwa}}': 'pełna nazwa kontrahenta',
  '{{kontrahent.skrot}}': 'skrót nazwy',
  '{{kontrahent.nip}}': 'NIP',
  '{{kontrahent.adres}}': 'adres siedziby',
  '{{kontrahent.email}}': 'e-mail kontrahenta',
  '{{osoba.nazwa}}': 'osoba kontaktowa (imię i nazwisko)',
  '{{osoba.stanowisko}}': 'stanowisko osoby kontaktowej',
  '{{operator.nazwa}}': 'operator generujący dokument',
  '{{operator.email}}': 'e-mail operatora',
  '{{operator.telefon}}': 'telefon operatora',
  '{{firma.nazwa}}': 'nazwa firmy (Ustawienia → Dane firmy)',
  '{{firma.adres}}': 'adres firmy',
  '{{firma.nip}}': 'NIP firmy',
  '{{firma.konto}}': 'rachunek bankowy firmy',
  '{{zamowienie.numer}}': 'numer zamówienia',
  '{{zamowienie.data}}': 'data zamówienia',
  '{{zamowienie.uwagi}}': 'uwagi do zamówienia',
  '{{suma.netto}}': 'suma netto pozycji',
  '{{suma.brutto}}': 'suma brutto pozycji',
  '{{pozycje}}': 'tabela pozycji (w osobnym wierszu)',
};

function docRows(ctx: Ctx, where = '', params: any[] = []) {
  return ctx.db.all<any>(
    `SELECT d.*, f.name AS folder_name, t.name AS type_name, c.name AS contractor_name, c.short_name AS contractor_short, p.name AS project_name,
            o.name AS author_name, fl.original_name AS file_name, fl.size, fl.mime, v.created_at AS version_at, vo.name AS version_author
     FROM documents d
     LEFT JOIN doc_folders f ON f.id = d.folder_id LEFT JOIN dict_items t ON t.id = d.type_id
     LEFT JOIN contractors c ON c.id = d.contractor_id LEFT JOIN projects p ON p.id = d.project_id
     LEFT JOIN operators o ON o.id = d.author_id
     JOIN document_versions v ON v.document_id = d.id AND v.version = d.current_version
     JOIN files fl ON fl.id = v.file_id LEFT JOIN operators vo ON vo.id = v.author_id
     ${where} ORDER BY d.published_at DESC, d.id DESC`,
    ...params,
  );
}

function decorate(ctx: Ctx, u: User, rows: any[]) {
  const lv = documentLevels(ctx, u, rows);
  const today = todayIso();
  return rows
    .filter((r) => lv.get(r.id) !== 'none')
    .map((r) => {
      const expired = !!(r.valid_to && r.valid_to < today);
      const archived = !!r.archived || expired;
      return {
        ...r,
        ext: extOf(r.file_name),
        level: lv.get(r.id),
        is_archived: archived ? 1 : 0,
        validity: r.archived ? 'archiwalny' : expired ? 'po terminie ważności' : r.valid_from && r.valid_from > today ? 'jeszcze nieważny' : 'aktualny',
      };
    });
}

function canAddToFolder(ctx: Ctx, u: User, folderId: number | null): boolean {
  if (u.role === 'admin') return true;
  if (!folderId) return true;
  const e = permEntries(ctx, 'folder', folderId);
  if (!e.length) return true; // segregator otwarty
  return folderLevel(ctx, u, folderId) === 'edit';
}

function requireDocLevel(ctx: Ctx, u: User, id: number, need: Level) {
  const d = ctx.db.get<any>('SELECT * FROM documents WHERE id = ?', id);
  if (!d) throw notFound('Dokument nie istnieje.');
  const l = documentLevel(ctx, u, d);
  if (l === 'none' || (need === 'edit' && l !== 'edit')) throw forbidden(need === 'edit' ? 'Brak uprawnień do edycji dokumentu.' : 'Brak uprawnień do tego dokumentu.');
  return { doc: d, level: l };
}

function metaData(b: any) {
  if (!str(b.name)) throw bad('Podaj nazwę dokumentu.');
  if (b.valid_from && b.valid_to && b.valid_to < b.valid_from) throw bad('Data „ważny do” jest wcześniejsza niż „ważny od”.');
  return {
    name: str(b.name),
    description: str(b.description),
    folder_id: toInt(b.folder_id),
    type_id: toInt(b.type_id),
    contractor_id: toInt(b.contractor_id),
    project_id: toInt(b.project_id),
    valid_from: str(b.valid_from),
    valid_to: str(b.valid_to),
  };
}

export function createDocument(ctx: Ctx, u: User, meta: ReturnType<typeof metaData> & { source?: string }, fileId: number, comment?: string | null, number?: string) {
  return ctx.db.tx(() => {
    const now = nowIso();
    const id = ctx.db.insert('documents', { ...meta, number: number ?? makeNumber(ctx.db, 'D', now), author_id: u.id, published_at: now, current_version: 0, created_at: now });
    ctx.db.insert('document_versions', { document_id: id, version: 0, file_id: fileId, author_id: u.id, comment: comment ?? null, created_at: now });
    logDocument(ctx, id, u.id, 'dodanie', 0, comment ?? null);
    return id;
  });
}

export async function documentRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  // ---------- Segregatory ----------
  app.get('/api/doc-folders', async (req) => {
    const u = requireUser(req);
    const folders = db.all<any>('SELECT * FROM doc_folders ORDER BY sort, name');
    const docs = db.all<any>('SELECT id, author_id, folder_id FROM documents');
    const lv = documentLevels(ctx, u, docs);
    return folders
      .map((f) => ({
        ...f,
        level: folderLevel(ctx, u, f.id),
        can_add: canAddToFolder(ctx, u, f.id),
        restricted: permEntries(ctx, 'folder', f.id).length > 0,
        documents: docs.filter((d) => d.folder_id === f.id && lv.get(d.id) !== 'none').length,
      }))
      .filter((f) => f.level !== 'none' || f.documents > 0);
  });
  app.post('/api/doc-folders', async (req) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden('Segregatory zakłada kierownik lub administrator.');
    const name = str((req.body as any)?.name);
    if (!name) throw bad('Podaj nazwę segregatora.');
    return { id: db.insert('doc_folders', { name, description: str((req.body as any)?.description), sort: 99 }) };
  });
  app.put('/api/doc-folders/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    if (folderLevel(ctx, u, id) !== 'edit' || !isManager(u)) throw forbidden();
    const name = str((req.body as any)?.name);
    if (!name) throw bad('Podaj nazwę segregatora.');
    db.update('doc_folders', id, { name, description: str((req.body as any)?.description) });
    return { ok: true };
  });
  app.delete('/api/doc-folders/:id', async (req) => {
    const u = requireUser(req);
    if (u.role !== 'admin') throw forbidden();
    const id = Number((req.params as any).id);
    if (db.get('SELECT id FROM documents WHERE folder_id = ?', id)) throw bad('Segregator zawiera dokumenty. Przenieś je przed usunięciem segregatora.');
    db.tx(() => {
      db.run("DELETE FROM document_permissions WHERE target_type = 'folder' AND target_id = ?", id);
      db.run('UPDATE doc_templates SET folder_id = NULL WHERE folder_id = ?', id);
      db.run('DELETE FROM doc_folders WHERE id = ?', id);
    });
    return { ok: true };
  });

  // ---------- Uprawnienia ----------
  app.get('/api/permissions/:type/:id', async (req) => {
    const u = requireUser(req);
    const { type, id } = req.params as any;
    if (type === 'document') requireDocLevel(ctx, u, Number(id), 'view');
    return db.all<any>(
      `SELECT p.*, CASE p.subject_type WHEN 'operator' THEN o.name WHEN 'department' THEN d.name ELSE 'Wszyscy operatorzy' END AS subject_name
       FROM document_permissions p LEFT JOIN operators o ON p.subject_type = 'operator' AND o.id = p.subject_id
       LEFT JOIN departments d ON p.subject_type = 'department' AND d.id = p.subject_id WHERE p.target_type = ? AND p.target_id = ?`,
      type,
      Number(id),
    );
  });
  app.put('/api/permissions/:type/:id', async (req) => {
    const u = requireUser(req);
    const { type, id } = req.params as any;
    if (type === 'document') requireDocLevel(ctx, u, Number(id), 'edit');
    else if (type === 'folder') {
      if (!isManager(u) || folderLevel(ctx, u, Number(id)) !== 'edit') throw forbidden('Uprawnienia segregatora zmienia kierownik lub administrator.');
    } else throw bad('Nieznany obiekt.');
    const entries = ((req.body as any)?.entries ?? []) as any[];
    for (const e of entries) {
      if (!['operator', 'department', 'all'].includes(e.subject_type) || !['view', 'edit'].includes(e.level)) throw bad('Niepoprawny wpis uprawnień.');
    }
    if (type === 'document' && u.role !== 'admin') {
      // edytor nie może odebrać sobie dostępu
      const doc = db.get<any>('SELECT author_id FROM documents WHERE id = ?', Number(id));
      const keeps = doc.author_id === u.id || entries.some((e) => e.level === 'edit' && (e.subject_type === 'all' || (e.subject_type === 'operator' && Number(e.subject_id) === u.id) || (e.subject_type === 'department' && u.departments.includes(Number(e.subject_id)))));
      if (entries.length && !keeps) throw bad('Zachowaj sobie uprawnienie do edycji (dodaj wpis dla siebie lub swojego działu).');
    }
    db.tx(() => {
      db.run('DELETE FROM document_permissions WHERE target_type = ? AND target_id = ?', type, Number(id));
      for (const e of entries) db.insert('document_permissions', { target_type: type, target_id: Number(id), subject_type: e.subject_type, subject_id: e.subject_type === 'all' ? 0 : Number(e.subject_id), level: e.level });
      if (type === 'document') logDocument(ctx, Number(id), u.id, 'zmiana uprawnień', null, entries.map((e) => `${e.subject_type}:${e.subject_id}=${e.level}`).join(', ') || 'jak segregator');
    });
    return { ok: true };
  });

  // ---------- Dokumenty ----------
  app.get('/api/documents', async (req) => {
    const u = requireUser(req);
    const q = req.query as any;
    const w: string[] = [];
    const p: any[] = [];
    if (q.contractor_id) (w.push('d.contractor_id = ?'), p.push(+q.contractor_id));
    if (q.project_id) (w.push('d.project_id = ?'), p.push(+q.project_id));
    const rows = decorate(ctx, u, docRows(ctx, w.length ? 'WHERE ' + w.join(' AND ') : '', p));
    if (q.state === 'current') return rows.filter((r) => !r.is_archived);
    if (q.state === 'archived') return rows.filter((r) => r.is_archived);
    return rows;
  });
  app.get('/api/documents/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const { level } = requireDocLevel(ctx, u, id, 'view');
    const d = decorate(ctx, u, docRows(ctx, 'WHERE d.id = ?', [id]))[0];
    const versions = db.all<any>(
      `SELECT v.*, f.original_name, f.size, f.mime, o.name AS author FROM document_versions v JOIN files f ON f.id = v.file_id
       LEFT JOIN operators o ON o.id = v.author_id WHERE v.document_id = ? ORDER BY v.version DESC`,
      id,
    );
    const log = db.all('SELECT l.*, o.name AS operator FROM document_log l LEFT JOIN operators o ON o.id = l.operator_id WHERE l.document_id = ? ORDER BY l.id DESC', id);
    return { ...d, level, versions, log };
  });
  app.post('/api/documents', async (req) => {
    const u = requireUser(req);
    const { fields, files } = await readUpload(req);
    if (!files.length) throw bad('Wybierz plik dokumentu.');
    const meta = metaData({ ...fields, name: fields.name || files[0].filename.replace(/\.[^.]+$/, '') });
    if (!canAddToFolder(ctx, u, meta.folder_id)) throw forbidden('Brak uprawnień do dodawania dokumentów w tym segregatorze.');
    const fileId = saveFile(ctx, files[0].data, files[0].filename, files[0].mimetype, u.id);
    const id = createDocument(ctx, u, meta, fileId, str(fields.comment));
    return { id };
  });
  app.put('/api/documents/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const { doc } = requireDocLevel(ctx, u, id, 'edit');
    const b = req.body as any;
    const meta = metaData(b);
    if (meta.folder_id !== doc.folder_id && !canAddToFolder(ctx, u, meta.folder_id)) throw forbidden('Brak uprawnień do przeniesienia dokumentu do tego segregatora.');
    const archived = b.archived === undefined ? doc.archived : b.archived ? 1 : 0;
    db.update('documents', id, { ...meta, archived, updated_at: nowIso() });
    const changed = Object.keys(meta).filter((k) => String((meta as any)[k] ?? '') !== String(doc[k] ?? ''));
    if (archived !== doc.archived) changed.push(archived ? 'archiwizacja' : 'przywrócenie');
    logDocument(ctx, id, u.id, 'zmiana danych', null, changed.join(', ') || null);
    return { ok: true };
  });
  app.post('/api/documents/:id/versions', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const { doc } = requireDocLevel(ctx, u, id, 'edit');
    const { fields, files } = await readUpload(req);
    if (!files.length) throw bad('Wybierz plik nowej wersji.');
    const fileId = saveFile(ctx, files[0].data, files[0].filename, files[0].mimetype, u.id);
    db.tx(() => {
      const v = doc.current_version + 1;
      db.insert('document_versions', { document_id: id, version: v, file_id: fileId, author_id: u.id, comment: str(fields.comment), created_at: nowIso() });
      db.update('documents', id, { current_version: v, updated_at: nowIso() });
      logDocument(ctx, id, u.id, 'nowa wersja', v, str(fields.comment));
    });
    return { ok: true };
  });
  app.get('/api/documents/:id/file', async (req, reply) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const { doc } = requireDocLevel(ctx, u, id, 'view');
    const q = req.query as any;
    const ver = q.version != null ? Number(q.version) : doc.current_version;
    const v = db.get<any>('SELECT * FROM document_versions WHERE document_id = ? AND version = ?', id, ver);
    if (!v) throw notFound('Brak takiej wersji dokumentu.');
    const f = getFile(ctx, v.file_id)!;
    const inline = q.inline === '1';
    logDocument(ctx, id, u.id, inline ? 'podgląd' : 'pobranie', ver);
    reply.header('Content-Type', f.mime ?? 'application/octet-stream');
    reply.header('Content-Disposition', contentDisposition(f.original_name, inline));
    return reply.send(fs.createReadStream(filePath(ctx, f)));
  });
  app.delete('/api/documents/:id', async (req) => {
    const u = requireUser(req);
    if (u.role !== 'admin') throw forbidden('Dokumenty usuwa administrator; pozostali mogą je archiwizować.');
    const id = Number((req.params as any).id);
    db.tx(() => {
      db.run('UPDATE attachments SET source_document_id = NULL WHERE source_document_id = ?', id);
      db.run("DELETE FROM document_permissions WHERE target_type = 'document' AND target_id = ?", id);
      db.run('DELETE FROM documents WHERE id = ?', id);
    });
    return { ok: true };
  });
  /** Zapis załącznika (np. z korespondencji) do rejestru dokumentów. */
  app.post('/api/attachments/:id/to-document', async (req) => {
    const u = requireUser(req);
    const a = db.get<any>('SELECT a.*, f.original_name FROM attachments a JOIN files f ON f.id = a.file_id WHERE a.id = ?', Number((req.params as any).id));
    if (!a) throw notFound();
    if (a.source_document_id) throw bad('Ten załącznik pochodzi już z rejestru dokumentów.');
    const b = req.body as any;
    let contractor_id: number | null = null;
    let project_id: number | null = null;
    if (a.owner_type === 'correspondence') {
      const k = db.get<any>('SELECT contractor_id, project_id FROM correspondence WHERE id = ?', a.owner_id);
      contractor_id = k?.contractor_id ?? null;
      project_id = k?.project_id ?? null;
    } else if (a.owner_type === 'contractor') contractor_id = a.owner_id;
    else if (a.owner_type === 'project') project_id = a.owner_id;
    const meta = metaData({ name: b.name || a.original_name.replace(/\.[^.]+$/, ''), description: b.description, folder_id: b.folder_id, type_id: b.type_id, contractor_id, project_id, valid_from: b.valid_from, valid_to: b.valid_to });
    if (!canAddToFolder(ctx, u, meta.folder_id)) throw forbidden('Brak uprawnień do dodawania dokumentów w tym segregatorze.');
    const id = db.tx(() => {
      const id = createDocument(ctx, u, { ...meta, source: a.owner_type === 'correspondence' ? 'korespondencja' : 'rejestr' }, a.file_id, `z załącznika (${a.owner_type} #${a.owner_id})`);
      db.update('attachments', a.id, { source_document_id: id });
      return id;
    });
    return { id, number: db.get<any>('SELECT number FROM documents WHERE id = ?', id).number };
  });

  // ---------- Szablony ----------
  app.get('/api/doc-templates', async (req) => {
    requireUser(req);
    return { fields: TEMPLATE_FIELDS, templates: db.all('SELECT t.*, f.name AS folder_name FROM doc_templates t LEFT JOIN doc_folders f ON f.id = t.folder_id ORDER BY t.name') };
  });
  const tplData = (b: any) => {
    if (!str(b.name) || !str(b.title) || !str(b.body)) throw bad('Uzupełnij nazwę, tytuł i treść szablonu.');
    return { name: str(b.name), kind: str(b.kind) ?? 'inny', title: str(b.title), body: String(b.body), folder_id: toInt(b.folder_id), type_id: toInt(b.type_id), active: b.active === false ? 0 : 1 };
  };
  app.post('/api/doc-templates', async (req) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden('Szablony edytuje kierownik lub administrator.');
    return { id: db.insert('doc_templates', { ...tplData(req.body), created_at: nowIso() }) };
  });
  app.put('/api/doc-templates/:id', async (req) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden('Szablony edytuje kierownik lub administrator.');
    db.update('doc_templates', Number((req.params as any).id), tplData(req.body));
    return { ok: true };
  });
  app.delete('/api/doc-templates/:id', async (req) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden();
    db.run('DELETE FROM doc_templates WHERE id = ?', Number((req.params as any).id));
    return { ok: true };
  });

  const buildFromTemplate = (u: User, tplId: number, b: any, number: string) => {
    const tpl = db.get<any>('SELECT * FROM doc_templates WHERE id = ?', tplId);
    if (!tpl) throw notFound('Szablon nie istnieje.');
    const c = db.get<any>('SELECT * FROM contractors WHERE id = ?', toInt(b.contractor_id));
    if (!c) throw bad('Wybierz kontrahenta.');
    const contact = toInt(b.contact_id) ? db.get<any>('SELECT * FROM contacts WHERE id = ?', toInt(b.contact_id)) : db.get<any>('SELECT * FROM contacts WHERE contractor_id = ? AND active = 1 ORDER BY is_primary DESC, id LIMIT 1', c.id);
    const order = toInt(b.order_id) ? db.get<any>('SELECT * FROM orders WHERE id = ?', toInt(b.order_id)) : null;
    if (order && order.contractor_id !== c.id) throw bad('Zamówienie nie należy do wybranego kontrahenta.');
    let its: DocItem[] = [];
    if (order) its = db.all<any>('SELECT * FROM order_items WHERE order_id = ? ORDER BY sort', order.id);
    else if (Array.isArray(b.items))
      its = b.items
        .filter((i: any) => toInt(i.product_id) || str(i.name))
        .map((i: any) => {
          const p = toInt(i.product_id) ? db.get<any>('SELECT * FROM products WHERE id = ?', toInt(i.product_id)) : null;
          const qty = Number(i.qty) || 1;
          const price = i.net_price != null && i.net_price !== '' ? Number(i.net_price) : p?.net_price ?? 0;
          const vat = i.vat_rate != null && i.vat_rate !== '' ? Number(i.vat_rate) : p?.vat_rate ?? 23;
          const net = Math.round(qty * price * 100) / 100;
          return { name: str(i.name) ?? p?.name, qty, unit: p?.unit ?? 'szt.', net_price: price, vat_rate: vat, net_value: net, gross_value: Math.round(net * (100 + vat)) / 100 };
        });
    const co = company(ctx);
    const op = db.get<any>('SELECT * FROM operators WHERE id = ?', u.id);
    const data = {
      numer: number,
      data: fmtDatePl(todayIso()),
      waznosc: b.valid_to ? fmtDatePl(b.valid_to) : '',
      kontrahent: { nazwa: c.name, skrot: c.short_name || c.name, nip: c.nip ?? '', adres: [c.street, [c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', '), email: c.email ?? '' },
      osoba: { nazwa: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : '', stanowisko: contact?.position ?? '' },
      operator: { nazwa: op.name, email: op.email ?? '', telefon: op.phone ?? '' },
      firma: { nazwa: co.name, adres: co.address, nip: co.nip, konto: co.bank_account },
      zamowienie: { numer: order?.number ?? '', data: order ? fmtDatePl(order.order_date) : '', uwagi: order?.notes ?? '' },
      suma: { netto: fmtMoney(its.reduce((s, i) => s + i.net_value, 0)), brutto: fmtMoney(its.reduce((s, i) => s + i.gross_value, 0)) },
      pozycje: '[[POZYCJE]]',
    };
    return { tpl, c, order, body: renderTemplate(tpl.body, data), title: renderTemplate(tpl.title, data), items: its };
  };
  app.post('/api/doc-templates/:id/preview', async (req, reply) => {
    const u = requireUser(req);
    const r = buildFromTemplate(u, Number((req.params as any).id), req.body, 'DIAGNOS/D/(podgląd)');
    const pdf = await templatePdf(ctx, r.body, r.items);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', contentDisposition(`${r.title}.pdf`, true));
    return reply.send(pdf);
  });
  app.post('/api/doc-templates/:id/generate', async (req) => {
    const u = requireUser(req);
    const b = req.body as any;
    const tpl = db.get<any>('SELECT * FROM doc_templates WHERE id = ?', Number((req.params as any).id));
    if (!tpl) throw notFound('Szablon nie istnieje.');
    const folderId = toInt(b.folder_id) ?? tpl.folder_id;
    if (!canAddToFolder(ctx, u, folderId)) throw forbidden('Brak uprawnień do dodawania dokumentów w tym segregatorze.');
    // numer rezerwujemy przed generowaniem PDF, żeby trafił do treści dokumentu
    const number = makeNumber(db, 'D');
    const r = buildFromTemplate(u, tpl.id, b, number);
    const pdf = await templatePdf(ctx, r.body, r.items);
    const fileId = saveFile(ctx, pdf, `${r.title.replace(/[\\/:*?"<>|]/g, '_')}.pdf`, 'application/pdf', u.id);
    const id = createDocument(
      ctx,
      u,
      { name: r.title, description: str(b.description) ?? `Wygenerowano z szablonu „${tpl.name}”`, folder_id: folderId, type_id: tpl.type_id, contractor_id: r.c.id, project_id: toInt(b.project_id) ?? r.order?.project_id ?? null, valid_from: todayIso(), valid_to: str(b.valid_to), source: 'szablon' },
      fileId,
      `szablon: ${tpl.name}`,
      number,
    );
    return { id, number: db.get<any>('SELECT number FROM documents WHERE id = ?', id).number };
  });
}
