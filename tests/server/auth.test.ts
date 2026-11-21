import { describe, expect, it } from 'vitest';
import { setup, PASSWORD } from './helpers.js';
import { ensureAdmin } from '../../server/src/auth.js';

describe('logowanie i uprawnienia', () => {
  it('odrzuca złe hasło, bez sesji zwraca 401', async () => {
    const env = await setup();
    try {
      const r = await env.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', password: 'zle' } });
      expect(r.statusCode).toBe(401);
      const r2 = await env.app.inject({ method: 'GET', url: '/api/contractors' });
      expect(r2.statusCode).toBe(401);
    } finally {
      await env.close();
    }
  });

  it('konto startowe wymaga zmiany hasła przed dalszą pracą', async () => {
    const env = await setup();
    try {
      env.ctx.db.run("UPDATE operators SET must_change_password = 1 WHERE login = 'admin'");
      const admin = await env.login('admin');
      expect((await admin('GET', '/api/contractors')).status).toBe(403);
      expect((await admin('POST', '/api/auth/password', { current: PASSWORD, password: 'krotkie' })).status).toBe(400);
      expect((await admin('POST', '/api/auth/password', { current: PASSWORD, password: 'NoweHaslo99' })).status).toBe(200);
      expect((await admin('GET', '/api/contractors')).status).toBe(200);
      expect(ensureAdmin(env.ctx)).toBe(null); // drugi raz nie tworzy konta
    } finally {
      await env.close();
    }
  });

  it('handlowiec nie zmieni konfiguracji ani operatorów (egzekwowane na serwerze)', async () => {
    const env = await setup();
    try {
      env.addOperator('handl', 'handlowiec');
      const h = await env.login('handl');
      expect((await h('POST', '/api/operators', { login: 'x1', name: 'X', role: 'admin', password: 'Haslo1234' })).status).toBe(403);
      expect((await h('PUT', '/api/settings/smtp', { host: 'evil' })).status).toBe(403);
      expect((await h('GET', '/api/settings/smtp')).status).toBe(403);
      expect((await h('POST', '/api/dicts/contractor_type', { name: 'X' })).status).toBe(403);
      expect((await h('POST', '/api/auto-rules', {})).status).toBe(403);
    } finally {
      await env.close();
    }
  });

  it('hasło SMTP nie wraca do przeglądarki i jest zaszyfrowane w bazie', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      await admin('PUT', '/api/settings/smtp', { host: 'smtp.example', port: 587, user: 'u', password: 'TajneHaslo!', from_email: 'crm@example.pl' });
      const r = await admin('GET', '/api/settings/smtp');
      expect(JSON.stringify(r.json)).not.toContain('TajneHaslo');
      expect(r.json.has_password).toBe(true);
      const raw = env.ctx.db.get<any>("SELECT value FROM settings WHERE key='smtp'").value;
      expect(raw).not.toContain('TajneHaslo');
    } finally {
      await env.close();
    }
  });

  it('kierownik widzi zadania swoich pracowników, handlowiec tylko swoje', async () => {
    const env = await setup();
    try {
      const k = env.addOperator('kier', 'kierownik');
      const h1 = env.addOperator('h1', 'handlowiec', { manager_id: k });
      const h2 = env.addOperator('h2', 'handlowiec');
      const admin = await env.login('admin');
      await admin('POST', '/api/tasks', { title: 'Zadanie h1', start_at: '2026-05-04T10:00', end_at: '2026-05-04T11:00', operator_ids: [h1] });
      await admin('POST', '/api/tasks', { title: 'Zadanie h2', start_at: '2026-05-04T10:00', end_at: '2026-05-04T11:00', operator_ids: [h2] });
      const titles = async (l: string) => (await (await env.login(l))('GET', '/api/tasks')).json.map((t: any) => t.title).sort();
      expect(await titles('kier')).toEqual(['Zadanie h1']);
      expect(await titles('h1')).toEqual(['Zadanie h1']);
      expect(await titles('h2')).toEqual(['Zadanie h2']);
      expect(await titles('admin')).toEqual(['Zadanie h1', 'Zadanie h2']);
      const h2c = await env.login('h2');
      const t1 = env.ctx.db.get<any>("SELECT id FROM tasks WHERE title = 'Zadanie h1'").id;
      expect((await h2c('PUT', `/api/tasks/${t1}`, { title: 'przejęte', start_at: '2026-05-04T10:00', end_at: '2026-05-04T11:00', operator_ids: [h2] })).status).toBe(403);
      // raport innego operatora: odmowa
      expect((await h2c('GET', `/api/reports/activity?operator_id=${h1}`)).status).toBe(400);
    } finally {
      await env.close();
    }
  });
});
