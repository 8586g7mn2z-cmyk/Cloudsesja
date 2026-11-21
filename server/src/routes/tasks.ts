import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { canSeeOperator, isManager, requireRole, requireUser, visibleOperatorIds, type User } from '../auth.js';
import { addMinutesIso, audit, bad, forbidden, minutesBetween, notFound, nowIso, parseLocal, str, todayIso, toInt } from '../util.js';
import {
  ackReminder,
  clearFutureOccurrences,
  createTask,
  generateSeries,
  PRIORITY_LABELS,
  RULE_EVENTS,
  snoozeReminder,
  statusCode,
  statusIdByCode,
  syncReminders,
  updateTask,
  type TaskInput,
} from '../services/tasks.js';
import { attachmentsFor } from './contractors.js';

export function taskList(ctx: Ctx, where: string, params: any[]) {
  const now = nowIso();
  const rows = ctx.db.all<any>(
    `SELECT t.*, s.name AS status_name, s.code AS status_code, s.color AS status_color, o.name AS operator_name, pr.name AS principal_name,
            c.name AS contractor_name, c.short_name AS contractor_short, c.city AS contractor_city,
            TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS contact_name,
            prj.name AS project_name, k.number AS correspondence_number,
            (SELECT COALESCE(SUM(minutes), 0) FROM time_entries e WHERE e.task_id = t.id) AS worked_minutes
     FROM tasks t JOIN dict_items s ON s.id = t.status_id JOIN operators o ON o.id = t.operator_id
     LEFT JOIN operators pr ON pr.id = t.principal_id LEFT JOIN contractors c ON c.id = t.contractor_id
     LEFT JOIN contacts p ON p.id = t.contact_id LEFT JOIN projects prj ON prj.id = t.project_id
     LEFT JOIN correspondence k ON k.id = t.correspondence_id
     ${where} ORDER BY t.start_at`,
    ...params,
  );
  if (!rows.length) return rows;
  const ass = ctx.db.all<any>(
    `SELECT a.task_id, a.operator_id, o.name FROM task_assignees a JOIN operators o ON o.id = a.operator_id WHERE a.task_id IN (${rows.map(() => '?').join(',')})`,
    ...rows.map((r) => r.id),
  );
  const by = new Map<number, any[]>();
  for (const a of ass) (by.get(a.task_id) ?? by.set(a.task_id, []).get(a.task_id)!).push(a);
  return rows.map((t) => {
    const a = by.get(t.id) ?? [];
    const open = t.status_code !== 'done' && t.status_code !== 'cancelled';
    return {
      ...t,
      operator_ids: a.map((x) => x.operator_id),
      operators_text: a.map((x) => x.name).join(', '),
      priority_label: PRIORITY_LABELS[t.priority] ?? '',
      overdue: open && t.end_at < now ? 1 : 0,
      is_open: open ? 1 : 0,
      recurring: t.series_id ? 1 : 0,
      auto: t.rule_id ? 1 : 0,
      planned_minutes: Math.max(0, minutesBetween(t.start_at, t.end_at)),
    };
  });
}

/** Warunek widoczności zadań dla użytkownika. */
function visibility(ctx: Ctx, u: User): { sql: string; params: any[] } {
  const ids = visibleOperatorIds(ctx, u);
  if (ids === null) return { sql: '1=1', params: [] };
  return {
    sql: `(t.principal_id = ? OR t.created_by = ? OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.operator_id IN (${ids.map(() => '?').join(',')})))`,
    params: [u.id, u.id, ...ids],
  };
}

export function canEditTask(ctx: Ctx, u: User, taskId: number): boolean {
  if (u.role === 'admin') return true;
  const t = ctx.db.get<any>('SELECT principal_id, created_by FROM tasks WHERE id = ?', taskId);
  if (!t) return false;
  if (t.principal_id === u.id || t.created_by === u.id) return true;
  const ops = ctx.db.all<any>('SELECT operator_id FROM task_assignees WHERE task_id = ?', taskId).map((r) => r.operator_id);
  return ops.some((o) => canSeeOperator(ctx, u, o));
}

