const pad = (n: number) => String(n).padStart(2, '0');

export function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!d) return iso;
  return `${d}.${m}.${y}`;
}
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  return iso.length > 10 ? `${fmtDate(iso)} ${iso.slice(11, 16)}` : fmtDate(iso);
}
export function fmtTime(iso?: string | null): string {
  return iso ? iso.slice(11, 16) : '';
}
export function fmtMoney(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}
export function fmtNumber(v: any, digits = 2): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('pl-PL', { maximumFractionDigits: digits }) : '';
}
export function fmtSize(b: any): string {
  const n = Number(b ?? 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kB`;
  return `${(n / 1024 / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} MB`;
}
export function fmtDuration(sec: any): string {
  const s = Math.max(0, Math.round(Number(sec ?? 0)));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
export function fmtMinutes(min: any): string {
  const m = Math.round(Number(min ?? 0));
  if (!m) return '';
  return `${Math.floor(m / 60)}:${pad(m % 60)} h`;
}
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function toIsoDateTime(d: Date): string {
  return `${toIsoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function parseIso(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return new Date(NaN);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
}
export const today = () => toIsoDate(new Date());
export function addDays(date: string, n: number): string {
  const d = parseIso(date);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}
export function addMinutes(dt: string, n: number): string {
  const d = parseIso(dt);
  d.setMinutes(d.getMinutes() + n);
  return toIsoDateTime(d);
}
export function weekStart(date: string): string {
  const d = parseIso(date);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return toIsoDate(d);
}
export const WEEKDAYS = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
export const WEEKDAYS_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
export const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
export function weekdayIdx(date: string) {
  return (parseIso(date).getDay() + 6) % 7;
}
export function longDate(date: string) {
  const d = parseIso(date);
  return `${WEEKDAYS[weekdayIdx(date)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}
export const PRIORITIES: Record<number, string> = { 1: 'niski', 2: 'normalny', 3: 'wysoki', 4: 'pilny' };

export function isValidNip(nip: string): boolean {
  const n = (nip ?? '').replace(/\D/g, '');
  if (n.length !== 10) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const c = w.reduce((s, wi, i) => s + wi * +n[i], 0) % 11;
  return c !== 10 && c === +n[9];
}
export function fmtNip(nip?: string | null): string {
  const n = (nip ?? '').replace(/\D/g, '');
  return n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6, 8)}-${n.slice(8)}` : nip ?? '';
}
export const VOIVODESHIPS = ['dolnośląskie', 'kujawsko-pomorskie', 'lubelskie', 'lubuskie', 'łódzkie', 'małopolskie', 'mazowieckie', 'opolskie', 'podkarpackie', 'podlaskie', 'pomorskie', 'śląskie', 'świętokrzyskie', 'warmińsko-mazurskie', 'wielkopolskie', 'zachodniopomorskie'];
