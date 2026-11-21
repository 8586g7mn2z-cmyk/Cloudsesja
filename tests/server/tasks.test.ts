import { afterEach, describe, expect, it } from 'vitest';
import { setup } from './helpers.js';
import { occurrences, processReminders, deliverInternal, generateSeries } from '../../server/src/services/tasks.js';
import { addDaysDate, addMinutesIso, nowIso, setClockOffset, todayIso } from '../../server/src/util.js';

afterEach(() => setClockOffset(0));

describe('zadania cykliczne: wystąpienia', () => {
  it('co tydzień w wybrane dni', () => {
    // 2026-03-02 to poniedziałek
    expect(occurrences({ freq: 'weekly', interval_n: 1, weekdays: [1, 3], start_date: '2026-03-02' }, '2026-03-01', '2026-03-15')).toEqual(['2026-03-02', '2026-03-04', '2026-03-09', '2026-03-11']);
  });
  it('co 2 tygodnie liczone od tygodnia startu', () => {
    expect(occurrences({ freq: 'weekly', interval_n: 2, weekdays: [5], start_date: '2026-03-04' }, '2026-03-01', '2026-04-05')).toEqual(['2026-03-06', '2026-03-20', '2026-04-03']);
  });
  it('co miesiąc 31. dnia → ostatni dzień krótszych miesięcy', () => {
    expect(occurrences({ freq: 'monthly', interval_n: 1, month_day: 31, start_date: '2026-01-31' }, '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });
  it('co N dni z datą końca i oknem od środka serii', () => {
    expect(occurrences({ freq: 'every_n_days', interval_n: 3, start_date: '2026-03-01', end_date: '2026-03-12' }, '2026-03-05', '2026-03-31')).toEqual(['2026-03-07', '2026-03-10']);
  });
  it('codziennie przez zmianę czasu na letni', () => {
    expect(occurrences({ freq: 'daily', interval_n: 1, start_date: '2026-03-28' }, '2026-03-28', '2026-03-31')).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
  });
  it('generowanie jest idempotentne i tworzy zadania z godzinami', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      const r = await admin('POST', '/api/task-series', { title: 'Zebranie', freq: 'daily', interval_n: 1, start_date: todayIso(), end_date: addDaysDate(todayIso(), 4), time_from: '09:00', time_to: '09:30' });
      expect(r.json.generated).toBe(5);
      expect(generateSeries(env.ctx, r.json.id)).toBe(0);
      const t = env.ctx.db.get<any>('SELECT * FROM tasks WHERE series_id = ? ORDER BY start_at LIMIT 1', r.json.id);
      expect(t.start_at).toBe(`${todayIso()}T09:00:00`);
      // zmiana definicji: przyszłe nierozpoczęte wystąpienia przeliczone
      await admin('PUT', `/api/task-series/${r.json.id}`, { title: 'Zebranie', freq: 'daily', interval_n: 2, start_date: todayIso(), end_date: addDaysDate(todayIso(), 4), time_from: '10:00', time_to: '10:30' });
      const all = env.ctx.db.all<any>('SELECT start_at FROM tasks WHERE series_id = ? ORDER BY start_at', r.json.id);
      expect(all.map((x) => x.start_at.slice(11, 16))).toEqual(['10:00', '10:00', '10:00']);
    } finally {
      await env.close();
    }
  });
});

describe('reguły automatyczne', () => {
  it('nowy kontrahent → zadanie „kontakt” dla prowadzącego po N dniach', async () => {
    const env = await setup();
    try {
      const h = env.addOperator('handl', 'handlowiec');
      const admin = await env.login('admin');
      const rule = env.ctx.db.get<any>("SELECT * FROM auto_rules WHERE event = 'contractor.created'");
      expect(rule.delay_days).toBe(3);
      const c = await admin('POST', '/api/contractors', { name: 'Nowa Firma S.A.', short_name: 'NOWA', owner_id: h });
      const t = env.ctx.db.get<any>('SELECT * FROM tasks WHERE contractor_id = ?', c.json.id);
      expect(t.title).toBe('Kontakt z nowym kontrahentem: NOWA');
      expect(t.operator_id).toBe(h);
      expect(t.start_at).toBe(`${addDaysDate(todayIso(), 3)}T10:00:00`);
      expect(t.rule_id).toBe(rule.id);
      // druga reguła dodana przez administratora: zamówienie → zadanie dla autora po 1 dniu
      await admin('POST', '/api/auto-rules', { name: 'Potwierdzenie zamówienia', event: 'order.created', delay_days: 1, time_of_day: '08:30', title_tpl: 'Potwierdź zamówienie {{numer}}', assign_to: 'creator' });
      const p = await admin('POST', '/api/products', { name: 'X', net_price: 10, vat_rate: 23 });
      const o = await admin('POST', '/api/orders', { contractor_id: c.json.id, order_date: todayIso(), items: [{ product_id: p.json.id, qty: 3 }] });
      const ot = env.ctx.db.get<any>("SELECT * FROM tasks WHERE title LIKE 'Potwierdź zamówienie%'");
      expect(ot.title).toMatch(/^Potwierdź zamówienie DIAGNOS\/ZAM\/1\/\d{4}$/);
      expect(ot.start_at).toBe(`${addDaysDate(todayIso(), 1)}T08:30:00`);
      expect(env.ctx.db.get<any>('SELECT net_total, gross_total FROM orders WHERE id = ?', o.json.id)).toEqual({ net_total: 30, gross_total: 36.9 });
    } finally {
      await env.close();
    }
  });
});

describe('przypomnienia', () => {
  it('pojawiają się w czasie, wysyłają e-mail (kolejka), można je odłożyć i potwierdzić', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      env.ctx.db.run("UPDATE operators SET email = 'admin@test.example' WHERE login = 'admin'");
      const start = addMinutesIso(nowIso(), 60).slice(0, 16);
      const r = await admin('POST', '/api/tasks', { title: 'Telefon do klienta', start_at: start, end_at: addMinutesIso(start, 15), remind_before_min: 15, remind_email: true });
      expect(processReminders(env.ctx)).toBe(0);
      expect((await admin('GET', '/api/notifications')).json.reminders).toHaveLength(0);
      setClockOffset(46 * 60 * 1000); // 46 minut później (przypomnienie 15 min przed startem)
      expect(processReminders(env.ctx)).toBe(1);
      const n = (await admin('GET', '/api/notifications')).json.reminders;
      expect(n).toHaveLength(1);
      expect(n[0].title).toBe('Telefon do klienta');
      const ob = env.ctx.db.get<any>('SELECT * FROM outbox WHERE reminder_id = ?', n[0].id);
      expect(ob.status).toBe('awaiting_config'); // brak SMTP: nie udajemy wysyłki
      expect(ob.recipient).toBe('admin@test.example');
      await admin('POST', `/api/reminders/${n[0].id}/snooze`, { minutes: 5 });
      expect((await admin('GET', '/api/notifications')).json.reminders).toHaveLength(0);
      setClockOffset(52 * 60 * 1000);
      processReminders(env.ctx);
      expect((await admin('GET', '/api/notifications')).json.reminders).toHaveLength(1);
      expect(env.ctx.db.get<any>('SELECT COUNT(*) AS n FROM outbox WHERE reminder_id = ?', n[0].id).n).toBe(1); // e-mail tylko raz
      await admin('POST', `/api/reminders/${n[0].id}/ack`);
      expect((await admin('GET', '/api/notifications')).json.reminders).toHaveLength(0);
      // zakończone zadanie nie przypomina
      const r2 = await admin('POST', '/api/tasks', { title: 'Zrobione', start_at: addMinutesIso(nowIso(), 120).slice(0, 16), end_at: addMinutesIso(nowIso(), 130).slice(0, 16), remind_before_min: 5, progress: 100 });
      expect(env.ctx.db.get<any>('SELECT COUNT(*) AS n FROM reminders WHERE task_id = ?', r2.json.id).n).toBe(0);
      void r;
    } finally {
      await env.close();
    }
  });
});

