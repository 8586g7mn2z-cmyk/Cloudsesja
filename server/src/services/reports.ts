import type { Ctx } from '../context.js';
import type { User } from '../auth.js';
import { visibleOperatorIds } from '../auth.js';
import { addDaysDate, bad, fmtDatePl, lastDayOfMonth, nowIso, parseLocal, round2, todayIso, toLocalDate, isoWeekday } from '../util.js';
import type { ReportResult } from './pdf.js';
import { statusIdByCode } from './tasks.js';

export const REPORTS: Record<string, string> = {
  inactivity: 'Brak aktywności',
  sales: 'Skuteczność handlowców',
  tasks: 'Statystyka zadań',
  activity: 'Aktywność operatora',
  time: 'Czas pracy',
};

export interface ReportParams {
  from?: string;
  to?: string;
  operator_id?: number | null;
  days?: number;
  status_id?: number | null;
  group_id?: number | null;
  owner_id?: number | null;
  only_key?: boolean;
  group_by?: 'operator' | 'contractor' | 'project';
}

function inList(ids: number[] | null, col: string): { sql: string; params: number[] } {
  if (ids === null) return { sql: '1=1', params: [] };
  if (!ids.length) return { sql: '1=0', params: [] };
  return { sql: `${col} IN (${ids.map(() => '?').join(',')})`, params: ids };
}

/** Operatorzy objęci raportem z uwzględnieniem uprawnień użytkownika. */
function scopeOperators(ctx: Ctx, u: User, operatorId?: number | null): number[] | null {
  const visible = visibleOperatorIds(ctx, u);
  if (operatorId) {
    if (visible !== null && !visible.includes(Number(operatorId))) throw bad('Brak uprawnień do danych tego operatora.');
    return [Number(operatorId)];
  }
  return visible;
}

function period(p: ReportParams) {
  const from = p.from || `${todayIso().slice(0, 8)}01`;
  const to = p.to || todayIso();
  if (from > to) throw bad('Data początkowa okresu jest późniejsza niż końcowa.');
  return { from, to, fromTs: `${from}T00:00:00`, toTs: `${to}T23:59:59`, label: `okres: od ${fmtDatePl(from)} do ${fmtDatePl(to)}` };
}

export function runReport(ctx: Ctx, u: User, type: string, p: ReportParams): ReportResult {
  switch (type) {
    case 'inactivity':
      return inactivity(ctx, u, p);
    case 'sales':
      return sales(ctx, u, p);
    case 'tasks':
      return taskStats(ctx, u, p);
    case 'activity':
      return activity(ctx, u, p);
    case 'time':
      return timeReport(ctx, u, p);
    default:
      throw bad('Nieznany raport.');
  }
}

