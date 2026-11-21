import type { Db } from './db.js';

// ---------- Daty ----------
// Wszystkie daty w bazie to lokalny czas firmy (Europe/Warsaw) w formacie ISO bez strefy:
// 'YYYY-MM-DD' dla dat i 'YYYY-MM-DDTHH:MM:SS' dla momentów. Porównania tekstowe są poprawne.

const pad = (n: number) => String(n).padStart(2, '0');

let clockOffsetMs = 0;
/** Tylko do testów: przesuwa zegar aplikacji. */
export function setClockOffset(ms: number) {
  clockOffsetMs = ms;
}
export function nowDate(): Date {
  return new Date(Date.now() + clockOffsetMs);
}
export function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const nowIso = () => toLocalIso(nowDate());
export const todayIso = () => toLocalDate(nowDate());

/** Parsuje 'YYYY-MM-DD' lub 'YYYY-MM-DDTHH:MM[:SS]' jako czas lokalny. */
export function parseLocal(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return new Date(NaN);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}
export function addMinutesIso(iso: string, min: number): string {
  const d = parseLocal(iso);
  d.setMinutes(d.getMinutes() + min);
  return toLocalIso(d);
}
export function addDaysDate(date: string, days: number): string {
  const d = parseLocal(date);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}
export function minutesBetween(a: string, b: string): number {
  return Math.round((parseLocal(b).getTime() - parseLocal(a).getTime()) / 60000);
}
/** Dzień tygodnia 1 = poniedziałek … 7 = niedziela. */
export function isoWeekday(date: string): number {
  const d = parseLocal(date).getDay();
  return d === 0 ? 7 : d;
}
export function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
export function fmtDatePl(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}
export function fmtDateTimePl(iso?: string | null): string {
  if (!iso) return '';
  return `${fmtDatePl(iso)} ${iso.slice(11, 16)}`;
}
export function fmtMoney(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------- Walidacja ----------
export function normalizeNip(nip?: string | null): string {
  return (nip ?? '').replace(/[^0-9]/g, '');
}
export function isValidNip(nip?: string | null): boolean {
  const n = normalizeNip(nip);
  if (!/^\d{10}$/.test(n)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((s, wi, i) => s + wi * +n[i], 0);
  const c = sum % 11;
  return c !== 10 && c === +n[9];
}
export function isValidRegon(regon?: string | null): boolean {
  const r = (regon ?? '').replace(/[^0-9]/g, '');
  if (r.length === 9) {
    const w = [8, 9, 2, 3, 4, 5, 6, 7];
    const c = (w.reduce((s, wi, i) => s + wi * +r[i], 0) % 11) % 10;
    return c === +r[8];
  }
  if (r.length === 14) {
    const w = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8];
    const c = (w.reduce((s, wi, i) => s + wi * +r[i], 0) % 11) % 10;
    return c === +r[13];
  }
  return false;
}
export function isValidEmail(e?: string | null): boolean {
  return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

// ---------- Numeracja ----------
/** Kolejny numer licznika (atomowo, w transakcji wywołującego). */
export function nextCounter(db: Db, name: string): number {
  const row = db.get<{ value: number }>('SELECT value FROM counters WHERE name = ?', name);
  const v = (row?.value ?? 0) + 1;
  if (row) db.run('UPDATE counters SET value = ? WHERE name = ?', v, name);
  else db.run('INSERT INTO counters (name, value) VALUES (?, ?)', name, v);
  return v;
}
/** Numer w stylu DIAGNOS/50/20261121 (korespondencja) lub DIAGNOS/D/15/20261121 (dokumenty). */
export function makeNumber(db: Db, kind: 'K' | 'D' | 'ZAM' | 'PRJ' | 'OF', dateIso?: string): string {
  const d = (dateIso ?? nowIso()).slice(0, 10);
  const year = d.slice(0, 4);
  const n = nextCounter(db, `${kind}-${year}`);
  const ymd = d.replace(/-/g, '');
  if (kind === 'K') return `DIAGNOS/${n}/${ymd}`;
  if (kind === 'D') return `DIAGNOS/D/${n}/${ymd}`;
  return `DIAGNOS/${kind}/${n}/${year}`;
}

// ---------- Szablony tekstowe ----------
/** Podstawia {{klucz}} lub {{a.b}} wartościami z obiektu. Brakujące pola dają pusty tekst. */
export function renderTemplate(tpl: string, data: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = key.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), data);
    return v == null ? '' : String(v);
  });
}

// ---------- CSV ----------
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function parseNumberPl(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\s|zł|PLN/gi, '').replace(/ /g, '');
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Akceptuje DD.MM.RRRR, RRRR-MM-DD i obiekty Date; zwraca RRRR-MM-DD. */
export function parseDatePl(v: any): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const s = String(v).trim();
  let m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/.exec(s);
  let ymd: [number, number, number] | null = null;
  if (m) ymd = [+m[3], +m[2], +m[1]];
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) ymd = [+m[1], +m[2], +m[3]];
  if (!ymd) return null;
  const t = new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2]));
  if (t.getUTCFullYear() !== ymd[0] || t.getUTCMonth() !== ymd[1] - 1 || t.getUTCDate() !== ymd[2]) return null; // np. 31.02
  return `${ymd[0]}-${pad(ymd[1])}-${pad(ymd[2])}`;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const bad = (msg: string) => new HttpError(400, msg);
export const forbidden = (msg = 'Brak uprawnień do wykonania tej operacji.') => new HttpError(403, msg);
export const notFound = (msg = 'Nie znaleziono rekordu.') => new HttpError(404, msg);

export function audit(db: Db, operatorId: number | null, entity: string, entityId: number | null, action: string, details?: any) {
  db.insert('audit_log', { at: nowIso(), operator_id: operatorId, entity, entity_id: entityId, action, details: details ? JSON.stringify(details) : null });
}

export function toInt(v: any): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
export function toNum(v: any): number | null {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseNumberPl(v);
  return n == null || !Number.isFinite(n) ? null : n;
}
export function str(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
