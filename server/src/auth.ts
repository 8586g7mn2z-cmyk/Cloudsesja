import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import type { Ctx } from './context.js';
import { forbidden, HttpError, nowIso, toLocalIso, nowDate } from './util.js';

export type Role = 'admin' | 'kierownik' | 'handlowiec';
export const ROLES: Role[] = ['admin', 'kierownik', 'handlowiec'];
export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrator', kierownik: 'Kierownik', handlowiec: 'Handlowiec' };

export interface User {
  id: number;
  login: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  manager_id: number | null;
  must_change_password: number;
  departments: number[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

export const SESSION_COOKIE = 'diagnos_sid';
const SESSION_HOURS = 12;

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, n, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), 64, { N: Number(n), r: 8, p: 1 });
  const expected = Buffer.from(hash, 'base64');
  return expected.length === h.length && crypto.timingSafeEqual(h, expected);
}
export function passwordProblem(pw: string): string | null {
  if (!pw || pw.length < 8) return 'Hasło musi mieć co najmniej 8 znaków.';
  if (!/[0-9]/.test(pw) || !/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(pw)) return 'Hasło musi zawierać litery i cyfry.';
  return null;
}

export function createSession(ctx: Ctx, operatorId: number): string {
  const id = crypto.randomBytes(32).toString('base64url');
  const exp = nowDate();
  exp.setHours(exp.getHours() + SESSION_HOURS);
  ctx.db.run('INSERT INTO sessions (id, operator_id, created_at, expires_at) VALUES (?, ?, ?, ?)', id, operatorId, nowIso(), toLocalIso(exp));
  return id;
}

export function loadUser(ctx: Ctx, operatorId: number): User | undefined {
  const u = ctx.db.get<any>(
    'SELECT id, login, name, email, phone, role, manager_id, must_change_password FROM operators WHERE id = ? AND active = 1',
    operatorId,
  );
  if (!u) return undefined;
  u.departments = ctx.db.all<{ department_id: number }>('SELECT department_id FROM operator_departments WHERE operator_id = ?', u.id).map((r) => r.department_id);
  return u as User;
}

export function userFromSession(ctx: Ctx, sid: string | undefined): User | undefined {
  if (!sid) return undefined;
  const s = ctx.db.get<{ operator_id: number; expires_at: string }>('SELECT operator_id, expires_at FROM sessions WHERE id = ?', sid);
  if (!s) return undefined;
  if (s.expires_at < nowIso()) {
    ctx.db.run('DELETE FROM sessions WHERE id = ?', sid);
    return undefined;
  }
  // przedłużenie sesji przy aktywności
  const exp = nowDate();
  exp.setHours(exp.getHours() + SESSION_HOURS);
  const newExp = toLocalIso(exp);
  if (newExp.slice(0, 13) !== s.expires_at.slice(0, 13)) ctx.db.run('UPDATE sessions SET expires_at = ? WHERE id = ?', newExp, sid);
  return loadUser(ctx, s.operator_id);
}

export function requireUser(req: FastifyRequest): User {
  if (!req.user) throw new HttpError(401, 'Sesja wygasła. Zaloguj się ponownie.');
  return req.user;
}
export function requireRole(req: FastifyRequest, ...roles: Role[]): User {
  const u = requireUser(req);
  if (!roles.includes(u.role)) throw forbidden();
  return u;
}
export const isAdmin = (u: User) => u.role === 'admin';
export const isManager = (u: User) => u.role === 'admin' || u.role === 'kierownik';

/** Operatorzy, których dane (zadania, raporty) widzi użytkownik. `null` = wszyscy. */
export function visibleOperatorIds(ctx: Ctx, u: User): number[] | null {
  if (u.role === 'admin') return null;
  if (u.role === 'kierownik') {
    const ids = new Set<number>([u.id]);
    let frontier = [u.id];
    while (frontier.length) {
      const next = ctx.db
        .all<{ id: number }>(`SELECT id FROM operators WHERE manager_id IN (${frontier.map(() => '?').join(',')})`, ...frontier)
        .map((r) => r.id)
        .filter((id) => !ids.has(id));
      next.forEach((id) => ids.add(id));
      frontier = next;
    }
    return [...ids];
  }
  return [u.id];
}
export function canSeeOperator(ctx: Ctx, u: User, operatorId: number): boolean {
  const v = visibleOperatorIds(ctx, u);
  return v === null || v.includes(operatorId);
}

/** Tworzy konto administratora przy pierwszym uruchomieniu. Zwraca hasło startowe, jeśli konto powstało. */
export function ensureAdmin(ctx: Ctx): string | null {
  const any = ctx.db.get('SELECT id FROM operators LIMIT 1');
  if (any) return null;
  const pw = process.env.DIAGNOS_ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url') + '7a';
  ctx.db.insert('operators', {
    login: 'admin',
    name: 'Administrator',
    role: 'admin',
    password_hash: hashPassword(pw),
    must_change_password: 1,
    created_at: nowIso(),
  });
  if (!process.env.DIAGNOS_ADMIN_PASSWORD) {
    fs.writeFileSync(
      path.join(ctx.config.dataDir, 'haslo-startowe-admin.txt'),
      `Login: admin\nHasło startowe: ${pw}\nHasło trzeba zmienić przy pierwszym logowaniu; po zmianie ten plik zostanie usunięty.\n`,
      { mode: 0o600 },
    );
  }
  return pw;
}
