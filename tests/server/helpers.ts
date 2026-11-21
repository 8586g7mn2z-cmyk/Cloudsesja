import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { loadConfig, openDb, type Ctx } from '../../server/src/context.js';
import { ensureAdmin, hashPassword } from '../../server/src/auth.js';
import { nowIso } from '../../server/src/util.js';

export interface TestEnv {
  ctx: Ctx;
  app: FastifyInstance;
  dir: string;
  /** Loguje i zwraca funkcję wykonującą żądania z ciasteczkiem sesji. */
  login: (login: string, password?: string) => Promise<Client>;
  addOperator: (login: string, role: 'admin' | 'kierownik' | 'handlowiec', extra?: Record<string, any>) => number;
  close: () => Promise<void>;
}
export type Client = (method: string, url: string, body?: any) => Promise<{ status: number; json: any; headers: any; raw: Buffer }>;

export const PASSWORD = 'Haslo1234';

export async function setup(): Promise<TestEnv> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnos-test-'));
  process.env.DIAGNOS_ADMIN_PASSWORD = PASSWORD;
  const config = loadConfig({ dataDir: dir, scheduler: false, clientDir: path.join(dir, 'none') });
  const db = openDb(config);
  const ctx: Ctx = { db, config };
  ensureAdmin(ctx);
  db.run("UPDATE operators SET must_change_password = 0 WHERE login = 'admin'");
  const app = await buildApp(ctx);
  const login = async (l: string, password = PASSWORD): Promise<Client> => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: l, password } });
    if (r.statusCode !== 200) throw new Error(`login ${l} failed: ${r.body}`);
    const cookie = String(r.headers['set-cookie']).split(';')[0];
    return async (method, url, body) => {
      const res = await app.inject({ method: method as any, url, payload: body, headers: { cookie } });
      let json: any = null;
      try {
        json = res.json();
      } catch {
        /* nie JSON */
      }
      return { status: res.statusCode, json, headers: res.headers, raw: res.rawPayload };
    };
  };
  const addOperator = (l: string, role: 'admin' | 'kierownik' | 'handlowiec', extra: Record<string, any> = {}) =>
    db.insert('operators', { login: l, name: extra.name ?? l, role, password_hash: hashPassword(PASSWORD), created_at: nowIso(), email: extra.email ?? `${l}@test.example`, phone: extra.phone ?? null, manager_id: extra.manager_id ?? null });
  return {
    ctx,
    app,
    dir,
    login,
    addOperator,
    close: async () => {
      await app.close();
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Wieloczęściowe żądanie (upload pliku) przez inject. */
export function multipart(fields: Record<string, string>, files: { name: string; content: Buffer | string; type?: string }[]) {
  const boundary = '----diagnos' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: ${f.type ?? 'application/octet-stream'}\r\n\r\n`));
    parts.push(Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content));
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export async function uploadAs(env: TestEnv, login: string, url: string, fields: Record<string, string>, files: { name: string; content: Buffer | string; type?: string }[]) {
  const r = await env.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login, password: PASSWORD } });
  const cookie = String(r.headers['set-cookie']).split(';')[0];
  const m = multipart(fields, files);
  const res = await env.app.inject({ method: 'POST', url, payload: m.payload, headers: { ...m.headers, cookie } });
  return { status: res.statusCode, json: res.json() };
}