describe('korespondencja wewnętrzna z terminem doręczenia', () => {
  it('adresat widzi wiadomość dopiero o wskazanej porze', async () => {
    const env = await setup();
    try {
      env.addOperator('odb', 'handlowiec');
      env.addOperator('inny', 'handlowiec');
      const admin = await env.login('admin');
      const odbId = env.ctx.db.get<any>("SELECT id FROM operators WHERE login='odb'").id;
      const when = addMinutesIso(nowIso(), 120).slice(0, 16);
      const r = await admin('POST', '/api/internal', { recipient_ids: [odbId], subject: 'Raport z wizyty', body: 'Proszę o raport', deliver_at: when });
      expect(r.json.scheduled).toBe(true);
      const odb = await env.login('odb');
      expect((await odb('GET', '/api/internal/inbox')).json).toHaveLength(0);
      expect((await odb('GET', '/api/notifications')).json.messages).toHaveLength(0);
      setClockOffset(121 * 60 * 1000);
      expect(deliverInternal(env.ctx)).toBe(1);
      const inbox = (await odb('GET', '/api/internal/inbox')).json;
      expect(inbox).toHaveLength(1);
      expect(inbox[0].read_at).toBe(null);
      expect((await odb('GET', '/api/notifications')).json.messages).toHaveLength(1);
      await odb('POST', `/api/internal/${inbox[0].id}/read`);
      expect((await odb('GET', '/api/notifications')).json.messages).toHaveLength(0);
      expect((await (await env.login('inny'))('GET', '/api/internal/inbox')).json).toHaveLength(0);
      const sent = (await admin('GET', '/api/internal/sent')).json[0];
      expect(sent.read_count).toBe(1);
    } finally {
      await env.close();
    }
  });
});
