import type { Ctx } from '../context.js';
import {
  addDaysDate,
  addMinutesIso,
  bad,
  isoWeekday,
  lastDayOfMonth,
  minutesBetween,
  nowIso,
  parseLocal,
  renderTemplate,
  todayIso,
  toLocalDate,
  fmtDatePl,
} from '../util.js';
import { queueMessage } from './messaging.js';

export const PRIORITY_LABELS: Record<number, string> = { 1: 'niski', 2: 'normalny', 3: 'wysoki', 4: 'pilny' };

export function statusIdByCode(ctx: Ctx, code: string): number {
  const r = ctx.db.get<{ id: number }>("SELECT id FROM dict_items WHERE dict = 'task_status' AND code = ?", code);
  if (!r) throw new Error(`Brak statusu zadania ${code}`);
  return r.id;
}
export function statusCode(ctx: Ctx, id: number): string | null {
  return ctx.db.get<{ code: string | null }>('SELECT code FROM dict_items WHERE id = ?', id)?.code ?? null;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  operator_ids: number[];
  principal_id?: number | null;
  priority?: number;
  status_id?: number | null;
  progress?: number;
  contractor_id?: number | null;
  contact_id?: number | null;
  correspondence_id?: number | null;
  project_id?: number | null;
  stage_id?: number | null;
  remind_before_min?: number | null;
  remind_inapp?: boolean | number;
  remind_email?: boolean | number;
  remind_sms?: boolean | number;
  series_id?: number | null;
  occurrence_date?: string | null;
  rule_id?: number | null;
  archived?: boolean | number;
}

function normalize(ctx: Ctx, t: TaskInput) {
  if (!t.title?.trim()) throw bad('Podaj tytuł zadania.');
  if (!t.start_at || !t.end_at || isNaN(parseLocal(t.start_at).getTime())) throw bad('Podaj poprawny termin zadania.');
  if (t.end_at < t.start_at) throw bad('Termin zakończenia nie może być wcześniejszy niż rozpoczęcia.');
  const ops = [...new Set((t.operator_ids ?? []).filter(Boolean).map(Number))];
  if (!ops.length) throw bad('Wskaż operatora wykonującego zadanie.');
  let progress = Math.max(0, Math.min(100, Math.round(Number(t.progress ?? 0))));
  let statusId = t.status_id ? Number(t.status_id) : statusIdByCode(ctx, progress > 0 ? 'in_progress' : 'new');
  const code = statusCode(ctx, statusId);
  if (code === 'done') progress = 100;
  else if (progress === 100) statusId = statusIdByCode(ctx, 'done');
  return { ops, progress, statusId, done: statusCode(ctx, statusId) === 'done' };
}

export function createTask(ctx: Ctx, t: TaskInput, createdBy: number | null): number {
  return ctx.db.tx(() => {
    const n = normalize(ctx, t);
    const now = nowIso();
    const id = ctx.db.insert('tasks', {
      title: t.title.trim(),
      description: t.description ?? null,
      start_at: t.start_at,
      end_at: t.end_at,
      operator_id: n.ops[0],
      principal_id: t.principal_id ?? createdBy,
      priority: t.priority ?? 2,
      status_id: n.statusId,
      progress: n.progress,
      contractor_id: t.contractor_id ?? null,
      contact_id: t.contact_id ?? null,
      correspondence_id: t.correspondence_id ?? null,
      project_id: t.project_id ?? null,
      stage_id: t.stage_id ?? null,
      is_group: n.ops.length > 1 ? 1 : 0,
      remind_before_min: t.remind_before_min ?? null,
      remind_inapp: t.remind_inapp === undefined ? 1 : t.remind_inapp ? 1 : 0,
      remind_email: t.remind_email ? 1 : 0,
      remind_sms: t.remind_sms ? 1 : 0,
      series_id: t.series_id ?? null,
      occurrence_date: t.occurrence_date ?? null,
      rule_id: t.rule_id ?? null,
      archived: t.archived ? 1 : 0,
      done_at: n.done ? now : null,
      created_by: createdBy,
      created_at: now,
    });
    for (const op of n.ops) ctx.db.run('INSERT INTO task_assignees (task_id, operator_id) VALUES (?, ?)', id, op);
    syncReminders(ctx, id);
    return id;
  });
}