function inactivity(ctx: Ctx, u: User, p: ReportParams): ReportResult {
  const days = Math.max(1, Number(p.days ?? 30));
  const limit = `${addDaysDate(todayIso(), -days)}T00:00:00`;
  const where: string[] = ['c.active = 1'];
  const params: any[] = [];
  if (p.status_id) (where.push('c.status_id = ?'), params.push(p.status_id));
  if (p.group_id) (where.push('(c.group_id = ? OR EXISTS (SELECT 1 FROM contractor_group_members m WHERE m.contractor_id = c.id AND m.group_id = ?))'), params.push(p.group_id, p.group_id));
  if (p.owner_id) (where.push('c.owner_id = ?'), params.push(p.owner_id));
  if (p.only_key) where.push('c.is_key = 1');
  const rows = ctx.db.all<any>(
    `SELECT c.id, c.name, c.short_name, c.city, c.phone, s.name AS status, g.name AS grp, o.name AS owner, c.is_key,
            (SELECT MAX(event_at) FROM correspondence k WHERE k.contractor_id = c.id) AS last_contact
     FROM contractors c
     LEFT JOIN dict_items s ON s.id = c.status_id LEFT JOIN dict_items g ON g.id = c.group_id LEFT JOIN operators o ON o.id = c.owner_id
     WHERE ${where.join(' AND ')}`,
    ...params,
  );
  const today = parseLocal(todayIso()).getTime();
  const out = rows
    .filter((r) => !r.last_contact || r.last_contact < limit)
    .map((r) => ({
      ...r,
      kluczowy: r.is_key ? 'tak' : '',
      dni: r.last_contact ? Math.floor((today - parseLocal(r.last_contact.slice(0, 10)).getTime()) / 86400000) : null,
      ostatni: r.last_contact ? r.last_contact.slice(0, 10) : 'nigdy',
    }))
    .sort((a, b) => (b.dni ?? 1e9) - (a.dni ?? 1e9));
  const byOwner = new Map<string, number>();
  out.forEach((r) => byOwner.set(r.owner ?? '(brak)', (byOwner.get(r.owner ?? '(brak)') ?? 0) + 1));
  return {
    title: `Raport braku aktywności: brak kontaktu od ${days} dni`,
    subtitle: `stan na ${fmtDatePl(todayIso())}${p.only_key ? ', tylko kontrahenci kluczowi' : ''}; liczba kontrahentów: ${out.length}`,
    columns: [
      { key: 'name', label: 'Kontrahent', width: 3 },
      { key: 'city', label: 'Miasto' },
      { key: 'status', label: 'Status' },
      { key: 'grp', label: 'Grupa' },
      { key: 'owner', label: 'Prowadzący' },
      { key: 'kluczowy', label: 'Kluczowy', width: 0.8 },
      { key: 'ostatni', label: 'Ostatni kontakt', type: 'text', width: 1.2 },
      { key: 'dni', label: 'Dni bez kontaktu', type: 'int', width: 1 },
    ],
    rows: out.map((r) => ({ ...r, ostatni: r.ostatni === 'nigdy' ? 'nigdy' : fmtDatePl(r.ostatni) })),
    totals: null,
    chart: { labels: [...byOwner.keys()], series: [{ name: 'Kontrahenci bez kontaktu', values: [...byOwner.values()] }] },
  };
}

function sales(ctx: Ctx, u: User, p: ReportParams): ReportResult {
  const per = period(p);
  const ops = scopeOperators(ctx, u, p.operator_id);
  const f = inList(ops, 's.operator_id');
  const rows = ctx.db.all<any>(
    `SELECT o.id, COALESCE(o.name, '(bez handlowca)') AS operator, COUNT(s.id) AS cnt, COUNT(DISTINCT s.contractor_id) AS clients,
            SUM(s.net_total) AS net, SUM(s.gross_total) AS gross
     FROM sales s LEFT JOIN operators o ON o.id = s.operator_id
     WHERE s.doc_date >= ? AND s.doc_date <= ? AND ${f.sql}
     GROUP BY o.id, o.name ORDER BY net DESC`,
    per.from,
    per.to,
    ...f.params,
  );
  const totalNet = rows.reduce((s, r) => s + (r.net ?? 0), 0);
  const out = rows.map((r) => ({
    operator: r.operator,
    cnt: r.cnt,
    clients: r.clients,
    net: round2(r.net ?? 0),
    gross: round2(r.gross ?? 0),
    avg: r.cnt ? round2((r.net ?? 0) / r.cnt) : 0,
    share: totalNet ? round2(((r.net ?? 0) / totalNet) * 100) : 0,
  }));
  const allClients = ctx.db.get<any>(
    `SELECT COUNT(DISTINCT s.contractor_id) AS n FROM sales s WHERE s.doc_date >= ? AND s.doc_date <= ? AND ${f.sql}`,
    per.from,
    per.to,
    ...f.params,
  )!.n;
  return {
    title: 'Skuteczność handlowców',
    subtitle: per.label,
    columns: [
      { key: 'operator', label: 'Handlowiec', width: 2.5 },
      { key: 'cnt', label: 'Liczba transakcji', type: 'int' },
      { key: 'clients', label: 'Liczba klientów', type: 'int' },
      { key: 'net', label: 'Sprzedaż netto', type: 'money', width: 1.4 },
      { key: 'gross', label: 'Sprzedaż brutto', type: 'money', width: 1.4 },
      { key: 'avg', label: 'Średnia transakcja', type: 'money', width: 1.4 },
      { key: 'share', label: 'Udział', type: 'percent' },
    ],
    rows: out,
    totals: {
      operator: 'Razem',
      cnt: out.reduce((s, r) => s + r.cnt, 0),
      clients: allClients,
      net: round2(totalNet),
      gross: round2(out.reduce((s, r) => s + r.gross, 0)),
      avg: out.reduce((s, r) => s + r.cnt, 0) ? round2(totalNet / out.reduce((s, r) => s + r.cnt, 0)) : 0,
      share: totalNet ? 100 : 0,
    },
    chart: { labels: out.map((r) => r.operator), series: [{ name: 'Sprzedaż netto (zł)', values: out.map((r) => r.net) }], unit: 'zł' },
  };
}

