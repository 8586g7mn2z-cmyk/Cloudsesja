import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Db } from './db.js';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  filesDir: string;
  clientDir: string;
  secret: Buffer;
  /** Czy uruchamiać scheduler w tle (wyłączany w testach). */
  scheduler: boolean;
  schedulerIntervalMs: number;
  cookieSecure: boolean;
}

export interface Ctx {
  db: Db;
  config: Config;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = path.resolve(overrides.dataDir ?? process.env.DIAGNOS_DATA_DIR ?? './data');
  fs.mkdirSync(dataDir, { recursive: true });
  const filesDir = path.join(dataDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });
  let secret: Buffer;
  if (process.env.DIAGNOS_SECRET) secret = crypto.createHash('sha256').update(process.env.DIAGNOS_SECRET).digest();
  else {
    const keyFile = path.join(dataDir, 'secret.key');
    if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    secret = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    clientDir: path.resolve(process.env.DIAGNOS_CLIENT_DIR ?? './dist/client'),
    scheduler: true,
    schedulerIntervalMs: Number(process.env.DIAGNOS_SCHEDULER_MS ?? 20000),
    cookieSecure: process.env.DIAGNOS_COOKIE_SECURE === '1',
    ...overrides,
    dataDir,
    filesDir,
    secret,
  };
}

export function openDb(config: Config, file?: string): Db {
  const db = new Db(file ?? path.join(config.dataDir, 'diagnos.sqlite'));
  db.migrate();
  return db;
}

// Szyfrowanie sekretów (hasło SMTP, klucz bramki SMS) przechowywanych w bazie.
export function encryptSecret(ctx: Ctx, plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ctx.config.secret, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}
export function decryptSecret(ctx: Ctx, value: string | null | undefined): string {
  if (!value) return '';
  const [v, iv, tag, data] = value.split(':');
  if (v !== 'v1') return '';
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', ctx.config.secret, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function getSetting<T = any>(ctx: Ctx, key: string, def: T): T {
  const r = ctx.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  if (!r) return def;
  try {
    return { ...(def as any), ...JSON.parse(r.value) };
  } catch {
    return def;
  }
}
export function setSetting(ctx: Ctx, key: string, value: any) {
  const v = JSON.stringify(value);
  if (ctx.db.get('SELECT key FROM settings WHERE key = ?', key)) ctx.db.run('UPDATE settings SET value = ? WHERE key = ?', v, key);
  else ctx.db.run('INSERT INTO settings (key, value) VALUES (?, ?)', key, v);
}