export function updateTask(ctx: Ctx, id: number, t: TaskInput) {
  ctx.db.tx(() => {
    const prev = ctx.db.get<any>('SELECT * FROM tasks WHERE id = ?', id);
    if (!prev) throw bad('Zadanie nie istnieje.');
    const n = normalize(ctx, t);
    ctx.db.update('tasks', id, {
      title: t.title.trim(),
      description: t.description ?? null,
      start_at: t.start_at,
      end_at: t.end_at,
      operator_id: n.ops[0],
      principal_id: t.principal_id ?? prev.principal_id,
      priority: t.priority ?? prev.priority,
      status_id: n.statusId,
      progress: n.progress,
      contractor_id: t.contractor_id ?? null,
      contact_id: t.contact_id ?? null,
      correspondence_id: t.correspondence_id ?? null,
      project_id: t.project_id ?? null,
      stage_id: t.stage_id ?? null,
      is_group: n.ops.length > 1 ? 1 : 0,
      remind_before_min: t.remind_before_min ?? null,
      remind_inapp: t.remind_inapp === undefined ? prev.remind_inapp : t.remind_inapp ? 1 : 0,
      remind_email: t.remind_email ? 1 : 0,
      remind_sms: t.remind_sms ? 1 : 0,
      archived: t.archived === undefined ? prev.archived : t.archived ? 1 : 0,
      done_at: n.done ? prev.done_at ?? nowIso() : null,
      updated_at: nowIso(),
    });
    ctx.db.run('DELETE FROM task_assignees WHERE task_id = ?', id);
    for (const op of n.ops) ctx.db.run('INSERT INTO task_assignees (task_id, operator_id) VALUES (?, ?)', id, op);
    syncReminders(ctx, id);
  });
}

/**
 * Uzgadnia przypomnienia zadania z jego bieżącym stanem. Przypomnienie jest identyfikowane przez wykonawcę
 * i pierwotny termin (base_at = start − wyprzedzenie). Dopóki ten termin się nie zmienia, istniejące przypomnienie
 * zostaje nietknięte: nie wraca po potwierdzeniu, nie traci odłożenia i nie wysyła e-maila/SMS-a drugi raz.
 */
export function syncReminders(ctx: Ctx, taskId: number) {
  const t = ctx.db.get<any>('SELECT * FROM tasks WHERE id = ?', taskId);
  if (!t) return;
  const code = statusCode(ctx, t.status_id);
  const closed = code === 'done' || code === 'cancelled' || !!t.archived;
  const base = t.remind_before_min == null || closed ? null : addMinutesIso(t.start_at, -Number(t.remind_before_min));
  const ops = new Set(ctx.db.all<{ operator_id: number }>('SELECT operator_id FROM task_assignees WHERE task_id = ?', taskId).map((r) => r.operator_id));
  const rows = ctx.db.all<any>('SELECT * FROM reminders WHERE task_id = ?', taskId);
  for (const r of rows) {
    if (r.status === 'acked') continue;
    const same = base !== null && ops.has(r.operator_id) && (r.base_at ?? r.remind_at) === base;
    if (same) {
      if (r.inapp !== t.remind_inapp || r.email !== t.remind_email || r.sms !== t.remind_sms) ctx.db.update('reminders', r.id, { inapp: t.remind_inapp, email: t.remind_email, sms: t.remind_sms });
      continue;
    }
    // Zadanie zamknięte: wyświetlone już przypomnienie uznajemy za potwierdzone (nie wróci po ponownym otwarciu).
    if (closed && r.status === 'due' && ops.has(r.operator_id)) ctx.db.update('reminders', r.id, { status: 'acked', acked_at: nowIso() });
    else ctx.db.run('DELETE FROM reminders WHERE id = ?', r.id);
  }
  if (base === null || t.start_at < nowIso()) return; // brak przypomnienia albo zadanie już się rozpoczęło
  for (const operator_id of ops) {
    if (rows.some((r) => r.operator_id === operator_id && (r.base_at ?? r.remind_at) === base)) continue;
    ctx.db.insert('reminders', { task_id: taskId, operator_id, remind_at: base, base_at: base, status: 'pending', inapp: t.remind_inapp, email: t.remind_email, sms: t.remind_sms });
  }
}

/** Przypomnienia, których czas nadszedł: oznacza jako wymagające potwierdzenia i wysyła e-mail/SMS. */
export function processReminders(ctx: Ctx): number {
  const now = nowIso();
  const due = ctx.db.all<any>(
    `SELECT r.*, t.title, t.start_at, t.end_at, o.email AS op_email, o.phone AS op_phone, c.short_name, c.name AS cname
     FROM reminders r JOIN tasks t ON t.id = r.task_id JOIN operators o ON o.id = r.operator_id
     LEFT JOIN contractors c ON c.id = t.contractor_id
     WHERE r.status = 'pending' AND r.remind_at <= ?`,
    now,
  );
  for (const r of due) {
    ctx.db.tx(() => {
      if (!r.external_sent) {
        const when = `${fmtDatePl(r.start_at)} ${r.start_at.slice(11, 16)}`;
        const who = r.short_name || r.cname ? ` (${r.short_name || r.cname})` : '';
        const text = `Przypomnienie DIAGNOS CRM: ${r.title}${who}, termin ${when}.`;
        if (r.email && r.op_email)
          queueMessage(ctx, { channel: 'email', recipient: r.op_email, subject: `Przypomnienie: ${r.title}`, body_text: text, reminder_id: r.id });
        if (r.sms && r.op_phone) queueMessage(ctx, { channel: 'sms', recipient: r.op_phone, body_text: text, reminder_id: r.id });
      }
      ctx.db.update('reminders', r.id, { status: r.inapp ? 'due' : 'acked', external_sent: 1, acked_at: r.inapp ? null : now });
    });
  }
  return due.length;
}

