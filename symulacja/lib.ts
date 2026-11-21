// Wspólne narzędzia symulacji: generator losowy, daty, klient API (operator-bot), rejestr sprawdzeń,
// przechwytujący serwer SMTP i atrapa bramki SMS.
import http from 'node:http';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { SMTPServer } from 'smtp-server';
import { simpleParser, type ParsedMail } from 'mailparser';

// ---------- Losowość (powtarzalna dla danego ziarna) ----------
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    // mulberry32
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: readonly [T, number][]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of items) if ((r -= w) < 0) return v;
    return items[items.length - 1][0];
  }
}

// ---------- Daty (liczone niezależnie od kodu aplikacji) ----------
const pad = (n: number) => String(n).padStart(2, '0');
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function parseIso(s: string): Date {
  const [d, t = '00:00:00'] = s.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [h, mi, se = 0] = t.split(':').map(Number);
  return new Date(y, m - 1, dd, h, mi, se);
}
/** Dodaje dni do daty kalendarzowej 'YYYY-MM-DD' (arytmetyka w UTC, bez wpływu zmiany czasu). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function daysBetween(a: string, b: string): number {
  const f = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((f(b) - f(a)) / 86400000);
}
/** 1 = poniedziałek … 7 = niedziela. */
export function weekday(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
export function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function addMin(iso: string, min: number): string {
  const d = parseIso(iso);
  d.setMinutes(d.getMinutes() + min);
  return isoLocal(d);
}
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const plDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

// ---------- Rejestr sprawdzeń ----------
export interface CheckStat {
  name: string;
  area: string;
  pass: number;
  fail: number;
  details: string[];
}
export class Checks {
  stats = new Map<string, CheckStat>();
  now: () => string = () => '';
  check(area: string, name: string, ok: boolean, detail?: string | (() => string)) {
    const key = `${area}|${name}`;
    let s = this.stats.get(key);
    if (!s) this.stats.set(key, (s = { name, area, pass: 0, fail: 0, details: [] }));
    if (ok) s.pass++;
    else {
      s.fail++;
      if (s.details.length < 8) s.details.push(`[${this.now()}] ${typeof detail === 'function' ? detail() : detail ?? ''}`.trim());
    }
    return ok;
  }
  eq(area: string, name: string, actual: any, expected: any, ctx = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    return this.check(area, name, a === e, () => `${ctx ? ctx + ': ' : ''}jest ${a.slice(0, 400)}, powinno być ${e.slice(0, 400)}`);
  }
  near(area: string, name: string, actual: number, expected: number, ctx = '', tol = 0.011) {
    return this.check(area, name, Math.abs(Number(actual) - expected) <= tol, () => `${ctx ? ctx + ': ' : ''}jest ${actual}, powinno być ${expected}`);
  }
  get failed() {
    return [...this.stats.values()].filter((s) => s.fail > 0);
  }
  get totalPass() {
    return [...this.stats.values()].reduce((n, s) => n + s.pass, 0);
  }
  get totalFail() {
    return [...this.stats.values()].reduce((n, s) => n + s.fail, 0);
  }
}

// ---------- Klient API ----------
export interface Res {
  status: number;
  json: any;
  raw: Buffer;
  headers: Record<string, any>;
}
export class Bot {
  id = 0;
  cookie = '';
  relogins = 0;
  requests = 0;
  constructor(
    private app: FastifyInstance,
    private checks: Checks,
    public login: string,
    public password: string,
    public name: string,
    public role: 'admin' | 'kierownik' | 'handlowiec',
    public email: string,
    public phone: string,
  ) {}

  async signIn(): Promise<Res> {
    const r = await this.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: this.login, password: this.password } });
    if (r.statusCode === 200) this.cookie = String(r.headers['set-cookie']).split(';')[0];
    return { status: r.statusCode, json: safeJson(r.body), raw: r.rawPayload, headers: r.headers };
  }

  /** Żądanie bez żadnych założeń co do wyniku (do prób negatywnych). */
  async raw(method: string, url: string, body?: any, headers: Record<string, string> = {}): Promise<Res> {
    this.requests++;
    const send = () => this.app.inject({ method: method as any, url, payload: body, headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...headers } });
    let r = await send();
    if (r.statusCode === 401 && this.cookie) {
      // sesja wygasła (np. po nocy) — operator loguje się ponownie
      this.relogins++;
      const l = await this.signIn();
      if (l.status === 200) r = await send();
    }
    if (r.statusCode >= 500) this.checks.check('Stabilność', 'żądanie nie kończy się błędem serwera (5xx)', false, `${this.login} ${method} ${url} → ${r.statusCode} ${r.body.slice(0, 200)}`);
    return { status: r.statusCode, json: safeJson(r.body), raw: r.rawPayload, headers: r.headers };
  }

  /** Żądanie, które w poprawnie działającym systemie musi się udać. */
  async ok(method: string, url: string, body?: any): Promise<any> {
    const r = await this.raw(method, url, body);
    this.checks.check('Stabilność', 'poprawna operacja operatora zostaje przyjęta', r.status >= 200 && r.status < 300, `${this.login} ${method} ${url} → ${r.status} ${JSON.stringify(r.json)?.slice(0, 300)} | dane: ${JSON.stringify(body ?? null).slice(0, 300)}`);
    return r.status < 300 ? r.json : null;
  }
  get = (url: string) => this.ok('GET', url);
  post = (url: string, body: any = {}) => this.ok('POST', url, body);
  put = (url: string, body: any = {}) => this.ok('PUT', url, body);
  patch = (url: string, body: any = {}) => this.ok('PATCH', url, body);
  del = (url: string) => this.ok('DELETE', url);

  async upload(url: string, fields: Record<string, string>, file: { name: string; content: Buffer; type?: string }, expectOk = true): Promise<Res> {
    const boundary = '----sym' + crypto.randomBytes(8).toString('hex');
    const parts: Buffer[] = [];
    for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type ?? 'application/octet-stream'}\r\n\r\n`));
    parts.push(file.content, Buffer.from(`\r\n--${boundary}--\r\n`));
    const r = await this.raw('POST', url, Buffer.concat(parts), { 'content-type': `multipart/form-data; boundary=${boundary}` });
    if (expectOk) this.checks.check('Stabilność', 'poprawna operacja operatora zostaje przyjęta', r.status < 300, `${this.login} upload ${url} → ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`);
    return r;
  }
}
function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ---------- Przechwytujący serwer SMTP z możliwością symulacji awarii ----------
export async function startSmtpCapture() {
  const messages: (ParsedMail & { rcpt: string[] })[] = [];
  const state = { down: false, rejected: 0 };
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onAuth: (auth, _s, cb) => cb(null, { user: auth.username }),
    onConnect(_s, cb) {
      if (state.down) {
        state.rejected++;
        return cb(Object.assign(new Error('Serwer chwilowo niedostępny'), { responseCode: 421 }));
      }
      cb();
    },
    onData(stream, session, cb) {
      simpleParser(stream).then((m) => {
        messages.push(Object.assign(m, { rcpt: session.envelope.rcptTo.map((r) => r.address) }));
        cb();
      }, cb);
    },
  });
  server.on('error', () => undefined);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = ((server as any).server.address() as any).port as number;
  return { port, messages, state, close: () => new Promise<void>((r) => server.close(() => r())) };
}

// ---------- Atrapa bramki SMS (HTTP) ----------
export async function startSmsGateway() {
  const messages: { to: string; message: string; from: string }[] = [];
  const state = { down: false };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (state.down) {
        res.writeHead(503);
        return res.end('gateway down');
      }
      try {
        messages.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status":"OK"}');
      } catch {
        res.writeHead(400);
        res.end('bad json');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as any).port as number;
  return { port, messages, state, close: () => new Promise<void>((r) => server.close(() => r())) };
}

// ---------- Dane fikcyjne ----------
const ROOTS = ['Agro', 'Bud', 'Chem', 'Dom', 'Eko', 'Fer', 'Geo', 'Hydro', 'Inter', 'Kam', 'Lux', 'Med', 'Nord', 'Opti', 'Pol', 'Rol', 'Stal', 'Tech', 'Uni', 'Vita', 'Wod', 'Zen'];
const SUFF = ['max', 'pol', 'tech', 'bud', 'trans', 'serwis', 'net', 'land', 'mar', 'plast', 'met', 'system', 'kom', 'trade'];
const FORMS = ['Sp. z o.o.', 'S.A.', 'sp.j.', 's.c.', 'Sp. z o.o. sp.k.'];
export const CITIES: [string, string, string][] = [
  ['Warszawa', 'mazowieckie', '00-950'], ['Kraków', 'małopolskie', '30-001'], ['Łódź', 'łódzkie', '90-001'], ['Wrocław', 'dolnośląskie', '50-001'],
  ['Poznań', 'wielkopolskie', '60-001'], ['Gdańsk', 'pomorskie', '80-001'], ['Szczecin', 'zachodniopomorskie', '70-001'], ['Bydgoszcz', 'kujawsko-pomorskie', '85-001'],
  ['Lublin', 'lubelskie', '20-001'], ['Białystok', 'podlaskie', '15-001'], ['Katowice', 'śląskie', '40-001'], ['Rzeszów', 'podkarpackie', '35-001'],
  ['Świętochłowice', 'śląskie', '41-600'], ['Żywiec', 'śląskie', '34-300'], ['Ełk', 'warmińsko-mazurskie', '19-300'],
];
const FIRST = ['Anna', 'Piotr', 'Katarzyna', 'Tomasz', 'Małgorzata', 'Łukasz', 'Żaneta', 'Grzegorz', 'Elżbieta', 'Paweł', 'Świętosław', 'Józef', 'Agnieszka', 'Michał'];
const LAST = ['Nowak', 'Kowalski', 'Wiśniewska', 'Wójcik', 'Kamińska', 'Lewandowski', 'Zielińska', 'Szymański', 'Dąbrowska', 'Kozłowski', 'Jabłońska', 'Żółć', 'Ćwikła', 'Źrebiec'];
const STREETS = ['Długa', 'Słoneczna', 'Mickiewicza', 'Żeromskiego', 'Łąkowa', 'Ogrodowa', 'Kościuszki', 'Świętojańska', '3 Maja', 'Źródlana'];

/** Poprawny NIP (suma kontrolna liczona tu, niezależnie od walidatora aplikacji). */
export function makeNip(rng: Rng): string {
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  for (;;) {
    const d = Array.from({ length: 9 }, (_, i) => (i === 0 ? rng.int(1, 9) : rng.int(0, 9)));
    const c = d.reduce((s, x, i) => s + x * w[i], 0) % 11;
    if (c !== 10) return d.join('') + c;
  }
}
export function makeRegon(rng: Rng): string {
  const w = [8, 9, 2, 3, 4, 5, 6, 7];
  const d = Array.from({ length: 8 }, () => rng.int(0, 9));
  const c = (d.reduce((s, x, i) => s + x * w[i], 0) % 11) % 10;
  return d.join('') + c;
}
let companySeq = 0;
export function makeCompany(rng: Rng) {
  const seq = ++companySeq;
  const short = `${rng.pick(ROOTS)}${rng.pick(SUFF)} ${seq}`.toUpperCase();
  const [city, voiv, postal] = rng.pick(CITIES);
  const slug = short.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return {
    name: `${short[0]}${short.slice(1).toLowerCase()} ${rng.pick(FORMS)}`,
    short_name: short,
    nip: makeNip(rng),
    regon: makeRegon(rng),
    street: `ul. ${rng.pick(STREETS)} ${rng.int(1, 120)}`,
    postal_code: postal,
    city,
    voivodeship: voiv,
    phone: `${rng.int(12, 95)} ${rng.int(100, 999)} ${rng.int(10, 99)} ${rng.int(10, 99)}`,
    email: `biuro@${slug}.example`,
    www: `www.${slug}.example`,
    slug,
  };
}
export function makePerson(rng: Rng, slug: string, n: number) {
  const first = rng.pick(FIRST);
  const last = rng.pick(LAST);
  const ascii = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  return {
    first_name: first,
    last_name: last,
    position: rng.pick(['Prezes zarządu', 'Kierownik zakupów', 'Dyrektor handlowy', 'Główna księgowa', 'Specjalista ds. zaopatrzenia']),
    phone: `${rng.int(12, 95)} ${rng.int(100, 999)} ${rng.int(10, 99)} ${rng.int(10, 99)}`,
    mobile: `${rng.int(500, 799)} ${rng.int(100, 999)} ${rng.int(100, 999)}`,
    email: `${ascii(first)[0]}.${ascii(last)}${n}@${slug}.example`,
  };
}

/** Minimalny poprawny plik PDF o zadanej treści identyfikującej (do sprawdzania zgodności bajtów). */
export function fakeFile(label: string, ext = 'pdf'): Buffer {
  if (ext === 'pdf') return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
  return Buffer.from(`Plik symulacji: ${label}\nzażółć gęślą jaźń\n`, 'utf8');
}
export const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