function taskStats(ctx: Ctx, u: User, p: ReportParams): ReportResult {
  const per = period(p);
  const ops = scopeOperators(ctx, u, p.operator_id);
  const f = inList(ops, 'a.operator_id');
  const done = statusIdByCode(ctx, 'done');
  const cancelled = statusIdByCode(ctx, 'cancelled');
  const now = nowIso();
  const rows = ctx.db.all<any>(
    `SELECT o.name AS operator, o.id AS oid,
       COUNT(*) AS total,
       SUM(CASE WHEN t.status_id = ? THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN t.status_id = ? AND t.done_at <= t.end_at THEN 1 ELSE 0 END) AS on_time,
       SUM(CASE WHEN t.status_id NOT IN (?, ?) AND t.end_at < ? THEN 1 ELSE 0 END) AS overdue,
       SUM(CASE WHEN t.status_id NOT IN (?, ?) AND t.end_at >= ? THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN t.status_id = ? THEN 1 ELSE 0 END) AS cancelled,
       AVG(t.progress) AS avg_progress
     FROM tasks t JOIN task_assignees a ON a.task_id = t.id JOIN operators o ON o.id = a.operator_id
     WHERE t.start_at >= ? AND t.start_at <= ? AND ${f.sql}
     GROUP BY o.id, o.name ORDER BY o.name`,
    done,
    done,
    done,
    cancelled,
    now,
    done,
    cancelled,
    now,
    cancelled,
    per.fromTs,
    per.toTs,
    ...f.params,
  );
  const out = rows.map((r) => ({
    operator: r.operator,
    total: r.total,
    done: r.done,
    on_time: r.on_time,
    open: r.open,
    overdue: r.overdue,
    cancelled: r.cancelled,
    avg_progress: round2(r.avg_progress ?? 0),
    rate: r.total ? round2((r.done / r.total) * 100) : 0,
  }));
  const sum = (k: keyof (typeof out)[number]) => out.reduce((s, r) => s + Number(r[k]), 0);
  return {
    title: 'Statystyka zadań',
    subtitle: per.label + ' (zadania z terminem rozpoczęcia w okresie)',
    columns: [
      { key: 'operator', label: 'Pracownik', width: 2.5 },
      { key: 'total', label: 'Wszystkie', type: 'int' },
      { key: 'done', label: 'Wykonane', type: 'int' },
      { key: 'on_time', label: 'W terminie', type: 'int' },
      { key: 'open', label: 'W toku', type: 'int' },
      { key: 'overdue', label: 'Przeterminowane', type: 'int', width: 1.4 },
      { key: 'cancelled', label: 'Anulowane', type: 'int' },
      { key: 'avg_progress', label: 'Śr. postęp', type: 'percent' },
      { key: 'rate', label: 'Wykonanie', type: 'percent' },
    ],
    rows: out,
    totals: {
      operator: 'Razem',
      total: sum('total'),
      done: sum('done'),
      on_time: sum('on_time'),
      open: sum('open'),
      overdue: sum('overdue'),
      cancelled: sum('cancelled'),
      avg_progress: out.length ? round2(out.reduce((s, r) => s + r.avg_progress * r.total, 0) / Math.max(1, sum('total'))) : 0,
      rate: sum('total') ? round2((sum('done') / sum('total')) * 100) : 0,
    },
    chart: {
      labels: out.map((r) => r.operator),
      series: [
        { name: 'Wykonane', values: out.map((r) => r.done) },
        { name: 'W toku', values: out.map((r) => r.open) },
        { name: 'Przeterminowane', values: out.map((r) => r.overdue) },
      ],
    },
  };
}