export function snoozeReminder(ctx: Ctx, id: number, minutes: number) {
  ctx.db.update('reminders', id, { status: 'pending', remind_at: addMinutesIso(nowIso(), minutes) });
}
export function ackReminder(ctx: Ctx, id: number) {
  ctx.db.update('reminders', id, { status: 'acked', acked_at: nowIso() });
}

// ---------- Zadania cykliczne ----------
export interface SeriesDef {
  freq: 'daily' | 'weekly' | 'monthly' | 'every_n_days';
  interval_n: number;
  weekdays?: number[] | null;
  month_day?: number | null;
  start_date: string;
  end_date?: string | null;
}

/** Daty wystąpień serii w przedziale [from, to] (włącznie). */
export function occurrences(s: SeriesDef, from: string, to: string): string[] {
  const out: string[] = [];
  const interval = Math.max(1, Number(s.interval_n) || 1);
  const end = s.end_date && s.end_date < to ? s.end_date : to;
  const begin = s.start_date > from ? s.start_date : from;
  if (begin > end) return out;
  if (s.freq === 'daily' || s.freq === 'every_n_days') {
    const step = s.freq === 'daily' ? interval : interval;
    const offset = Math.round((parseLocal(begin).getTime() - parseLocal(s.start_date).getTime()) / 86400000);
    let k = Math.ceil(offset / step);
    for (let d = addDaysDate(s.start_date, k * step); d <= end; k++, d = addDaysDate(s.start_date, k * step)) if (d >= begin) out.push(d);
    return out;
  }
  if (s.freq === 'weekly') {
    const days = (s.weekdays?.length ? s.weekdays : [isoWeekday(s.start_date)]).map(Number);
    const weekStart0 = addDaysDate(s.start_date, -(isoWeekday(s.start_date) - 1));
    for (let d = begin; d <= end; d = addDaysDate(d, 1)) {
      const wd = isoWeekday(d);
      if (!days.includes(wd)) continue;
      const weekStart = addDaysDate(d, -(wd - 1));
      const weeks = Math.round((parseLocal(weekStart).getTime() - parseLocal(weekStart0).getTime()) / (7 * 86400000));
      if (weeks % interval === 0) out.push(d);
    }
    return out;
  }
  if (s.freq === 'monthly') {
    const sd = parseLocal(s.start_date);
    const md = s.month_day || sd.getDate();
    for (let i = 0; ; i += interval) {
      const y = sd.getFullYear() + Math.floor((sd.getMonth() + i) / 12);
      const m = ((sd.getMonth() + i) % 12) + 1;
      const day = Math.min(md, lastDayOfMonth(y, m));
      const d = toLocalDate(new Date(y, m - 1, day));
      if (d > end) break;
      if (d >= begin) out.push(d);
      if (i > 1200) break;
    }
    return out;
  }
  return out;
}

export const SERIES_HORIZON_DAYS = 60;

/** Tworzy brakujące wystąpienia serii od dziś do horyzontu. Zwraca liczbę utworzonych zadań. */
export function generateSeries(ctx: Ctx, seriesId: number, horizonDays = SERIES_HORIZON_DAYS): number {
  const s = ctx.db.get<any>('SELECT * FROM task_series WHERE id = ?', seriesId);
  if (!s || !s.active) return 0;
  const from = todayIso();
  const to = addDaysDate(from, horizonDays);
  const def: SeriesDef = { ...s, weekdays: s.weekdays ? JSON.parse(s.weekdays) : null };
  const ops: number[] = JSON.parse(s.operator_ids);
  let n = 0;
  for (const d of occurrences(def, from, to)) {
    if (ctx.db.get('SELECT id FROM tasks WHERE series_id = ? AND occurrence_date = ?', seriesId, d)) continue;
    createTask(
      ctx,
      {
        title: s.title,
        description: s.description,
        start_at: `${d}T${s.time_from}:00`,
        end_at: `${d}T${s.time_to}:00`,
        operator_ids: ops,
        principal_id: s.principal_id,
        priority: s.priority,
        contractor_id: s.contractor_id,
        project_id: s.project_id,
        remind_before_min: s.remind_before_min,
        remind_inapp: s.remind_inapp,
        remind_email: s.remind_email,
        remind_sms: s.remind_sms,
        series_id: seriesId,
        occurrence_date: d,
      },
      s.created_by,
    );
    n++;
  }
  ctx.db.update('task_series', seriesId, { generated_until: to });
  return n;
}

