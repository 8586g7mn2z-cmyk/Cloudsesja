import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { isManager, requireUser, type User } from '../auth.js';
import { audit, bad, forbidden, makeNumber, notFound, nowIso, round2, str, todayIso, toInt, toNum, addMinutesIso } from '../util.js';
import { createTask, fireEvent, updateTask } from '../services/tasks.js';
import { attachmentsFor } from './contractors.js';

/** Poprawna data kalendarzowa w formacie RRRR-MM-DD. */
function isDate(v: any): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export const CASE_KINDS = ['zapytanie', 'przetarg', 'projekt'];
export const CASE_KIND_LABELS: Record<string, string> = { zapytanie: 'Zapytanie ofertowe', przetarg: 'Przetarg', projekt: 'Projekt' };
export const CASE_RESULTS = ['wygrane', 'przegrane', 'unieważnione', 'rezygnacja'];
const fmtDeadline = (v?: string | null) => (v ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)} ${v.slice(11, 16)}` : '—');

interface ItemIn {
  product_id?: number | null;
  name: string;
  qty: number;
  unit?: string | null;
  net_price: number;
  vat_rate: number;
}
function items(ctx: Ctx, list: any[]): (ItemIn & { net_value: number; gross_value: number })[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((i) => i && (str(i.name) || toInt(i.product_id)))
    .map((i, idx) => {
      const prod = toInt(i.product_id) ? ctx.db.get<any>('SELECT * FROM products WHERE id = ?', toInt(i.product_id)) : null;
      const name = str(i.name) ?? prod?.name;
      const qty = toNum(i.qty);
      const price = toNum(i.net_price) ?? prod?.net_price;
      const vat = toNum(i.vat_rate) ?? prod?.vat_rate ?? 23;
      if (!name) throw bad(`Pozycja ${idx + 1}: podaj nazwę.`);
      if (qty == null || !(qty > 0) || qty > 1e9) throw bad(`Pozycja ${idx + 1}: ilość musi być większa od zera.`);
      if (price == null || !(price >= 0) || price > 1e12) throw bad(`Pozycja ${idx + 1}: niepoprawna cena.`);
      if (!(vat >= 0 && vat <= 100)) throw bad(`Pozycja ${idx + 1}: stawka VAT musi mieścić się w przedziale 0–100%.`);
      const net = round2(qty * price);
      return { product_id: prod?.id ?? null, name, qty, unit: str(i.unit) ?? prod?.unit ?? 'szt.', net_price: price, vat_rate: vat, net_value: net, gross_value: round2(net * (1 + vat / 100)) };
    });
}

export async function businessRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  // ---------- Projekty ----------
  const projectList = (where = '', params: any[] = []) =>
    db.all<any>(
      `SELECT p.*, c.name AS contractor_name, c.short_name AS contractor_short, o.name AS manager_name, s.name AS status_name,
        (SELECT COUNT(*) FROM project_stages st WHERE st.project_id = p.id) AS stages_count,
        (SELECT COUNT(*) FROM project_stages st WHERE st.project_id = p.id AND st.status = 'zakończony') AS stages_done,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tasks_count,
        (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) + (SELECT COUNT(*) FROM attachments a WHERE a.owner_type = 'project' AND a.owner_id = p.id) AS docs_count,
        (SELECT COUNT(*) FROM correspondence k WHERE k.project_id = p.id) AS corr_count
       FROM projects p LEFT JOIN contractors c ON c.id = p.contractor_id LEFT JOIN operators o ON o.id = p.manager_id
       LEFT JOIN dict_items s ON s.id = p.status_id ${where} ORDER BY p.created_at DESC`,
      ...params,
    );
  app.get('/api/projects', async (req) => {
    requireUser(req);
    const q = req.query as any;
    return q.contractor_id ? projectList('WHERE p.contractor_id = ?', [+q.contractor_id]) : projectList();
  });
  app.get('/api/projects/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const p = projectList('WHERE p.id = ?', [id])[0];
    if (!p) throw notFound('Projekt nie istnieje.');
    const stages = db.all('SELECT * FROM project_stages WHERE project_id = ? ORDER BY sort, id', id);
    return { ...p, stages, attachments: attachmentsFor(ctx, u, 'project', id) };
  });
  app.get('/api/project-stages', async (req) => {
    requireUser(req);
    return db.all('SELECT id, project_id, name, status FROM project_stages ORDER BY project_id, sort, id');
  });
  const projectData = (b: any) => {
    if (!str(b.name)) throw bad('Podaj nazwę (przedmiot) zapytania lub przetargu.');
    if (b.start_date && b.end_date && b.end_date < b.start_date) throw bad('Termin zakończenia jest wcześniejszy niż rozpoczęcia.');
    const kind = b.kind == null || b.kind === '' ? 'zapytanie' : b.kind;
    if (!CASE_KINDS.includes(kind)) throw bad('Wybierz rodzaj: zapytanie, przetarg lub projekt.');
    const result = str(b.result);
    if (result && !CASE_RESULTS.includes(result)) throw bad('Niepoprawny wynik postępowania.');
    for (const [k, label] of [['received_date', 'Data wpływu'], ['result_date', 'Data rozstrzygnięcia'], ['start_date', 'Rozpoczęcie'], ['end_date', 'Zakończenie']]) if (str(b[k]) && !isDate(b[k])) throw bad(`${label}: niepoprawna data.`);
    let deadline = str(b.submit_deadline);
    if (deadline) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) deadline += 'T12:00:00';
      else if (deadline.length === 16) deadline += ':00';
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(deadline) || !isDate(deadline.slice(0, 10))) throw bad('Termin składania ofert: niepoprawna data lub godzina.');
    }
    return {
      kind,
      ref_no: str(b.ref_no),
      source: str(b.source),
      received_date: str(b.received_date),
      submit_deadline: deadline,
      result,
      result_date: str(b.result_date),
      name: str(b.name),
      contractor_id: toInt(b.contractor_id),
      manager_id: toInt(b.manager_id),
      start_date: str(b.start_date),
      end_date: str(b.end_date),
      status_id: toInt(b.status_id),
      budget: toNum(b.budget),
      description: b.description ?? null,
    };
  };
  const saveStages = (projectId: number, stages: any[]) => {
    if (!Array.isArray(stages)) return;
    const keep: number[] = [];
    stages.forEach((s, i) => {
      if (!str(s.name)) return;
      if (str(s.start_date) && str(s.end_date) && s.end_date < s.start_date) throw bad(`Etap „${str(s.name)}”: termin zakończenia jest wcześniejszy niż rozpoczęcia.`);
      const d = { name: str(s.name), start_date: str(s.start_date), end_date: str(s.end_date), status: ['planowany', 'w toku', 'zakończony'].includes(s.status) ? s.status : 'planowany', sort: i };
      if (toInt(s.id)) {
        db.update('project_stages', toInt(s.id)!, d);
        keep.push(toInt(s.id)!);
      } else keep.push(db.insert('project_stages', { ...d, project_id: projectId }));
    });
    const old = db.all<any>('SELECT id FROM project_stages WHERE project_id = ?', projectId).filter((r) => !keep.includes(r.id));
    for (const o of old) {
      db.run('UPDATE correspondence SET stage_id = NULL WHERE stage_id = ?', o.id);
      db.run('UPDATE tasks SET stage_id = NULL WHERE stage_id = ?', o.id);
      db.run('DELETE FROM project_stages WHERE id = ?', o.id);
    }
  };
  /**
   * Termin składania ofert ma własne zadanie dla opiekuna (z przypomnieniem dzień wcześniej).
   * Zadanie powstaje, przesuwa się i znika razem z terminem; wykonanego już nie ruszamy.
   */
  const syncDeadlineTask = (projectId: number, actorId: number) => {
    const p = db.get<any>('SELECT * FROM projects WHERE id = ?', projectId)!;
    const existing = p.deadline_task_id ? db.get<any>('SELECT t.*, s.code FROM tasks t JOIN dict_items s ON s.id = t.status_id WHERE t.id = ?', p.deadline_task_id) : null;
    const open = existing && existing.code !== 'done' && existing.code !== 'cancelled';
    if (!p.submit_deadline || !p.manager_id || p.result) {
      if (existing && open && existing.progress === 0) db.run('DELETE FROM tasks WHERE id = ?', existing.id);
      if (!existing || (open && existing.progress === 0)) db.update('projects', projectId, { deadline_task_id: null });
      return;
    }
    const input = {
      title: `Termin składania ofert: ${p.name}`,
      description: `${CASE_KIND_LABELS[p.kind] ?? 'Sprawa'} ${p.number}${p.ref_no ? ` (znak ${p.ref_no})` : ''}. Termin złożenia oferty: ${p.submit_deadline.slice(0, 16).replace('T', ' ')}.`,
      start_at: addMinutesIso(p.submit_deadline, -60),
      end_at: p.submit_deadline,
      operator_ids: [p.manager_id],
      principal_id: actorId,
      priority: 4,
      contractor_id: p.contractor_id,
      project_id: projectId,
      remind_before_min: 23 * 60,
      remind_inapp: true,
      remind_email: true,
    };
    if (existing && open) updateTask(ctx, existing.id, { ...input, progress: existing.progress, status_id: existing.status_id });
    else if (!existing) db.update('projects', projectId, { deadline_task_id: createTask(ctx, input, actorId) });
  };

  app.post('/api/projects', async (req) => {
    const u = requireUser(req);
    const b = req.body as any;
    const id = db.tx(() => {
      const number = makeNumber(db, 'PRJ');
      const id = db.insert('projects', { ...projectData(b), manager_id: toInt(b.manager_id) ?? u.id, number, created_at: nowIso(), created_by: u.id });
      saveStages(id, b.stages);
      syncDeadlineTask(id, u.id);
      fireEvent(ctx, 'project.created', { project_id: id, contractor_id: toInt(b.contractor_id), number, actor_id: u.id });
      return id;
    });
    audit(db, u.id, 'project', id, 'dodanie');
    return { id };
  });
  app.put('/api/projects/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const before = db.get<any>('SELECT p.*, s.name AS status_name FROM projects p LEFT JOIN dict_items s ON s.id = p.status_id WHERE p.id = ?', id);
    if (!before) throw notFound();
    const b = req.body as any;
    db.tx(() => {
      db.update('projects', id, projectData(b));
      saveStages(id, b.stages);
      syncDeadlineTask(id, u.id);
    });
    // najważniejsze zmiany trafiają do historii sprawy czytelnym opisem
    const after = db.get<any>('SELECT p.*, s.name AS status_name FROM projects p LEFT JOIN dict_items s ON s.id = p.status_id WHERE p.id = ?', id)!;
    const changes: string[] = [];
    if (before.status_name !== after.status_name) changes.push(`status: ${before.status_name ?? '—'} → ${after.status_name ?? '—'}`);
    if ((before.result ?? '') !== (after.result ?? '')) changes.push(`wynik: ${before.result || '—'} → ${after.result || '—'}`);
    if ((before.submit_deadline ?? '') !== (after.submit_deadline ?? '')) changes.push(`termin składania ofert: ${fmtDeadline(before.submit_deadline)} → ${fmtDeadline(after.submit_deadline)}`);
    if (before.manager_id !== after.manager_id) changes.push('zmiana opiekuna');
    audit(db, u.id, 'project', id, changes.length ? 'zmiana' : 'zmiana danych', changes.length ? changes.join('; ') : undefined);
    return { id };
  });
  app.delete('/api/projects/:id', async (req) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden();
    const id = Number((req.params as any).id);
    const n = db.get<any>('SELECT (SELECT COUNT(*) FROM correspondence WHERE project_id = ?) + (SELECT COUNT(*) FROM tasks WHERE project_id = ?) + (SELECT COUNT(*) FROM documents WHERE project_id = ?) AS n', id, id, id)!.n;
    const dt = db.get<any>('SELECT deadline_task_id AS t FROM projects WHERE id = ?', id)?.t;
    const others = dt ? db.get<any>('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ? AND id <> ?', id, dt)!.n + db.get<any>('SELECT (SELECT COUNT(*) FROM correspondence WHERE project_id = ?) + (SELECT COUNT(*) FROM documents WHERE project_id = ?) AS n', id, id)!.n : n;
    if (others) throw bad('Sprawa ma powiązaną korespondencję, zadania lub dokumenty i nie może zostać usunięta.');
    if (dt) db.run('DELETE FROM tasks WHERE id = ?', dt);
    db.run('DELETE FROM projects WHERE id = ?', id);
    return { ok: true };
  });

  // ---------- Kartoteka towarowa ----------
  app.get('/api/products', async (req) => {
    requireUser(req);
    return db.all('SELECT * FROM products ORDER BY name');
  });
  const productData = (b: any) => {
    if (!str(b.name)) throw bad('Podaj nazwę towaru.');
    const price = toNum(b.net_price);
    if (price == null || price < 0) throw bad('Podaj poprawną cenę netto.');
    const vat = toNum(b.vat_rate);
    if (vat == null || vat < 0 || vat > 100) throw bad('Podaj stawkę VAT (0–100).');
    return { sku: str(b.sku), name: str(b.name), unit: str(b.unit) ?? 'szt.', net_price: price, vat_rate: vat, ean: str(b.ean), product_group: str(b.product_group), active: b.active === false ? 0 : 1 };
  };
  app.post('/api/products', async (req) => {
    if (!isManager(requireUser(req))) throw forbidden('Kartotekę towarową zmienia kierownik lub administrator.');
    const d = productData(req.body);
    if (d.sku && db.get('SELECT id FROM products WHERE sku = ?', d.sku)) throw bad('Towar o takim indeksie już istnieje.');
    return { id: db.insert('products', { ...d, created_at: nowIso() }) };
  });
  app.put('/api/products/:id', async (req) => {
    if (!isManager(requireUser(req))) throw forbidden('Kartotekę towarową zmienia kierownik lub administrator.');
    const id = Number((req.params as any).id);
    const d = productData(req.body);
    if (d.sku && db.get('SELECT id FROM products WHERE sku = ? AND id <> ?', d.sku, id)) throw bad('Towar o takim indeksie już istnieje.');
    db.update('products', id, d);
    return { id };
  });
  app.delete('/api/products/:id', async (req) => {
    if (!isManager(requireUser(req))) throw forbidden('Kartotekę towarową zmienia kierownik lub administrator.');
    const id = Number((req.params as any).id);
    const used = db.get<any>('SELECT (SELECT COUNT(*) FROM order_items WHERE product_id = ?) + (SELECT COUNT(*) FROM sale_items WHERE product_id = ?) AS n', id, id)!.n;
    if (used) db.run('UPDATE products SET active = 0 WHERE id = ?', id);
    else db.run('DELETE FROM products WHERE id = ?', id);
    return { ok: true, deactivated: !!used };
  });

  // ---------- Zamówienia ----------
  const orderList = (where = '', params: any[] = []) =>
    db.all<any>(
      `SELECT z.*, c.name AS contractor_name, c.short_name AS contractor_short, c.city AS contractor_city, o.name AS operator_name, s.name AS status_name, p.name AS project_name,
        (SELECT COUNT(*) FROM order_items i WHERE i.order_id = z.id) AS items_count
       FROM orders z JOIN contractors c ON c.id = z.contractor_id LEFT JOIN operators o ON o.id = z.operator_id
       LEFT JOIN dict_items s ON s.id = z.status_id LEFT JOIN projects p ON p.id = z.project_id ${where} ORDER BY z.order_date DESC, z.id DESC`,
      ...params,
    );
  app.get('/api/orders', async (req) => {
    requireUser(req);
    const q = req.query as any;
    return q.contractor_id ? orderList('WHERE z.contractor_id = ?', [+q.contractor_id]) : orderList();
  });
  app.get('/api/orders/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const z = orderList('WHERE z.id = ?', [id])[0];
    if (!z) throw notFound('Zamówienie nie istnieje.');
    return { ...z, items: db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY sort', id), attachments: attachmentsFor(ctx, u, 'order', id) };
  });
  const orderData = (b: any) => {
    if (!toInt(b.contractor_id)) throw bad('Wybierz kontrahenta.');
    if (!isDate(b.order_date)) throw bad('Podaj poprawną datę zamówienia.');
    if (b.delivery_date && !isDate(b.delivery_date)) throw bad('Niepoprawna data dostawy.');
    return { contractor_id: toInt(b.contractor_id), order_date: b.order_date, delivery_date: str(b.delivery_date), status_id: toInt(b.status_id), operator_id: toInt(b.operator_id), project_id: toInt(b.project_id), notes: b.notes ?? null };
  };
  const writeItems = (table: 'order_items' | 'sale_items', fk: string, id: number, list: ReturnType<typeof items>) => {
    db.run(`DELETE FROM ${table} WHERE ${fk} = ?`, id);
    list.forEach((it, i) => db.insert(table, { ...it, [fk]: id, sort: i }));
    return { net: round2(list.reduce((s, i) => s + i.net_value, 0)), gross: round2(list.reduce((s, i) => s + i.gross_value, 0)) };
  };
  app.post('/api/orders', async (req) => {
    const u = requireUser(req);
    const b = req.body as any;
    const d = orderData(b);
    const its = items(ctx, b.items);
    if (!its.length) throw bad('Dodaj co najmniej jedną pozycję zamówienia.');
    const id = db.tx(() => {
      const number = makeNumber(db, 'ZAM', d.order_date);
      const status = d.status_id ?? db.get<any>("SELECT id FROM dict_items WHERE dict = 'order_status' ORDER BY sort LIMIT 1")?.id;
      const id = db.insert('orders', { ...d, status_id: status, operator_id: d.operator_id ?? u.id, number, created_at: nowIso(), created_by: u.id });
      const t = writeItems('order_items', 'order_id', id, its);
      db.update('orders', id, { net_total: t.net, gross_total: t.gross });
      fireEvent(ctx, 'order.created', { order_id: id, contractor_id: d.contractor_id, number, actor_id: u.id });
      return id;
    });
    audit(db, u.id, 'order', id, 'dodanie');
    return { id };
  });
  app.put('/api/orders/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const cur = db.get<any>('SELECT operator_id, created_by FROM orders WHERE id = ?', id);
    if (!cur) throw notFound();
    if (!isManager(u) && cur.operator_id !== u.id && cur.created_by !== u.id) throw forbidden('Zamówienie może zmienić jego opiekun, kierownik lub administrator.');
    const b = req.body as any;
    const d = orderData(b);
    const its = items(ctx, b.items);
    if (!its.length) throw bad('Dodaj co najmniej jedną pozycję zamówienia.');
    db.tx(() => {
      db.update('orders', id, d);
      const t = writeItems('order_items', 'order_id', id, its);
      db.update('orders', id, { net_total: t.net, gross_total: t.gross });
    });
    audit(db, u.id, 'order', id, 'zmiana');
    return { id };
  });
  app.delete('/api/orders/:id', async (req) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden();
    db.run('DELETE FROM orders WHERE id = ?', Number((req.params as any).id));
    return { ok: true };
  });

  // ---------- Sprzedaż ----------
  const saleList = (where = '', params: any[] = []) =>
    db.all<any>(
      `SELECT s.*, c.name AS contractor_name, c.short_name AS contractor_short, c.city AS contractor_city, o.name AS operator_name,
        (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS items_count
       FROM sales s JOIN contractors c ON c.id = s.contractor_id LEFT JOIN operators o ON o.id = s.operator_id ${where} ORDER BY s.doc_date DESC, s.id DESC`,
      ...params,
    );
  app.get('/api/sales', async (req) => {
    requireUser(req);
    const q = req.query as any;
    return q.contractor_id ? saleList('WHERE s.contractor_id = ?', [+q.contractor_id]) : saleList();
  });
  app.get('/api/sales/:id', async (req) => {
    requireUser(req);
    const id = Number((req.params as any).id);
    const s = saleList('WHERE s.id = ?', [id])[0];
    if (!s) throw notFound();
    return { ...s, items: db.all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY sort', id) };
  });
  const saleData = (b: any) => {
    if (!str(b.doc_number)) throw bad('Podaj numer dokumentu sprzedaży.');
    if (!isDate(b.doc_date)) throw bad('Podaj poprawną datę dokumentu.');
    if (!toInt(b.contractor_id)) throw bad('Wybierz kontrahenta.');
    return { doc_number: str(b.doc_number), doc_date: b.doc_date, contractor_id: toInt(b.contractor_id), operator_id: toInt(b.operator_id), notes: b.notes ?? null };
  };
  const saveSale = (id: number | null, b: any, u: User) => {
    const userId = u.id;
    const d = saleData(b);
    if (id) {
      const cur = db.get<any>('SELECT operator_id, created_by, source FROM sales WHERE id = ?', id);
      if (!cur) throw notFound();
      // Sprzedaż jest podstawą raportu skuteczności: handlowiec poprawia tylko własne, ręcznie wprowadzone dokumenty.
      if (!isManager(u) && (cur.source === 'import' || (cur.operator_id !== u.id && cur.created_by !== u.id))) throw forbidden('Ten dokument sprzedaży może zmienić kierownik lub administrator.');
      if (!isManager(u)) d.operator_id = cur.operator_id;
    } else if (!isManager(u)) d.operator_id = u.id;
    const its = items(ctx, b.items);
    const dup = db.get<any>('SELECT id FROM sales WHERE doc_number = ? AND contractor_id = ? AND id <> ?', d.doc_number, d.contractor_id, id ?? 0);
    if (dup) throw bad(`Dokument sprzedaży ${d.doc_number} dla tego kontrahenta już istnieje.`);
    return db.tx(() => {
      let net = toNum(b.net_total);
      let gross = toNum(b.gross_total);
      if (!its.length && net == null) throw bad('Dodaj pozycje lub podaj wartość netto dokumentu.');
      if (id) db.update('sales', id, d);
      else id = db.insert('sales', { ...d, operator_id: d.operator_id ?? userId, source: 'ręcznie', created_at: nowIso(), created_by: userId });
      const t = writeItems('sale_items', 'sale_id', id, its);
      if (its.length) {
        net = t.net;
        gross = t.gross;
      }
      db.update('sales', id, { net_total: net ?? 0, gross_total: gross ?? round2((net ?? 0) * 1.23) });
      return id;
    });
  };
  app.post('/api/sales', async (req) => {
    const u = requireUser(req);
    return { id: saveSale(null, req.body, u) };
  });
  app.put('/api/sales/:id', async (req) => {
    const u = requireUser(req);
    return { id: saveSale(Number((req.params as any).id), req.body, u) };
  });
  app.delete('/api/sales/:id', async (req) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden();
    db.run('DELETE FROM sales WHERE id = ?', Number((req.params as any).id));
    return { ok: true };
  });

  app.get('/api/time-entries', async (req) => {
    requireUser(req);
    const q = req.query as any;
    return db.all(
      `SELECT e.*, o.name AS operator, t.title AS task_title FROM time_entries e JOIN operators o ON o.id = e.operator_id LEFT JOIN tasks t ON t.id = e.task_id
       WHERE (? IS NULL OR e.contractor_id = ?) AND (? IS NULL OR e.project_id = ?) ORDER BY e.work_date DESC`,
      toInt(q.contractor_id),
      toInt(q.contractor_id),
      toInt(q.project_id),
      toInt(q.project_id),
    );
  });
  void todayIso;
}