function taskInput(b: any): TaskInput {
  const fix = (s: any) => (typeof s === 'string' && s.length === 16 ? `${s}:00` : s);
  return {
    title: String(b.title ?? ''),
    description: b.description ?? null,
    start_at: fix(b.start_at),
    end_at: fix(b.end_at),
    operator_ids: Array.isArray(b.operator_ids) ? b.operator_ids.map(Number) : b.operator_id ? [Number(b.operator_id)] : [],
    principal_id: toInt(b.principal_id),
    priority: toInt(b.priority) ?? 2,
    status_id: toInt(b.status_id),
    progress: toInt(b.progress) ?? 0,
    contractor_id: toInt(b.contractor_id),
    contact_id: toInt(b.contact_id),
    correspondence_id: toInt(b.correspondence_id),
    project_id: toInt(b.project_id),
    stage_id: toInt(b.stage_id),
    remind_before_min: b.remind_before_min === '' || b.remind_before_min == null ? null : toInt(b.remind_before_min),
    remind_inapp: b.remind_inapp === undefined ? true : !!b.remind_inapp,
    remind_email: !!b.remind_email,
    remind_sms: !!b.remind_sms,
    archived: b.archived === undefined ? undefined : !!b.archived,
  };
}

export async function taskRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/api/tasks', async (req) => {
    const u = requireUser(req);
    const q = req.query as any;
    const w: string[] = [];
    const p: any[] = [];
    // W kartotece kontrahenta/projektu widać wszystkie zadania tego obiektu.
    if (q.contractor_id) (w.push('t.contractor_id = ?'), p.push(+q.contractor_id));
    else if (q.project_id) (w.push('t.project_id = ?'), p.push(+q.project_id));
    else {
      const v = visibility(ctx, u);
      w.push(v.sql);
      p.push(...v.params);
    }
    if (q.from) (w.push('t.end_at >= ?'), p.push(`${q.from}T00:00:00`));
    if (q.to) (w.push('t.start_at <= ?'), p.push(`${q.to}T23:59:59`));
    if (q.operator_id) (w.push('EXISTS (SELECT 1 FROM task_assignees a2 WHERE a2.task_id = t.id AND a2.operator_id = ?)'), p.push(+q.operator_id));
    if (q.mine === '1') (w.push('EXISTS (SELECT 1 FROM task_assignees a3 WHERE a3.task_id = t.id AND a3.operator_id = ?)'), p.push(u.id));
    if (q.archived !== '1') w.push('t.archived = 0');
    if (q.open === '1') w.push("s.code NOT IN ('done', 'cancelled')");
    return taskList(ctx, w.length ? 'WHERE ' + w.join(' AND ') : '', p);
  });

  app.get('/api/tasks/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const t = taskList(ctx, 'WHERE t.id = ?', [id])[0];
    if (!t) throw notFound('Zadanie nie istnieje.');
    const time = db.all('SELECT e.*, o.name AS operator FROM time_entries e JOIN operators o ON o.id = e.operator_id WHERE e.task_id = ? ORDER BY e.work_date', id);
    const reminders = db.all('SELECT r.*, o.name AS operator FROM reminders r JOIN operators o ON o.id = r.operator_id WHERE r.task_id = ? ORDER BY r.remind_at', id);
    return { ...t, time_entries: time, reminders, attachments: attachmentsFor(ctx, u, 'task', id), can_edit: canEditTask(ctx, u, id) };
  });

  app.post('/api/tasks', async (req) => {
    const u = requireUser(req);
    const b = req.body as any;
    const input = taskInput(b);
    if (!input.operator_ids.length) input.operator_ids = [u.id];
    const id = createTask(ctx, { ...input, principal_id: input.principal_id ?? u.id }, u.id);
    audit(db, u.id, 'task', id, 'dodanie');
    return { id };
  });
  app.put('/api/tasks/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    if (!canEditTask(ctx, u, id)) throw forbidden('Nie możesz edytować tego zadania.');
    updateTask(ctx, id, taskInput(req.body));
    audit(db, u.id, 'task', id, 'zmiana');
    return { id };
  });
  /** Przesunięcie zadania w kalendarzu (przeciągnięcie) z zachowaniem czasu trwania. */
  app.patch('/api/tasks/:id/move', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    if (!canEditTask(ctx, u, id)) throw forbidden('Nie możesz przesunąć tego zadania.');
    const t = db.get<any>('SELECT * FROM tasks WHERE id = ?', id)!;
    let start = str((req.body as any)?.start_at);
    if (!start || isNaN(parseLocal(start).getTime())) throw bad('Niepoprawny termin.');
    if (start.length === 16) start += ':00';
    const dur = Math.max(5, minutesBetween(t.start_at, t.end_at));
    const end = (req.body as any)?.end_at ? String((req.body as any).end_at) : addMinutesIso(start, dur);
    db.update('tasks', id, { start_at: start, end_at: end.length === 16 ? `${end}:00` : end, updated_at: nowIso() });
    syncReminders(ctx, id);
    return { ok: true };
  });
  app.patch('/api/tasks/:id/progress', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    if (!canEditTask(ctx, u, id)) throw forbidden();
    const b = req.body as any;
    const t = db.get<any>('SELECT * FROM tasks WHERE id = ?', id)!;
    const progress = Math.max(0, Math.min(100, toInt(b.progress) ?? t.progress));
    let status = toInt(b.status_id) ?? t.status_id;
    const doneId = statusIdByCode(ctx, 'done');
    if (progress === 100) status = doneId;
    else if (status === doneId && b.status_id == null) status = statusIdByCode(ctx, progress > 0 ? 'in_progress' : 'new');
    else if (progress > 0 && statusCode(ctx, status) === 'new') status = statusIdByCode(ctx, 'in_progress');
    const done = status === doneId;
    db.update('tasks', id, { progress: done ? 100 : progress, status_id: status, done_at: done ? t.done_at ?? nowIso() : null, updated_at: nowIso() });
    syncReminders(ctx, id);
    return { ok: true };
  });
  app.delete('/api/tasks/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const t = db.get<any>('SELECT * FROM tasks WHERE id = ?', id);
    if (!t) throw notFound();
    if (!(u.role === 'admin' || t.created_by === u.id || t.principal_id === u.id || (isManager(u) && canEditTask(ctx, u, id)))) throw forbidden('Usunąć zadanie może zlecający, autor lub kierownik.');
    db.tx(() => {
      db.run('UPDATE internal_messages SET task_id = NULL WHERE task_id = ?', id);
      db.run("DELETE FROM attachments WHERE owner_type = 'task' AND owner_id = ?", id);
      db.run('DELETE FROM tasks WHERE id = ?', id);
    });
    audit(db, u.id, 'task', id, 'usunięcie', { title: t.title });
    return { ok: true };
  });

  // ---------- Ewidencja czasu ----------
  app.post('/api/tasks/:id/time', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const t = db.get<any>('SELECT * FROM tasks WHERE id = ?', id);
    if (!t) throw notFound();
    const b = req.body as any;
    const minutes = toInt(b.minutes);
    if (!minutes || minutes <= 0 || minutes > 24 * 60) throw bad('Podaj czas w minutach (1–1440).');
    const date = str(b.work_date) ?? todayIso();
    const opId = toInt(b.operator_id) ?? u.id;
    if (opId !== u.id && !canSeeOperator(ctx, u, opId)) throw forbidden('Nie możesz wpisać czasu za tego operatora.');
    return { id: db.insert('time_entries', { operator_id: opId, work_date: date, minutes, task_id: id, contractor_id: t.contractor_id, project_id: t.project_id, note: str(b.note), created_at: nowIso() }) };
  });
  app.delete('/api/time-entries/:id', async (req) => {
    const u = requireUser(req);
    const e = db.get<any>('SELECT * FROM time_entries WHERE id = ?', Number((req.params as any).id));
    if (!e) throw notFound();
    if (e.operator_id !== u.id && !isManager(u)) throw forbidden();
    db.run('DELETE FROM time_entries WHERE id = ?', e.id);
    return { ok: true };
  });

  // ---------- Zadania cykliczne ----------
  const seriesData = (b: any, u: User) => {
    if (!str(b.title)) throw bad('Podaj tytuł zadania cyklicznego.');
    if (!['daily', 'weekly', 'monthly', 'every_n_days'].includes(b.freq)) throw bad('Wybierz częstotliwość.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.start_date ?? '')) throw bad('Podaj datę rozpoczęcia.');
    if (b.end_date && b.end_date < b.start_date) throw bad('Data końca jest wcześniejsza niż data rozpoczęcia.');
    if (!/^\d{2}:\d{2}$/.test(b.time_from ?? '') || !/^\d{2}:\d{2}$/.test(b.time_to ?? '') || b.time_to <= b.time_from) throw bad('Podaj poprawne godziny (od < do).');
    const ops = (Array.isArray(b.operator_ids) ? b.operator_ids : []).map(Number).filter(Boolean);
    if (!ops.length) ops.push(u.id);
    const weekdays = b.freq === 'weekly' ? (b.weekdays ?? []).map(Number) : null;
    if (b.freq === 'weekly' && !weekdays.length) throw bad('Zaznacz co najmniej jeden dzień tygodnia.');
    const interval = Math.max(1, toInt(b.interval_n) ?? 1);
    return {
      title: str(b.title),
      description: b.description ?? null,
      operator_ids: JSON.stringify(ops),
      principal_id: u.id,
      priority: toInt(b.priority) ?? 2,
      contractor_id: toInt(b.contractor_id),
      project_id: toInt(b.project_id),
      freq: b.freq,
      interval_n: interval,
      weekdays: weekdays ? JSON.stringify(weekdays) : null,
      month_day: b.freq === 'monthly' ? toInt(b.month_day) ?? Number(String(b.start_date).slice(8, 10)) : null,
      start_date: b.start_date,
      end_date: str(b.end_date),
      time_from: b.time_from,
      time_to: b.time_to,
      remind_before_min: b.remind_before_min === '' || b.remind_before_min == null ? null : toInt(b.remind_before_min),
      remind_inapp: b.remind_inapp === false ? 0 : 1,
      remind_email: b.remind_email ? 1 : 0,
      remind_sms: b.remind_sms ? 1 : 0,
      active: b.active === false ? 0 : 1,
    };
  };
  app.get('/api/task-series', async (req) => {
    const u = requireUser(req);
    const all = db.all<any>(
      `SELECT s.*, c.name AS contractor_name, o.name AS author,
        (SELECT COUNT(*) FROM tasks t WHERE t.series_id = s.id) AS occurrences,
        (SELECT MIN(start_at) FROM tasks t JOIN dict_items d ON d.id = t.status_id WHERE t.series_id = s.id AND d.code NOT IN ('done','cancelled') AND t.start_at >= ?) AS next_at
       FROM task_series s LEFT JOIN contractors c ON c.id = s.contractor_id LEFT JOIN operators o ON o.id = s.created_by ORDER BY s.title`,
      nowIso(),
    );
    const names = new Map(db.all<any>('SELECT id, name FROM operators').map((o) => [o.id, o.name]));
    const vis = visibleOperatorIds(ctx, u);
    return all
      .map((s) => ({ ...s, operator_ids: JSON.parse(s.operator_ids), weekdays: s.weekdays ? JSON.parse(s.weekdays) : [] }))
      .filter((s) => vis === null || s.created_by === u.id || s.operator_ids.some((o: number) => vis.includes(o)))
      .map((s) => ({ ...s, operators_text: s.operator_ids.map((o: number) => names.get(o)).join(', ') }));
  });
  app.post('/api/task-series', async (req) => {
    const u = requireUser(req);
    const d = seriesData(req.body, u);
    const id = db.tx(() => {
      const id = db.insert('task_series', { ...d, created_by: u.id, created_at: nowIso() });
      generateSeries(ctx, id);
      return id;
    });
    return { id, generated: db.get<any>('SELECT COUNT(*) AS n FROM tasks WHERE series_id = ?', id).n };
  });
  app.put('/api/task-series/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const s = db.get<any>('SELECT * FROM task_series WHERE id = ?', id);
    if (!s) throw notFound();
    if (s.created_by !== u.id && !isManager(u)) throw forbidden();
    const d = seriesData(req.body, u);
    db.tx(() => {
      db.update('task_series', id, { ...d, principal_id: s.principal_id });
      clearFutureOccurrences(ctx, id);
      generateSeries(ctx, id);
    });
    return { id };
  });
  app.delete('/api/task-series/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const s = db.get<any>('SELECT * FROM task_series WHERE id = ?', id);
    if (!s) throw notFound();
    if (s.created_by !== u.id && !isManager(u)) throw forbidden();
    db.tx(() => {
      clearFutureOccurrences(ctx, id);
      db.run('UPDATE tasks SET series_id = NULL WHERE series_id = ?', id);
      db.run('DELETE FROM task_series WHERE id = ?', id);
    });
    return { ok: true };
  });

  // ---------- Reguły automatyczne ----------
  app.get('/api/auto-rules', async (req) => {
    requireUser(req);
    return {
      events: RULE_EVENTS,
      rules: db.all('SELECT r.*, o.name AS operator_name, (SELECT COUNT(*) FROM tasks t WHERE t.rule_id = r.id) AS created_tasks FROM auto_rules r LEFT JOIN operators o ON o.id = r.operator_id ORDER BY r.name'),
    };
  });
  const ruleData = (b: any) => {
    if (!str(b.name)) throw bad('Podaj nazwę reguły.');
    if (!RULE_EVENTS[b.event]) throw bad('Wybierz zdarzenie.');
    if (!str(b.title_tpl)) throw bad('Podaj tytuł zadania.');
    if (!['owner', 'creator', 'operator'].includes(b.assign_to)) throw bad('Wskaż, komu przypisać zadanie.');
    if (b.assign_to === 'operator' && !toInt(b.operator_id)) throw bad('Wybierz operatora.');
    if (!/^\d{2}:\d{2}$/.test(b.time_of_day ?? '')) throw bad('Podaj godzinę zadania.');
    const delay = toInt(b.delay_days);
    if (delay == null || delay < 0 || delay > 365) throw bad('Opóźnienie: od 0 do 365 dni.');
    return {
      name: str(b.name),
      event: b.event,
      active: b.active === false ? 0 : 1,
      delay_days: delay,
      time_of_day: b.time_of_day,
      duration_min: Math.max(5, toInt(b.duration_min) ?? 30),
      title_tpl: str(b.title_tpl),
      description_tpl: str(b.description_tpl),
      assign_to: b.assign_to,
      operator_id: b.assign_to === 'operator' ? toInt(b.operator_id) : null,
      priority: toInt(b.priority) ?? 2,
      remind_before_min: b.remind_before_min === '' || b.remind_before_min == null ? null : toInt(b.remind_before_min),
    };
  };
  app.post('/api/auto-rules', async (req) => {
    requireRole(req, 'admin');
    return { id: db.insert('auto_rules', { ...ruleData(req.body), created_at: nowIso() }) };
  });
  app.put('/api/auto-rules/:id', async (req) => {
    requireRole(req, 'admin');
    db.update('auto_rules', Number((req.params as any).id), ruleData(req.body));
    return { ok: true };
  });
  app.delete('/api/auto-rules/:id', async (req) => {
    requireRole(req, 'admin');
    db.run('DELETE FROM auto_rules WHERE id = ?', Number((req.params as any).id));
    return { ok: true };
  });

  // ---------- Przypomnienia ----------
  const ownReminder = (u: User, id: number) => {
    const r = db.get<any>('SELECT * FROM reminders WHERE id = ?', id);
    if (!r) throw notFound();
    if (r.operator_id !== u.id) throw forbidden();
    return r;
  };
  app.post('/api/reminders/:id/ack', async (req) => {
    const u = requireUser(req);
    ownReminder(u, Number((req.params as any).id));
    ackReminder(ctx, Number((req.params as any).id));
    return { ok: true };
  });
  app.post('/api/reminders/:id/snooze', async (req) => {
    const u = requireUser(req);
    ownReminder(u, Number((req.params as any).id));
    const m = toInt((req.body as any)?.minutes) ?? 10;
    if (m < 1 || m > 24 * 60) throw bad('Odłożenie: od 1 minuty do 24 godzin.');
    snoozeReminder(ctx, Number((req.params as any).id), m);
    return { ok: true };
  });

  // ---------- Szybkie notatki ----------
  app.get('/api/quick-notes', async (req) => {
    const u = requireUser(req);
    return db.all('SELECT * FROM quick_notes WHERE operator_id = ? ORDER BY done, created_at DESC', u.id);
  });
  app.post('/api/quick-notes', async (req) => {
    const u = requireUser(req);
    const body = str((req.body as any)?.body);
    if (!body) throw bad('Wpisz treść notatki.');
    return { id: db.insert('quick_notes', { operator_id: u.id, body, created_at: nowIso() }) };
  });
  app.put('/api/quick-notes/:id', async (req) => {
    const u = requireUser(req);
    const b = req.body as any;
    db.run('UPDATE quick_notes SET done = ?, body = COALESCE(?, body) WHERE id = ? AND operator_id = ?', b.done ? 1 : 0, str(b.body), Number((req.params as any).id), u.id);
    return { ok: true };
  });
  app.delete('/api/quick-notes/:id', async (req) => {
    const u = requireUser(req);
    db.run('DELETE FROM quick_notes WHERE id = ? AND operator_id = ?', Number((req.params as any).id), u.id);
    return { ok: true };
  });
}
