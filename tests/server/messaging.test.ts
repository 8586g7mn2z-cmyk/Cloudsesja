import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { setup, uploadAs } from './helpers.js';
import { startSmtp } from './smtp.js';
import { processOutbox } from '../../server/src/services/messaging.js';
import { runSchedule } from '../../server/src/services/scheduler.js';

describe('wysyłka e-mail przez SMTP (lokalny serwer testowy)', () => {
  it('bez konfiguracji wiadomość czeka; po konfiguracji zostaje wysłana z załącznikiem i zapisana jako korespondencja wychodząca', async () => {
    const env = await setup();
    const smtp = await startSmtp();
    try {
      const admin = await env.login('admin');
      const email = env.ctx.db.get<any>("SELECT id FROM dict_items WHERE dict='corr_kind' AND code='email'").id;
      const c = await admin('POST', '/api/contractors', { name: 'Odbiorca S.A.', short_name: 'ODB', email: 'biuro@odbiorca.example' });
      const k = await admin('POST', '/api/correspondence', { kind_id: email, direction: 'out', event_at: '2026-05-05T10:00', topic_text: 'Oferta współpracy', contractor_id: c.json.id, body: 'Dzień dobry,\nw załączniku oferta.', email_to: 'jan@odbiorca.example' });
      await uploadAs(env, 'admin', `/api/attachments/correspondence/${k.json.id}`, {}, [{ name: 'oferta.txt', content: 'treść oferty' }]);
      const s1 = await admin('POST', `/api/correspondence/${k.json.id}/send`);
      expect(s1.json.status).toBe('awaiting_config');
      expect(smtp.messages).toHaveLength(0);
      expect((await admin('POST', `/api/correspondence/${k.json.id}/send`)).status).toBe(400); // już w kolejce
      await admin('PUT', '/api/settings/smtp', { host: '127.0.0.1', port: smtp.port, secure: false, user: 'crm', password: 'x', from_email: 'crm@diagnos.example', from_name: 'DIAGNOS' });
      expect((await admin('GET', '/api/settings/status')).json.smtp_configured).toBe(true);
      await processOutbox(env.ctx);
      expect(smtp.messages).toHaveLength(1);
      const m = smtp.messages[0];
      expect(m.subject).toBe('Oferta współpracy');
      expect(m.text).toContain('w załączniku oferta');
      expect(m.attachments[0].filename).toBe('oferta.txt');
      const after = (await admin('GET', `/api/correspondence/${k.json.id}`)).json;
      expect(after.send_status).toBe('sent');
      expect(after.direction).toBe('out');
      const test = await admin('POST', '/api/settings/smtp/test', { to: 'test@example.pl' });
      expect(test.json.ok).toBe(true);
      expect(smtp.messages).toHaveLength(2);
    } finally {
      await smtp.close();
      await env.close();
    }
  });

  it('błąd serwera SMTP nie jest zgłaszany jako sukces', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      await admin('PUT', '/api/settings/smtp', { host: '127.0.0.1', port: 1, from_email: 'crm@diagnos.example' });
      const r = await admin('POST', '/api/settings/smtp/test', { to: 'a@b.pl' });
      expect(r.json.ok).toBe(false);
      expect(r.json.info).toMatch(/nie powiodła/);
    } finally {
      await env.close();
    }
  });

  it('korespondencja seryjna: pola podstawiane, status per odbiorca, wpis korespondencji u każdego kontrahenta', async () => {
    const env = await setup();
    const smtp = await startSmtp();
    try {
      const admin = await env.login('admin');
      await admin('PUT', '/api/settings/smtp', { host: '127.0.0.1', port: smtp.port, from_email: 'crm@diagnos.example' });
      const g = env.ctx.db.get<any>("SELECT id FROM dict_items WHERE dict='contractor_group' AND name='Handel'").id;
      const a = await admin('POST', '/api/contractors', { name: 'Alfa Sp. z o.o.', short_name: 'ALFA', group_id: g, city: 'Kraków' });
      await admin('POST', `/api/contractors/${a.json.id}/contacts`, { first_name: 'Anna', last_name: 'Nowak', email: 'anna@alfa.example', is_primary: 1 });
      const b = await admin('POST', '/api/contractors', { name: 'Beta S.A.', short_name: 'BETA', email: 'biuro@beta.example', city: 'Łódź' });
      await admin('PUT', `/api/contractors/${b.json.id}`, { groups: [g] });
      await admin('POST', '/api/contractors', { name: 'Gamma (bez e-maila)', group_id: g });
      await admin('POST', '/api/contractors', { name: 'Spoza grupy', email: 'x@y.example' });
      const body = { name: 'Zaproszenie', subject: 'Zaproszenie dla {{firma}}', body: 'Dzień dobry {{osoba}},\nzapraszamy firmę {{firma_pelna}} z miasta {{miasto}}.', target: { type: 'group', group_id: g }, recipient_mode: 'primary' };
      const prev = await admin('POST', '/api/campaigns/preview', body);
      expect(prev.json.total).toBe(3);
      expect(prev.json.with_email).toBe(2);
      expect(prev.json.without_email).toEqual(['Gamma (bez e-maila)']);
      expect(prev.json.samples[0].body).toContain('Dzień dobry Anna Nowak');
      const camp = await admin('POST', '/api/campaigns', body);
      await processOutbox(env.ctx);
      expect(smtp.messages.map((m) => m.subject).sort()).toEqual(['Zaproszenie dla ALFA', 'Zaproszenie dla BETA']);
      const alfa = smtp.messages.find((m) => m.subject === 'Zaproszenie dla ALFA')!;
      expect(alfa.text).toContain('zapraszamy firmę Alfa Sp. z o.o. z miasta Kraków');
      const d = (await admin('GET', `/api/campaigns/${camp.json.id}`)).json;
      expect(d.recipients.map((r: any) => r.status).sort()).toEqual(['sent', 'sent', 'skipped']);
      const corrA = (await admin('GET', `/api/correspondence?contractor_id=${a.json.id}`)).json;
      expect(corrA).toHaveLength(1);
      expect(corrA[0].send_status).toBe('sent');
      expect(corrA[0].contact_name).toBe('Anna Nowak');
    } finally {
      await smtp.close();
      await env.close();
    }
  });

  it('raport automatyczny: PDF wysłany e-mailem na wskazany adres', async () => {
    const env = await setup();
    const smtp = await startSmtp();
    try {
      const admin = await env.login('admin');
      await admin('PUT', '/api/settings/smtp', { host: '127.0.0.1', port: smtp.port, from_email: 'crm@diagnos.example' });
      const s = await admin('POST', '/api/report-schedules', { name: 'Miesięczny', report_type: 'sales', period: 'previous_month', frequency: 'month_last_day', time_of_day: '18:00', recipients: 'zarzad@diagnos.example, szef@diagnos.example' });
      const sched = env.ctx.db.get<any>('SELECT * FROM report_schedules WHERE id = ?', s.json.id);
      expect(sched.next_run_at.slice(11)).toBe('18:00:00');
      const r = await runSchedule(env.ctx, s.json.id);
      expect(r.ok).toBe(true);
      await processOutbox(env.ctx);
      expect(smtp.messages).toHaveLength(2);
      const m = smtp.messages[0];
      expect(m.subject).toContain('Skuteczność handlowców');
      expect(m.attachments[0].contentType).toBe('application/pdf');
      expect(m.attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await smtp.close();
      await env.close();
    }
  });
});