/** Usuwa przyszłe, nierozpoczęte wystąpienia serii (np. po zmianie definicji). */
export function clearFutureOccurrences(ctx: Ctx, seriesId: number) {
  const newId = statusIdByCode(ctx, 'new');
  const ids = ctx.db
    .all<{ id: number }>(
      `SELECT t.id FROM tasks t WHERE t.series_id = ? AND t.occurrence_date >= ? AND t.status_id = ? AND t.progress = 0
         AND NOT EXISTS (SELECT 1 FROM time_entries e WHERE e.task_id = t.id)
         AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.owner_type = 'task' AND a.owner_id = t.id)
         AND NOT EXISTS (SELECT 1 FROM internal_messages m WHERE m.task_id = t.id)`,
      seriesId,
      todayIso(),
      newId,
    )
    .map((r) => r.id);
  for (const id of ids) ctx.db.run('DELETE FROM tasks WHERE id = ?', id);
  // Wystąpienia z zaewidencjonowanym czasem, załącznikami lub wiadomościami zostają bez zmian.
}

export function generateAllSeries(ctx: Ctx): number {
  const all = ctx.db.all<{ id: number }>('SELECT id FROM task_series WHERE active = 1 AND (end_date IS NULL OR end_date >= ?)', todayIso());
  let n = 0;
  for (const s of all) {
    try {
      n += generateSeries(ctx, s.id);
    } catch (e) {
      console.error(`Błąd generowania serii zadań #${s.id}`, e);
    }
  }
  return n;
}

// ---------- Reguły automatyczne ----------
export const RULE_EVENTS: Record<string, string> = {
  'contractor.created': 'Dodanie nowego kontrahenta',
  'order.created': 'Dodanie zamówienia',
  'project.created': 'Założenie projektu',
  'correspondence.incoming': 'Zarejestrowanie korespondencji przychodzącej',
};

export interface RuleEventPayload {
  contractor_id?: number | null;
  project_id?: number | null;
  order_id?: number | null;
  correspondence_id?: number | null;
  number?: string | null;
  actor_id: number | null;
}

/** Uruchamia reguły dla zdarzenia; zwraca identyfikatory utworzonych zadań. */
export function fireEvent(ctx: Ctx, event: string, p: RuleEventPayload): number[] {
  const rules = ctx.db.all<any>('SELECT * FROM auto_rules WHERE event = ? AND active = 1', event);
  const created: number[] = [];
  if (!rules.length) return created;
  const c = p.contractor_id ? ctx.db.get<any>('SELECT id, name, short_name, owner_id FROM contractors WHERE id = ?', p.contractor_id) : null;
  const pr = p.project_id ? ctx.db.get<any>('SELECT id, name, manager_id FROM projects WHERE id = ?', p.project_id) : null;
  for (const r of rules) {
    let op: number | null = null;
    if (r.assign_to === 'owner') op = (pr?.manager_id ?? c?.owner_id ?? p.actor_id) || null;
    else if (r.assign_to === 'creator') op = p.actor_id;
    else op = r.operator_id;
    if (!op) continue;
    const day = addDaysDate(todayIso(), Number(r.delay_days) || 0);
    const start = `${day}T${r.time_of_day}:00`;
    const data = {
      kontrahent: c ? c.short_name || c.name : '',
      kontrahent_pelna: c?.name ?? '',
      projekt: pr?.name ?? '',
      numer: p.number ?? '',
      data: fmtDatePl(todayIso()),
    };
    created.push(
      createTask(
        ctx,
        {
          title: renderTemplate(r.title_tpl, data).trim() || r.name,
          description: r.description_tpl ? renderTemplate(r.description_tpl, data) : null,
          start_at: start,
          end_at: addMinutesIso(start, Number(r.duration_min) || 30),
          operator_ids: [op],
          principal_id: p.actor_id,
          priority: r.priority,
          contractor_id: c?.id ?? null,
          project_id: pr?.id ?? null,
          correspondence_id: p.correspondence_id ?? null,
          remind_before_min: r.remind_before_min,
          rule_id: r.id,
        },
        p.actor_id,
      ),
    );
  }
  return created;
}

/** Doręcza wiadomości wewnętrzne, których termin nadszedł. */
export function deliverInternal(ctx: Ctx): number {
  const now = nowIso();
  const r = ctx.db.run(
    'UPDATE internal_recipients SET delivered_at = ? WHERE delivered_at IS NULL AND message_id IN (SELECT id FROM internal_messages WHERE deliver_at <= ?)',
    now,
    now,
  );
  return r.changes;
}

export function taskMinutes(start: string, end: string) {
  return Math.max(0, minutesBetween(start, end));
}
