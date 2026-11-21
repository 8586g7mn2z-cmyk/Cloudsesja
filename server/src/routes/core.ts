import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context.js';
import { encryptSecret, getSetting, setSetting } from '../context.js';
import {
  createSession,
  hashPassword,
  loadUser,
  isManager,
  passwordProblem,
  requireRole,
  requireUser,
  ROLES,
  SESSION_COOKIE,
  verifyPassword,
} from '../auth.js';
import { audit, bad, forbidden, isValidEmail, notFound, nowIso, str, toInt } from '../util.js';
import { dictLabels } from '../migrations.js';
import { defaultSms, defaultSmtp, isSmtpConfigured, processOutbox, retryOutbox, cancelOutbox, sendMailNow, smsAdapter, smsSettings, smtpSettings, OUTBOX_LABELS } from '../services/messaging.js';
import { defaultCompany } from '../services/pdf.js';
import { contentDisposition, filePath, getFile, saveFile } from '../services/files.js';

const failures = new Map<string, { n: number; until: number }>();

export function operatorPublic(o: any) {
  const { password_hash, ...rest } = o;
  return rest;
}

export async function readUpload(req: any): Promise<{ fields: Record<string, string>; files: { filename: string; mimetype: string; data: Buffer }[] }> {
  const fields: Record<string, string> = {};
  const files: { filename: string; mimetype: string; data: Buffer }[] = [];
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const data = await part.toBuffer();
      if (part.filename) files.push({ filename: part.filename, mimetype: part.mimetype, data });
    } else fields[part.fieldname] = String(part.value ?? '');
  }
  return { fields, files };
}