describe('SMS: wymienny adapter bramki', () => {
  it('bez bramki SMS czeka w kolejce; z bramką HTTP zostaje wysłany', async () => {
    const env = await setup();
    const got: any[] = [];
    const gw = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        got.push({ url: req.url, body: b });
        res.end('OK');
      });
    });
    await new Promise<void>((r) => gw.listen(0, '127.0.0.1', () => r()));
    const port = (gw.address() as any).port;
    try {
      const admin = await env.login('admin');
      const sms = env.ctx.db.get<any>("SELECT id FROM dict_items WHERE dict='corr_kind' AND code='sms'").id;
      const k = await admin('POST', '/api/correspondence', { kind_id: sms, direction: 'out', event_at: '2026-05-05T10:00', topic_text: 'SMS', body: 'Zażółć gęślą jaźń', phone_to: '48600100200' });
      const s1 = await admin('POST', `/api/correspondence/${k.json.id}/send`);
      expect(s1.json.status).toBe('awaiting_config');
      expect((await admin('POST', '/api/settings/sms/test', { to: '1' })).status).toBe(400);
      await admin('PUT', '/api/settings/sms', { provider: 'http', http_url: `http://127.0.0.1:${port}/send`, http_method: 'POST', http_body: '{"to":"{{numer}}","text":"{{tresc}}","key":"{{token}}"}', http_content_type: 'application/json', http_success_text: 'OK', token: 'klucz-123' });
      await processOutbox(env.ctx);
      expect(got).toHaveLength(1);
      expect(JSON.parse(got[0].body)).toEqual({ to: '48600100200', text: 'Zażółć gęślą jaźń', key: 'klucz-123' });
      expect((await admin('GET', `/api/correspondence/${k.json.id}`)).json.send_status).toBe('sent');
      expect(JSON.stringify((await admin('GET', '/api/settings/sms')).json)).not.toContain('klucz-123');
    } finally {
      gw.close();
      await env.close();
    }
  });
});