function activity(ctx: Ctx, u: User, p: ReportParams): ReportResult {
  const per = period(p);
  const opId = p.operator_id ? Number(p.operator_id) : u.id;
  const ops = scopeOperators(ctx, u, opId)!;
  const op = ctx.db.get<any>('SELECT name FROM operators WHERE id = ?', ops[0]);
  const kinds = ctx.db.all<any>("SELECT id, name FROM dict_items WHERE dict = 'corr_kind' ORDER BY sort");
  const counts = ctx.db.all<any>(
    `SELECT kind_id, direction, COUNT(*) AS n, SUM(duration_sec) AS sec FROM correspondence
     WHERE operator_id = ? AND event_at >= ? AND event_at <= ? GROUP BY kind_id, direction`,
    ops[0],
    per.fromTs,
    per.toTs,
  );
  const rows = kinds
    .map((k) => {
      const out = counts.find((c) => c.kind_id === k.id && c.direction === 'out');
      const inn = counts.find((c) => c.kind_id === k.id && c.direction === 'in');
      const sec = (out?.sec ?? 0) + (inn?.sec ?? 0);
      return { kind: k.name, out: out?.n ?? 0, in: inn?.n ?? 0, total: (out?.n ?? 0) + (inn?.n ?? 0), hours: round2(sec / 3600), sec };
    })
    .filter((r) => r.total > 0);
  return {
    title: `Raport aktywności dla operatora: ${op?.name ?? ''}`,
    subtitle: `okres zestawienia: od ${fmtDatePl(per.from)} do ${fmtDatePl(per.to)}`,
    columns: [
      { key: 'kind', label: 'Rodzaj korespondencji', width: 2.5 },
      { key: 'out', label: 'Wychodząca', type: 'int' },
      { key: 'in', label: 'Przychodząca', type: 'int' },
      { key: 'total', label: 'Razem', type: 'int' },
      { key: 'hours', label: 'Czas [h]', type: 'hours' },
    ],
    rows,
    totals: {
      kind: 'Suma',
      out: rows.reduce((s, r) => s + r.out, 0),
      in: rows.reduce((s, r) => s + r.in, 0),
      total: rows.reduce((s, r) => s + r.total, 0),
      hours: round2(rows.reduce((s, r) => s + r.sec, 0) / 3600),
    },
    chart: { labels: rows.map((r) => r.kind), series: [{ name: 'Razem', values: rows.map((r) => r.total) }] },
  };
}

function timeReport(ctx: Ctx, u: User, p: ReportParams): ReportResult {
  const per = period(p);
  const ops = scopeOperators(ctx, u, p.operator_id);
  const by = p.group_by ?? 'operator';
  const fc = inList(ops, 'k.operator_id');
  const ft = inList(ops, 'e.operator_id');
  const keyCol = { operator: 'operator_id', contractor: 'contractor_id', project: 'project_id' }[by];
  const corr = ctx.db.all<any>(
    `SELECT k.${keyCol} AS key, SUM(k.duration_sec) / 60.0 AS min FROM correspondence k
     WHERE k.event_at >= ? AND k.event_at <= ? AND ${fc.sql} GROUP BY k.${keyCol}`,
    per.fromTs,
    per.toTs,
    ...fc.params,
  );
  const entries = ctx.db.all<any>(
    `SELECT ${by === 'operator' ? 'e.operator_id' : by === 'contractor' ? 'COALESCE(e.contractor_id, t.contractor_id)' : 'COALESCE(e.project_id, t.project_id)'} AS key,
            SUM(e.minutes) AS min
     FROM time_entries e LEFT JOIN tasks t ON t.id = e.task_id
     WHERE e.work_date >= ? AND e.work_date <= ? AND ${ft.sql} GROUP BY 1`,
    per.from,
    per.to,
    ...ft.params,
  );
  const map = new Map<string, { corr: number; tasks: number }>();
  const k = (v: any) => (v == null ? 'null' : String(v));
  corr.forEach((r) => map.set(k(r.key), { corr: r.min ?? 0, tasks: 0 }));
  entries.forEach((r) => {
    const e = map.get(k(r.key)) ?? { corr: 0, tasks: 0 };
    e.tasks += r.min ?? 0;
    map.set(k(r.key), e);
  });
  const table = { operator: 'operators', contractor: 'contractors', project: 'projects' }[by];
  const names = new Map<string, string>(ctx.db.all<any>(`SELECT id, name FROM ${table}`).map((r) => [String(r.id), r.name]));
  const total = [...map.values()].reduce((s, v) => s + v.corr + v.tasks, 0);
  const rows = [...map.entries()]
    .map(([key, v]) => ({
      name: key === 'null' ? (by === 'operator' ? '(brak)' : by === 'contractor' ? '(bez kontrahenta)' : '(bez projektu)') : names.get(key) ?? `#${key}`,
      corr_h: round2(v.corr / 60),
      tasks_h: round2(v.tasks / 60),
      total_h: round2((v.corr + v.tasks) / 60),
      share: total ? round2(((v.corr + v.tasks) / total) * 100) : 0,
    }))
    .filter((r) => r.total_h > 0)
    .sort((a, b) => b.total_h - a.total_h);
  const label = { operator: 'Operator', contractor: 'Kontrahent', project: 'Projekt' }[by];
  const top = rows.slice(0, 12);
  return {
    title: `Czas pracy wg: ${label.toLowerCase()}`,
    subtitle: per.label + '; czas z korespondencji (czas trwania) i z ewidencji czasu zadań',
    columns: [
      { key: 'name', label, width: 3 },
      { key: 'corr_h', label: 'Korespondencja [h]', type: 'hours' },
      { key: 'tasks_h', label: 'Zadania [h]', type: 'hours' },
      { key: 'total_h', label: 'Razem [h]', type: 'hours' },
      { key: 'share', label: 'Udział w czasie firmy', type: 'percent', width: 1.3 },
    ],
    rows,
    totals: {
      name: 'Razem',
      corr_h: round2([...map.values()].reduce((s, v) => s + v.corr, 0) / 60),
      tasks_h: round2([...map.values()].reduce((s, v) => s + v.tasks, 0) / 60),
      total_h: round2(total / 60),
      share: total ? 100 : 0,
    },
    chart: { labels: top.map((r) => r.name), series: [{ name: 'Godziny', values: top.map((r) => r.total_h) }], unit: 'h' },
  };
}