export async function coreRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  // ---------- Logowanie ----------
  app.post('/api/auth/login', async (req, reply) => {
    const { login, password } = (req.body ?? {}) as any;
    const key = String(login ?? '').toLowerCase();
    const f = failures.get(key);
    if (f && f.until > Date.now()) throw bad('Zbyt wiele nieudanych prób. Spróbuj ponownie za minutę.');
    const op = db.get<any>('SELECT * FROM operators WHERE lower(login) = ? AND active = 1', key);
    if (!op || !verifyPassword(String(password ?? ''), op.password_hash)) {
      const n = (f?.n ?? 0) + 1;
      failures.set(key, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
      return reply.code(401).send({ error: 'Niepoprawny login lub hasło.' });
    }
    failures.delete(key);
    const sid = createSession(ctx, op.id);
    db.run('UPDATE operators SET last_login_at = ? WHERE id = ?', nowIso(), op.id);
    reply.setCookie(SESSION_COOKIE, sid, { path: '/', httpOnly: true, sameSite: 'lax', secure: ctx.config.cookieSecure, maxAge: 12 * 3600 });
    return { user: loadUser(ctx, op.id), must_change_password: !!op.must_change_password };
  });
  app.post('/api/auth/logout', async (req, reply) => {
    const sid = req.cookies[SESSION_COOKIE];
    if (sid) db.run('DELETE FROM sessions WHERE id = ?', sid);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
  app.get('/api/auth/me', async (req) => ({ user: req.user ?? null }));
  app.post('/api/auth/password', async (req) => {
    const u = requireUser(req);
    const { current, password } = (req.body ?? {}) as any;
    const op = db.get<any>('SELECT password_hash FROM operators WHERE id = ?', u.id)!;
    if (!verifyPassword(String(current ?? ''), op.password_hash)) throw bad('Obecne hasło jest niepoprawne.');
    const p = passwordProblem(String(password ?? ''));
    if (p) throw bad(p);
    if (current === password) throw bad('Nowe hasło musi różnić się od obecnego.');
    db.run('UPDATE operators SET password_hash = ?, must_change_password = 0 WHERE id = ?', hashPassword(password), u.id);
    const f = path.join(ctx.config.dataDir, 'haslo-startowe-admin.txt');
    if (u.login === 'admin' && fs.existsSync(f)) fs.unlinkSync(f);
    audit(db, u.id, 'operator', u.id, 'zmiana hasła');
    return { ok: true };
  });

  // ---------- Operatorzy ----------
  const listOperators = () => {
    const ops = db.all<any>('SELECT id, login, name, email, phone, role, manager_id, active, must_change_password, last_login_at, created_at FROM operators ORDER BY name');
    const deps = db.all<any>('SELECT operator_id, department_id FROM operator_departments');
    return ops.map((o) => ({ ...o, departments: deps.filter((d) => d.operator_id === o.id).map((d) => d.department_id) }));
  };
  app.get('/api/operators', async () => listOperators());
  const saveOperator = (id: number | null, b: any) => {
    const login = str(b.login)?.toLowerCase();
    if (!login || !/^[a-z0-9._-]{3,}$/.test(login)) throw bad('Login: co najmniej 3 znaki (litery, cyfry, kropka, myślnik).');
    if (!str(b.name)) throw bad('Podaj imię i nazwisko operatora.');
    if (!ROLES.includes(b.role)) throw bad('Wybierz rolę.');
    if (b.email && !isValidEmail(b.email)) throw bad('Niepoprawny adres e-mail.');
    const dup = db.get<any>('SELECT id FROM operators WHERE lower(login) = ? AND id <> ?', login, id ?? 0);
    if (dup) throw bad('Operator o takim loginie już istnieje.');
    const managerId = toInt(b.manager_id);
    if (managerId && managerId === id) throw bad('Operator nie może być swoim przełożonym.');
    const data: any = { login, name: str(b.name), email: str(b.email), phone: str(b.phone), role: b.role, manager_id: managerId, active: b.active === false || b.active === 0 ? 0 : 1 };
    return db.tx(() => {
      if (id) {
        if (data.active === 0 || data.role !== 'admin') {
          const admins = db.get<any>("SELECT COUNT(*) AS n FROM operators WHERE role = 'admin' AND active = 1 AND id <> ?", id)!.n;
          const wasAdmin = db.get<any>('SELECT role FROM operators WHERE id = ?', id)?.role === 'admin';
          if (wasAdmin && admins === 0) throw bad('W systemie musi pozostać co najmniej jeden aktywny administrator.');
        }
        db.update('operators', id, data);
      } else {
        const p = passwordProblem(String(b.password ?? ''));
        if (p) throw bad(p);
        id = db.insert('operators', { ...data, password_hash: hashPassword(b.password), must_change_password: b.must_change_password === false ? 0 : 1, created_at: nowIso() });
      }
      db.run('DELETE FROM operator_departments WHERE operator_id = ?', id);
      for (const d of (b.departments ?? []) as number[]) db.run('INSERT INTO operator_departments (operator_id, department_id) VALUES (?, ?)', id, d);
      return id;
    });
  };
  app.post('/api/operators', async (req) => {
    const u = requireRole(req, 'admin');
    const id = saveOperator(null, req.body);
    audit(db, u.id, 'operator', id, 'dodanie');
    return { id };
  });
  app.put('/api/operators/:id', async (req) => {
    const u = requireRole(req, 'admin');
    const id = Number((req.params as any).id);
    saveOperator(id, req.body);
    audit(db, u.id, 'operator', id, 'zmiana');
    return { id };
  });
  app.post('/api/operators/:id/reset-password', async (req) => {
    const u = requireRole(req, 'admin');
    const id = Number((req.params as any).id);
    const { password } = (req.body ?? {}) as any;
    const p = passwordProblem(String(password ?? ''));
    if (p) throw bad(p);
    db.run('UPDATE operators SET password_hash = ?, must_change_password = 1 WHERE id = ?', hashPassword(password), id);
    db.run('DELETE FROM sessions WHERE operator_id = ?', id);
    audit(db, u.id, 'operator', id, 'reset hasła');
    return { ok: true };
  });

  // ---------- Działy (grupy uprawnień) ----------
  app.get('/api/departments', async () => db.all('SELECT * FROM departments ORDER BY name'));
  app.post('/api/departments', async (req) => {
    requireRole(req, 'admin');
    const name = str((req.body as any)?.name);
    if (!name) throw bad('Podaj nazwę działu.');
    if (db.get('SELECT id FROM departments WHERE lower(name) = lower(?)', name)) throw bad('Dział o tej nazwie już istnieje.');
    return { id: db.insert('departments', { name }) };
  });
  app.put('/api/departments/:id', async (req) => {
    requireRole(req, 'admin');
    const name = str((req.body as any)?.name);
    if (!name) throw bad('Podaj nazwę działu.');
    db.update('departments', Number((req.params as any).id), { name });
    return { ok: true };
  });
  app.delete('/api/departments/:id', async (req) => {
    requireRole(req, 'admin');
    const id = Number((req.params as any).id);
    db.tx(() => {
      db.run("DELETE FROM document_permissions WHERE subject_type = 'department' AND subject_id = ?", id);
      db.run('DELETE FROM departments WHERE id = ?', id);
    });
    return { ok: true };
  });

  // ---------- Słowniki ----------
  app.get('/api/dicts', async () => {
    const items = db.all<any>('SELECT * FROM dict_items ORDER BY dict, sort, name');
    const out: Record<string, any[]> = {};
    for (const it of items) (out[it.dict] ??= []).push(it);
    return { labels: dictLabels, items: out };
  });
  app.post('/api/dicts/:dict', async (req) => {
    requireRole(req, 'admin');
    const dict = (req.params as any).dict;
    if (!dictLabels[dict] && dict !== 'contractor_subgroup') throw bad('Nieznany słownik.');
    const b = req.body as any;
    const name = str(b.name);
    if (!name) throw bad('Podaj nazwę pozycji.');
    if (dict === 'contractor_subgroup' && !toInt(b.parent_id)) throw bad('Podgrupa musi należeć do grupy.');
    const max = db.get<any>('SELECT COALESCE(MAX(sort), 0) AS m FROM dict_items WHERE dict = ?', dict)!.m;
    return { id: db.insert('dict_items', { dict, name, parent_id: toInt(b.parent_id), color: str(b.color), sort: max + 1 }) };
  });
  app.put('/api/dict-items/:id', async (req) => {
    requireRole(req, 'admin');
    const b = req.body as any;
    const name = str(b.name);
    if (!name) throw bad('Podaj nazwę pozycji.');
    db.update('dict_items', Number((req.params as any).id), { name, color: str(b.color), sort: toInt(b.sort) ?? undefined, active: b.active === false ? 0 : 1 });
    return { ok: true };
  });
  app.delete('/api/dict-items/:id', async (req) => {
    requireRole(req, 'admin');
    const id = Number((req.params as any).id);
    const it = db.get<any>('SELECT * FROM dict_items WHERE id = ?', id);
    if (!it) throw notFound();
    if (it.system) throw bad('Pozycja systemowa nie może zostać usunięta (można zmienić jej nazwę).');
    try {
      db.tx(() => {
        db.run('DELETE FROM contractor_group_members WHERE group_id = ?', id);
        db.run('DELETE FROM dict_items WHERE id = ?', id);
      });
      return { ok: true, deactivated: false };
    } catch {
      db.run('UPDATE dict_items SET active = 0 WHERE id = ?', id);
      return { ok: true, deactivated: true };
    }
  });

  // ---------- Pola dodatkowe ----------
  app.get('/api/custom-fields', async () => db.all<any>("SELECT * FROM custom_fields WHERE entity = 'contractor' ORDER BY sort, id").map((f) => ({ ...f, options: f.options ? JSON.parse(f.options) : [] })));
  const saveField = (id: number | null, b: any) => {
    const label = str(b.label);
    if (!label) throw bad('Podaj nazwę pola.');
    if (!['text', 'number', 'date', 'select', 'bool'].includes(b.type)) throw bad('Wybierz typ pola.');
    const options = b.type === 'select' ? (Array.isArray(b.options) ? b.options : String(b.options ?? '').split('\n')).map((s: string) => s.trim()).filter(Boolean) : [];
    if (b.type === 'select' && !options.length) throw bad('Lista wyboru wymaga co najmniej jednej wartości.');
    if (id) {
      db.update('custom_fields', id, { label, type: b.type, options: JSON.stringify(options), sort: toInt(b.sort) ?? 0, active: b.active === false ? 0 : 1 });
      return id;
    }
    let code = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'pole';
    while (db.get("SELECT id FROM custom_fields WHERE entity = 'contractor' AND code = ?", code)) code += '_';
    return db.insert('custom_fields', { entity: 'contractor', code, label, type: b.type, options: JSON.stringify(options), sort: toInt(b.sort) ?? 0 });
  };
  app.post('/api/custom-fields', async (req) => {
    requireRole(req, 'admin');
    return { id: saveField(null, req.body) };
  });
  app.put('/api/custom-fields/:id', async (req) => {
    requireRole(req, 'admin');
    return { id: saveField(Number((req.params as any).id), req.body) };
  });
  app.delete('/api/custom-fields/:id', async (req) => {
    requireRole(req, 'admin');
    db.run('DELETE FROM custom_fields WHERE id = ?', Number((req.params as any).id));
    return { ok: true };
  });

  // ---------- Ustawienia ----------
  app.get('/api/settings/company', async () => getSetting(ctx, 'company', defaultCompany));
  app.put('/api/settings/company', async (req) => {
    requireRole(req, 'admin');
    const cur = getSetting(ctx, 'company', defaultCompany);
    const b = req.body as any;
    const next: any = { ...cur };
    for (const k of Object.keys(defaultCompany)) if (k !== 'logo_file_id' && b[k] !== undefined) next[k] = String(b[k] ?? '');
    setSetting(ctx, 'company', next);
    return next;
  });
  app.post('/api/settings/company/logo', async (req) => {
    const u = requireRole(req, 'admin');
    const { files } = await readUpload(req);
    const f = files[0];
    if (!f || !/image\/(png|jpeg)/.test(f.mimetype)) throw bad('Logo musi być plikiem PNG lub JPG.');
    const id = saveFile(ctx, f.data, f.filename, f.mimetype, u.id);
    setSetting(ctx, 'company', { ...getSetting(ctx, 'company', defaultCompany), logo_file_id: id });
    return { id };
  });
  app.delete('/api/settings/company/logo', async (req) => {
    requireRole(req, 'admin');
    setSetting(ctx, 'company', { ...getSetting(ctx, 'company', defaultCompany), logo_file_id: null });
    return { ok: true };
  });
  app.get('/api/settings/logo', async (req, reply) => {
    const c = getSetting(ctx, 'company', defaultCompany);
    const f = c.logo_file_id ? getFile(ctx, c.logo_file_id) : null;
    if (!f) throw notFound('Brak logo.');
    reply.header('Content-Type', f.mime ?? 'image/png');
    return reply.send(fs.createReadStream(filePath(ctx, f)));
  });
  app.get('/api/settings/status', async () => {
    const sms = smsSettings(ctx);
    return { smtp_configured: isSmtpConfigured(ctx), sms_configured: smsAdapter(ctx).configured, sms_provider: sms.provider };
  });
  app.get('/api/settings/smtp', async (req) => {
    requireRole(req, 'admin');
    const { password_enc, ...s } = smtpSettings(ctx);
    return { ...s, has_password: !!password_enc, configured: isSmtpConfigured(ctx) };
  });
  app.put('/api/settings/smtp', async (req) => {
    const u = requireRole(req, 'admin');
    const b = req.body as any;
    const cur = smtpSettings(ctx);
    if (b.from_email && !isValidEmail(b.from_email)) throw bad('Niepoprawny adres nadawcy.');
    const next = {
      ...defaultSmtp,
      host: str(b.host) ?? '',
      port: toInt(b.port) ?? 587,
      secure: !!b.secure,
      user: str(b.user) ?? '',
      from_email: str(b.from_email) ?? '',
      from_name: str(b.from_name) ?? '',
      ignore_tls_errors: !!b.ignore_tls_errors,
      password_enc: b.clear_password ? '' : b.password ? encryptSecret(ctx, String(b.password)) : cur.password_enc,
    };
    setSetting(ctx, 'smtp', next);
    audit(db, u.id, 'settings', null, 'zmiana konfiguracji SMTP');
    return { ok: true, configured: isSmtpConfigured(ctx) };
  });
  app.post('/api/settings/smtp/test', async (req) => {
    requireRole(req, 'admin');
    const to = str((req.body as any)?.to);
    if (!isValidEmail(to)) throw bad('Podaj poprawny adres odbiorcy wiadomości testowej.');
    if (!isSmtpConfigured(ctx)) throw bad('Serwer SMTP nie jest skonfigurowany (wymagane: serwer, port, adres nadawcy).');
    try {
      const id = await sendMailNow(ctx, { to: to!, subject: 'DIAGNOS CRM: wiadomość testowa', text: 'Konfiguracja SMTP w DIAGNOS CRM działa poprawnie.' });
      return { ok: true, info: `Serwer przyjął wiadomość (${id}).` };
    } catch (e: any) {
      return { ok: false, info: `Wysyłka nie powiodła się: ${e?.message ?? e}` };
    }
  });
  app.get('/api/settings/sms', async (req) => {
    requireRole(req, 'admin');
    const { token_enc, ...s } = smsSettings(ctx);
    return { ...s, has_token: !!token_enc, configured: smsAdapter(ctx).configured };
  });
  app.put('/api/settings/sms', async (req) => {
    const u = requireRole(req, 'admin');
    const b = req.body as any;
    const cur = smsSettings(ctx);
    if (!['none', 'smsapi', 'http'].includes(b.provider)) throw bad('Wybierz rodzaj bramki.');
    const next = {
      ...defaultSms,
      provider: b.provider,
      sender: str(b.sender) ?? '',
      http_url: str(b.http_url) ?? '',
      http_method: b.http_method === 'GET' ? 'GET' : 'POST',
      http_body: String(b.http_body ?? defaultSms.http_body),
      http_content_type: str(b.http_content_type) ?? defaultSms.http_content_type,
      http_success_text: String(b.http_success_text ?? ''),
      smsapi_url: str(b.smsapi_url) ?? defaultSms.smsapi_url,
      token_enc: b.clear_token ? '' : b.token ? encryptSecret(ctx, String(b.token)) : cur.token_enc,
    };
    setSetting(ctx, 'sms', next);
    audit(db, u.id, 'settings', null, 'zmiana konfiguracji bramki SMS');
    return { ok: true, configured: smsAdapter(ctx).configured };
  });
  app.post('/api/settings/sms/test', async (req) => {
    requireRole(req, 'admin');
    const to = str((req.body as any)?.to);
    if (!to) throw bad('Podaj numer telefonu.');
    const a = smsAdapter(ctx);
    if (!a.configured) throw bad('Bramka SMS nie jest skonfigurowana.');
    try {
      const r = await a.send(to, 'DIAGNOS CRM: wiadomość testowa.');
      return { ok: r.ok, info: r.ok ? `Bramka przyjęła wiadomość. ${r.info}` : r.info };
    } catch (e: any) {
      return { ok: false, info: `Błąd połączenia z bramką: ${e?.message ?? e}` };
    }
  });

  // ---------- Kolejka wysyłki ----------
  app.get('/api/outbox', async (req) => {
    const u = requireUser(req);
    const q = req.query as any;
    const where: string[] = [];
    const params: any[] = [];
    if (!isManager(u)) (where.push('o.created_by = ?'), params.push(u.id));
    if (q.status) (where.push('o.status = ?'), params.push(q.status));
    const rows = db.all<any>(
      `SELECT o.id, o.channel, o.recipient, o.subject, o.status, o.attempts, o.last_error, o.created_at, o.sent_at, o.correspondence_id, o.campaign_recipient_id,
              o.reminder_id, o.report_schedule_id, op.name AS created_by_name, k.number AS corr_number
       FROM outbox o LEFT JOIN operators op ON op.id = o.created_by LEFT JOIN correspondence k ON k.id = o.correspondence_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 5000`,
      ...params,
    );
    return rows.map((r) => ({ ...r, status_label: OUTBOX_LABELS[r.status] ?? r.status }));
  });
  app.post('/api/outbox/:id/retry', async (req) => {
    requireUser(req);
    retryOutbox(ctx, Number((req.params as any).id));
    return { ok: true };
  });
  app.post('/api/outbox/:id/cancel', async (req) => {
    requireUser(req);
    cancelOutbox(ctx, Number((req.params as any).id));
    return { ok: true };
  });
  app.post('/api/outbox/process', async (req) => {
    requireUser(req);
    const n = await processOutbox(ctx);
    return { processed: n };
  });

  // ---------- Eksport XLSX (z uniwersalnego rejestru) ----------
  app.post('/api/export/xlsx', async (req, reply) => {
    requireUser(req);
    const b = req.body as { title?: string; columns: { label: string; type?: string }[]; rows: any[][] };
    if (!Array.isArray(b?.columns) || !Array.isArray(b?.rows)) throw bad('Brak danych do eksportu.');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DIAGNOS CRM';
    const ws = wb.addWorksheet((b.title || 'Rejestr').slice(0, 30).replace(/[\\/?*[\]:]/g, ' '));
    ws.addRow(b.columns.map((c) => c.label));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF3' } };
    for (const r of b.rows) ws.addRow(r);
    b.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(60, Math.max(10, c.label.length + 2, ...b.rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 1)));
      if (c.type === 'money') col.numFmt = '#,##0.00 "zł"';
      if (c.type === 'number' || c.type === 'percent') col.numFmt = '#,##0.##';
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', contentDisposition(`${b.title || 'rejestr'}.xlsx`, false));
    return reply.send(buf);
  });

  // ---------- Powiadomienia ----------
  app.get('/api/notifications', async (req) => {
    const u = requireUser(req);
    const now = nowIso();
    const reminders = db.all<any>(
      `SELECT r.id, r.task_id, r.remind_at, t.title, t.start_at, t.end_at, t.priority, c.short_name, c.name AS contractor_name
       FROM reminders r JOIN tasks t ON t.id = r.task_id LEFT JOIN contractors c ON c.id = t.contractor_id
       WHERE r.operator_id = ? AND r.status = 'due' ORDER BY r.remind_at`,
      u.id,
    );
    const messages = db.all<any>(
      `SELECT m.id, m.subject, m.deliver_at, o.name AS sender FROM internal_recipients ir JOIN internal_messages m ON m.id = ir.message_id
       JOIN operators o ON o.id = m.sender_id WHERE ir.recipient_id = ? AND ir.read_at IS NULL AND m.deliver_at <= ? ORDER BY m.deliver_at DESC`,
      u.id,
      now,
    );
    const awaiting = isManager(u) ? db.get<any>("SELECT COUNT(*) AS n FROM outbox WHERE status IN ('awaiting_config', 'failed')")!.n : 0;
    return { reminders, messages, outbox_problems: awaiting, server_time: now };
  });

  app.get('/api/audit', async (req) => {
    const u = requireUser(req);
    if (!isManager(u)) throw forbidden();
    const q = req.query as any;
    return db.all(
      `SELECT a.*, o.name AS operator FROM audit_log a LEFT JOIN operators o ON o.id = a.operator_id
       WHERE (? IS NULL OR a.entity = ?) AND (? IS NULL OR a.entity_id = ?) ORDER BY a.id DESC LIMIT 1000`,
      q.entity ?? null,
      q.entity ?? null,
      toInt(q.id),
      toInt(q.id),
    );
  });
}
