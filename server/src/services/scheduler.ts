// Zadania w tle wykonywane cyklicznie wewnątrz procesu serwera.
import type { Ctx } from '../context.js';
import { loadUser } from '../auth.js';
import { nowIso, todayIso, fmtDatePl } from '../util.js';
import { processOutbox, queueMessage } from './messaging.js';
import { deliverInternal, generateAllSeries, processReminders } from './tasks.js';
import { nextRun, periodRange, REPORTS, runReport } from './reports.js';
import { reportPdf } from './pdf.js';
import { saveFile } from './files.js';

export async function runSchedule(ctx: Ctx, scheduleId: number): Promise<{ ok: boolean; info: string }> {
  const s = ctx.db.get<any>('SELECT * FROM report_schedules WHERE id = ?', scheduleId);
  if (!s) return { ok: false, info: 'Brak harmonogramu.' };
  const owner = loadUser(ctx, s.created_by);
  if (!owner) return { ok: false, info: 'Autor harmonogramu jest nieaktywny.' };
  try {
    const params = JSON.parse(s.params || '{}');
    const range = periodRange(s.period, todayIso());
    const r = runReport(ctx, owner, s.report_type, { ...params, ...range });
    const pdf = await reportPdf(ctx, r);
    const name = `${REPORTS[s.report_type] ?? 'Raport'} ${range.from}_${range.to}.pdf`;
    const fileId = saveFile(ctx, pdf, name, 'application/pdf', owner.id);
    const recipients = String(s.recipients)
      .split(/[;,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    let status = 'sent';
    for (const to of recipients) {
      const q = queueMessage(ctx, {
        channel: 'email',
        recipient: to,
        subject: `${s.name}: ${r.title} (${fmtDatePl(range.from)}–${fmtDatePl(range.to)})`,
        body_text: `W załączniku raport „${r.title}” wygenerowany automatycznie przez DIAGNOS CRM.\n${r.subtitle ?? ''}`,
        attachments: [{ file_id: fileId, filename: name }],
        report_schedule_id: s.id,
        created_by: owner.id,
      });
      if (q.status === 'awaiting_config') status = 'awaiting_config';
    }
    const info = status === 'awaiting_config' ? 'Raport wygenerowany; e-mail czeka na konfigurację SMTP.' : `Raport wygenerowany i przekazany do wysyłki (${recipients.length} adr.).`;
    const now = nowIso();
    ctx.db.update('report_schedules', s.id, { last_run_at: now, last_status: info, next_run_at: nextRun(s, now) });
    return { ok: true, info };
  } catch (e: any) {
    const info = `Błąd: ${e?.message ?? e}`;
    ctx.db.update('report_schedules', s.id, { last_run_at: nowIso(), last_status: info, next_run_at: nextRun(s, nowIso()) });
    return { ok: false, info };
  }
}

let lastSeriesRun = '';

export async function tick(ctx: Ctx) {
  processReminders(ctx);
  deliverInternal(ctx);
  const hour = nowIso().slice(0, 13);
  if (hour !== lastSeriesRun) {
    lastSeriesRun = hour;
    generateAllSeries(ctx);
  }
  const due = ctx.db.all<{ id: number }>('SELECT id FROM report_schedules WHERE active = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?', nowIso());
  for (const s of due) await runSchedule(ctx, s.id);
  await processOutbox(ctx);
}

export function startScheduler(ctx: Ctx, log: (msg: string, e?: unknown) => void) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick(ctx);
    } catch (e) {
      log('Błąd schedulera', e);
    } finally {
      running = false;
    }
  };
  const h = setInterval(run, ctx.config.schedulerIntervalMs);
  setTimeout(run, 1000);
  return () => clearInterval(h);
}