// ---------- Harmonogram raportów ----------
export const PERIODS: Record<string, string> = {
  current_month: 'bieżący miesiąc',
  previous_month: 'poprzedni miesiąc',
  last_7_days: 'ostatnie 7 dni',
  last_30_days: 'ostatnie 30 dni',
  current_week: 'bieżący tydzień',
};
export const FREQUENCIES: Record<string, string> = {
  month_last_day: 'ostatniego dnia miesiąca',
  month_first_day: 'pierwszego dnia miesiąca',
  weekly: 'co tydzień',
  daily: 'codziennie',
};

export function periodRange(periodKey: string, refDate: string): { from: string; to: string } {
  const d = parseLocal(refDate);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  switch (periodKey) {
    case 'previous_month': {
      const pm = m === 1 ? 12 : m - 1;
      const py = m === 1 ? y - 1 : y;
      return { from: `${py}-${String(pm).padStart(2, '0')}-01`, to: `${py}-${String(pm).padStart(2, '0')}-${lastDayOfMonth(py, pm)}` };
    }
    case 'last_7_days':
      return { from: addDaysDate(refDate, -6), to: refDate };
    case 'last_30_days':
      return { from: addDaysDate(refDate, -29), to: refDate };
    case 'current_week':
      return { from: addDaysDate(refDate, -(isoWeekday(refDate) - 1)), to: refDate };
    default:
      return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: refDate };
  }
}

/** Najbliższy termin uruchomienia harmonogramu po chwili `after`. */
export function nextRun(s: { frequency: string; weekday?: number | null; time_of_day: string }, after: string): string {
  const t = s.time_of_day || '18:00';
  let day = after.slice(0, 10);
  for (let i = 0; i < 400; i++, day = addDaysDate(day, 1)) {
    const dt = parseLocal(day);
    const ok =
      s.frequency === 'daily' ||
      (s.frequency === 'weekly' && isoWeekday(day) === (s.weekday || 1)) ||
      (s.frequency === 'month_first_day' && dt.getDate() === 1) ||
      (s.frequency === 'month_last_day' && dt.getDate() === lastDayOfMonth(dt.getFullYear(), dt.getMonth() + 1));
    if (!ok) continue;
    const at = `${day}T${t}:00`;
    if (at > after) return at;
  }
  return `${addDaysDate(after.slice(0, 10), 1)}T${t}:00`;
}

export { toLocalDate };
