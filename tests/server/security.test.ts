import { describe, expect, it, afterEach } from 'vitest';
import { setup, uploadAs, PASSWORD } from './helpers.js';
import { processReminders } from '../../server/src/services/tasks.js';
import { addMinutesIso, nowIso, setClockOffset } from '../../server/src/util.js';

afterEach(() => setClockOffset(0));

describe('bezpieczeństwo i uprawnienia (regresje z audytu)', () => {
  it('zakodowana ścieżka nie omija logowania', async () => {
    const env = await setup();
    try {
      for (const url of ['/%61pi/operators', '/%61pi/dicts', '/api/%6fperators', '/%61pi/settings/company']) {
        const r = await env.app.inject({ method: 'GET', url });
        expect(r.statusCode, url).toBe(401);
      }
    } finally {
      await env.close();
    }
  });

  it('pliki HTML/SVG są pobierane, a nie wyświetlane; typ nie pochodzi od wysyłającego', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      for (const [name, type] of [['x.html', 'text/html'], ['x.svg', 'image/svg+xml'], ['x.pdf', 'text/html']]) {
        const up = await uploadAs(env, 'admin', '/api/documents', { name }, [{ name, content: '<script>alert(1)</script>', type }]);
        const r = await admin('GET', `/api/documents/${up.json.id}/file?inline=1`);
        expect(String(r.headers['content-type'])).not.toMatch(/html|svg/);
        expect(r.headers['x-content-type-options']).toBe('nosniff');
        expect(String(r.headers['content-security-policy'])).toContain('sandbox');
        if (name !== 'x.pdf') expect(String(r.headers['content-disposition'])).toMatch(/^attachment/);
      }
    } finally {
      await env.close();
    }
  });

  it('prywatne zadanie innej osoby nie jest dostępne po identyfikatorze; czas pracy przeżywa usunięcie zadania', async () => {
    const env = await setup();
    try {
      env.addOperator('h1', 'handlowiec');
      env.addOperator('h2', 'handlowiec');
      const h1 = await env.login('h1');
      const h2 = await env.login('h2');
      const start = addMinutesIso(nowIso(), 120).slice(0, 16);
      const t = await h1('POST', '/api/tasks', { title: 'Prywatne', start_at: start, end_at: addMinutesIso(start + ':00', 30).slice(0, 16) });
      expect((await h2('GET', `/api/tasks/${t.json.id}`)).status).toBe(403);
      expect((await h2('POST', `/api/tasks/${t.json.id}/time`, { minutes: 60 })).status).toBe(403);
      expect((await h2('GET', `/api/attachments/task/${t.json.id}`)).status).toBe(403);
      expect((await h1('POST', `/api/tasks/${t.json.id}/time`, { minutes: 45 })).status).toBe(200);
      expect((await h1('PATCH', `/api/tasks/${t.json.id}/move`, { start_at: start, end_at: 'zzz' })).status).toBe(400);
      expect((await h1('DELETE', `/api/tasks/${t.json.id}`)).status).toBe(200);
      expect(env.ctx.db.get<any>('SELECT SUM(minutes) AS m FROM time_entries')!.m).toBe(45);
    } finally {
      await env.close();
    }
  });

  it('przypomnienie: zmiana postępu nie wysyła go ponownie, nie cofa potwierdzenia ani odłożenia', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      env.ctx.db.run("UPDATE operators SET email = 'admin@test.example' WHERE login = 'admin'");
      const start = addMinutesIso(nowIso(), 30).slice(0, 16);
      const t = await admin('POST', '/api/tasks', { title: 'Z przypomnieniem', start_at: start, end_at: addMinutesIso(start + ':00', 30).slice(0, 16), remind_before_min: 60, remind_email: true });
      processReminders(env.ctx);
      const mails = () => env.ctx.db.get<any>("SELECT COUNT(*) AS n FROM outbox WHERE channel = 'email'")!.n;
      expect(mails()).toBe(1);
      await admin('PATCH', `/api/tasks/${t.json.id}/progress`, { progress: 30 });
      processReminders(env.ctx);
      expect(mails()).toBe(1);
      let n = (await admin('GET', '/api/notifications')).json.reminders;
      expect(n).toHaveLength(1);
      await admin('POST', `/api/reminders/${n[0].id}/snooze`, { minutes: 20 });
      await admin('PATCH', `/api/tasks/${t.json.id}/progress`, { progress: 50 });
      processReminders(env.ctx);
      expect((await admin('GET', '/api/notifications')).json.reminders).toHaveLength(0); // nadal odłożone
      setClockOffset(21 * 60000);
      processReminders(env.ctx);
      n = (await admin('GET', '/api/notifications')).json.reminders;
      expect(n).toHaveLength(1);
      await admin('POST', `/api/reminders/${n[0].id}/ack`);
      await admin('PATCH', `/api/tasks/${t.json.id}/progress`, { progress: 70 });
      processReminders(env.ctx);
      expect((await admin('GET', '/api/notifications')).json.reminders).toHaveLength(0);
      expect(mails()).toBe(1);
    } finally {
      await env.close();
    }
  });

  it('role: sprzedaż, towary, import, kolejka wysyłki, wysyłka cudzej korespondencji', async () => {
    const env = await setup();
    try {
      env.addOperator('h1', 'handlowiec');
      env.addOperator('h2', 'handlowiec');
      const admin = await env.login('admin');
      const h1 = await env.login('h1');
      const h2 = await env.login('h2');
      const c = await admin('POST', '/api/contractors', { name: 'Firma' });
      const p = await admin('POST', '/api/products', { name: 'Towar', net_price: 100, vat_rate: 23 });
      expect((await h1('PUT', `/api/products/${p.json.id}`, { name: 'Towar', net_price: 0.01, vat_rate: 23 })).status).toBe(403);
      const s = await h1('POST', '/api/sales', { doc_number: 'FV/1', doc_date: '2026-03-02', contractor_id: c.json.id, net_total: 1000 });
      expect((await h2('PUT', `/api/sales/${s.json.id}`, { doc_number: 'FV/1', doc_date: '2026-03-02', contractor_id: c.json.id, net_total: 5 })).status).toBe(403);
      expect((await h1('POST', '/api/sales', { doc_number: 'FV/2', doc_date: '2026-13-99', contractor_id: c.json.id, net_total: 1 })).status).toBe(400);
      expect((await h1('POST', '/api/import/run', { token: 'x' })).status).toBe(403);
      const kind = env.ctx.db.get<any>("SELECT id FROM dict_items WHERE dict = 'corr_kind' AND code = 'email'")!.id;
      const k = await h1('POST', '/api/correspondence', { kind_id: kind, direction: 'out', event_at: nowIso().slice(0, 16), topic_text: 'Oferta', contractor_id: c.json.id, email_to: 'a@b.example', body: 'x' });
      expect((await h2('POST', `/api/correspondence/${k.json.id}/send`)).status).toBe(403);
      expect((await h1('POST', `/api/correspondence/${k.json.id}/send`)).json.status).toBe('awaiting_config');
      const o = env.ctx.db.get<any>('SELECT id FROM outbox')!.id;
      expect((await h2('POST', `/api/outbox/${o}/cancel`)).status).toBe(403);
      env.ctx.db.run("UPDATE outbox SET status = 'sent' WHERE id = ?", o);
      expect((await admin('POST', `/api/outbox/${o}/retry`)).status).toBe(400);
      expect((await admin('POST', `/api/outbox/${o}/cancel`)).status).toBe(400);
      // żądania bez treści i z niepoprawnym parametrem nie kończą się błędem serwera
      expect((await admin('POST', '/api/contractors')).status).toBe(400);
      expect((await admin('GET', '/api/reports/time?group_by=xyz')).status).toBe(200);
      // zmiana hasła kończy pozostałe sesje konta
      const h1b = await env.login('h1');
      await h1('POST', '/api/auth/password', { current: PASSWORD, password: 'NoweHaslo123' });
      expect((await h1b('GET', '/api/tasks')).status).toBe(401);
    } finally {
      await env.close();
    }
  });
});
