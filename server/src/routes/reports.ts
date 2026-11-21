import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import type { Ctx } from '../context.js';
import { isManager, requireUser } from '../auth.js';
import { bad, forbidden, isValidEmail, notFound, nowIso, str, toInt } from '../util.js';
import { FREQUENCIES, nextRun, PERIODS, REPORTS, runReport, type ReportParams } from '../services/reports.js';
import { fmtCell, reportPdf, type ReportResult } from '../services/pdf.js';
import { runSchedule } from '../services/scheduler.js';
import { contentDisposition } from '../services/files.js';
import { processOutbox } from '../services/messaging.js';

function params(q: any): ReportParams {
  return {
    from: str(q.from) ?? undefined,
    to: str(q.to) ?? undefined,
    operator_id: toInt(q.operator_id),
    days: toInt(q.days) ?? undefined,
    status_id: toInt(q.status_id),
    group_id: toInt(q.group_id),
    owner_id: toInt(q.owner_id),
    only_key: q.only_key === '1' || q.only_key === true,
    group_by: q.group_by,
  };
}

async function xlsx(r: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Raport');
  ws.addRow([r.title]).font = { bold: true, size: 13 };
  if (r.subtitle) ws.addRow([r.subtitle]);
  ws.addRow([]);
  const head = ws.addRow(r.columns.map((c) => c.label));
  head.font = { bold: true };
  const val = (v: any, t?: string) => (['int', 'money', 'percent', 'hours', 'number'].includes(t ?? '') ? (v == null || v === '' ? null : Number(v)) : v == null ? '' : fmtCell(v, t as any));
  for (const row of r.rows) ws.addRow(r.columns.map((c) => val(row[c.key], c.type)));
  if (r.totals) ws.addRow(r.columns.map((c) => val(r.totals![c.key], c.type))).font = { bold: true };
  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(12, c.label.length + 2);
    if (c.type === 'money') col.numFmt = '#,##0.00 "zł"';
    if (c.type === 'hours') col.numFmt = '0.00';
  });
  ws.getColumn(1).width = 40;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function reportRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  app.get('/api/reports', async () => ({ reports: REPORTS, periods: PERIODS, frequencies: FREQUENCIES }));
  app.get('/api/reports/:type', async (req) => {
    const u = requireUser(req);
    return runReport(ctx, u, (req.params as any).type, params(req.query));
  });
  app.get('/api/reports/:type/pdf', async (req, reply) => {
    const u = requireUser(req);
    const r = runReport(ctx, u, (req.params as any).type, params(req.query));
    const pdf = await reportPdf(ctx, r);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', contentDisposition(`${r.title}.pdf`, (req.query as any).download !== '1'));
    return reply.send(pdf);
  });
  app.get('/api/reports/:type/xlsx', async (req, reply) => {
    const u = requireUser(req);
    const r = runReport(ctx, u, (req.params as any).type, params(req.query));
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', contentDisposition(`${r.title}.xlsx`, false));
    return reply.send(await xlsx(r));
  });

  // ---------- Harmonogram raportów automatycznych ----------
  const schedData = (b: any) => {
    if (!str(b.name)) throw bad('Podaj nazwę harmonogramu.');
    if (!REPORTS[b.report_type]) throw bad('Wybierz raport.');
    if (!PERIODS[b.period]) throw bad('Wybierz okres raportu.');
    if (!FREQUENCIES[b.frequency]) throw bad('Wybierz częstotliwość.');
    if (!/^\d{2}:\d{2}$/.test(b.time_of_day ?? '')) throw bad('Podaj godzinę wysyłki.');
    const rec = String(b.recipients ?? '').split(/[;,\s]+/).filter(Boolean);
    if (!rec.length || rec.some((e) => !isValidEmail(e))) throw bad('Podaj poprawne adresy e-mail odbiorców (oddzielone przecinkami).');
    return {
      name: str(b.name),
      report_type: b.report_type,
      params: JSON.stringify(b.params ?? {}),
      period: b.period,
      frequency: b.frequency,
      weekday: b.frequency === 'weekly' ? toInt(b.weekday) ?? 1 : null,
      time_of_day: b.time_of_day,
      recipients: rec.join(', '),
      active: b.active === false ? 0 : 1,
    };
  };
  app.get('/api/report-schedules', async (req) => {
    const u = requireUser(req);
    const rows = db.all<any>('SELECT s.*, o.name AS author FROM report_schedules s LEFT JOIN operators o ON o.id = s.created_by ORDER BY s.name');
    return rows.filter((s) => isManager(u) || s.created_by === u.id).map((s) => ({ ...s, params: JSON.parse(s.params || '{}') }));
  });
  app.post('/api/report-schedules', async (req) => {
    const u = requireUser(req);
    const d = schedData(req.body);
    return { id: db.insert('report_schedules', { ...d, next_run_at: d.active ? nextRun(d, nowIso()) : null, created_by: u.id, created_at: nowIso() }) };
  });
  const own = (u: any, id: number) => {
    const s = db.get<any>('SELECT * FROM report_schedules WHERE id = ?', id);
    if (!s) throw notFound();
    if (s.created_by !== u.id && u.role !== 'admin') throw forbidden();
    return s;
  };
  app.put('/api/report-schedules/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    own(u, id);
    const d = schedData(req.body);
    db.update('report_schedules', id, { ...d, next_run_at: d.active ? nextRun(d, nowIso()) : null });
    return { ok: true };
  });
  app.delete('/api/report-schedules/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    own(u, id);
    db.run('DELETE FROM report_schedules WHERE id = ?', id);
    return { ok: true };
  });
  app.post('/api/report-schedules/:id/run', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    own(u, id);
    const r = await runSchedule(ctx, id);
    await processOutbox(ctx);
    const after = db.get<any>("SELECT COUNT(*) AS sent FROM outbox WHERE report_schedule_id = ? AND status = 'sent'", id);
    return { ...r, sent_total: after.sent };
  });
}
