// Symulacja pracy firmy w DIAGNOS CRM.
//
// Uruchamia prawdziwy serwer aplikacji na pustej bazie, przesuwa jego zegar i przez kilka tygodni
// „czasu firmy" wykonuje pracę zespołu operatorów przez to samo API, z którego korzysta przeglądarka.
// Równolegle prowadzi własną, niezależną księgę tego, co powinno być w systemie, i porównuje ją
// z odpowiedziami aplikacji (rejestry, przypomnienia, wiadomości, e-maile, SMS-y, raporty, uprawnienia).
//
// Uruchomienie:  npm run symulacja -- [--dni 33] [--start 2026-03-02] [--seed 7] [--bez-ui] [--zostaw]
process.env.TZ = 'Europe/Warsaw';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { buildApp } from '../server/src/app.js';
import { loadConfig, openDb, type Ctx } from '../server/src/context.js';
import { ensureAdmin } from '../server/src/auth.js';
import { setClockOffset } from '../server/src/util.js';
import { tick } from '../server/src/services/scheduler.js';
import { Bot, Checks, Rng, addDays, addMin, daysBetween, fakeFile, lastDay, makeCompany, makeNip, makePerson, parseIso, plDate, round2, sha, startSmsGateway, startSmtpCapture, weekday } from './lib.js';
import { writeReport } from './raport.js';
import { runUi } from './ui.js';

// ---------- Parametry ----------
const argv = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const START = arg('start', '2026-03-02'); // poniedziałek; domyślny okres obejmuje zmianę czasu 29.03 i koniec miesiąca
const DAYS = Number(arg('dni', '33'));
const SEED = Number(arg('seed', '7'));
const WITH_UI = !argv.includes('--bez-ui');
const KEEP = argv.includes('--zostaw');
const INTENSITY = Number(arg('intensywnosc', '0.3'));

const rng = new Rng(SEED);
const C = new Checks();
let simNow = `${START}T07:30:00`;
C.now = () => simNow.replace('T', ' ').slice(0, 16);
const today = () => simNow.slice(0, 10);
function setNow(iso: string) {
  simNow = iso.length === 16 ? `${iso}:00` : iso;
  setClockOffset(parseIso(simNow).getTime() - Date.now());
}
const hhmm = () => simNow.slice(11, 16);
const slotIso = (date: string, time: string) => `${date}T${time}:00`;

// ---------- Księga (niezależny model tego, co powinno być w systemie) ----------
interface MContractor { id: number; name: string; short: string; city: string; ownerId: number; email: string | null; active: boolean; isKey: boolean; groupId: number | null; statusId: number | null; contacts: { id: number; email: string | null; name: string }[]; imported?: boolean }
interface MCorr { id: number; op: number; kind: string; dir: 'in' | 'out'; eventAt: string; dur: number; contractorId: number | null; projectId: number | null; deleted: boolean; sent?: boolean }
interface MTask { id: number; title: string; start: string; end: string; ops: number[]; principal: number | null; createdBy: number | null; status: 'new' | 'in_progress' | 'done' | 'cancelled'; progress: number; contractorId: number | null; projectId: number | null; deleted: boolean; doneAt?: string; seriesId?: number; ruleId?: number; remind?: { before: number; inapp: boolean; email: boolean; sms: boolean } }
interface MRem { taskId: number; op: number; remindAt: string; inapp: boolean; email: boolean; sms: boolean; state: 'waiting' | 'due' | 'acked' | 'gone' | 'maybe'; snoozeUntil?: string; text: string; subject: string }
interface MSale { id: number; op: number | null; contractorId: number; date: string; net: number; gross: number }
interface MTime { op: number; date: string; min: number; contractorId: number | null; projectId: number | null }
interface MMsg { id: number; sender: number; recipients: number[]; deliverAt: string; subject: string; read: Set<number>; deleted?: boolean }
interface MSeries { id: number; title: string; createdBy: number; ops: number[]; dates: (from: string, to: string) => string[]; timeFrom: string; timeTo: string; remind?: MTask['remind']; createdDay: string }
interface MDoc { id: number; name: string; folderId: number | null; authorId: number; contractorId: number | null; validTo: string | null; versions: string[]; restricted?: boolean }

const M = {
  contractors: new Map<number, MContractor>(),
  corr: new Map<number, MCorr>(),
  tasks: new Map<number, MTask>(),
  rems: [] as MRem[],
  sales: [] as MSale[],
  orders: 0,
  projects: [] as { id: number; contractorId: number | null; stageIds: number[] }[],
  products: [] as { id: number; name: string; price: number; vat: number }[],
  time: [] as MTime[],
  msgs: [] as MMsg[],
  series: [] as MSeries[],
  docs: [] as MDoc[],
  emails: new Map<string, number>(), // oczekiwane e-maile: "adres|temat" → liczba
  sms: new Map<string, number>(), // oczekiwane SMS-y: "numer|treść" → liczba
  log: [] as string[],
  counters: {} as Record<string, number>,
};
const bump = (k: string, n = 1) => (M.counters[k] = (M.counters[k] ?? 0) + n);
const expectEmail = (to: string, subject: string, n = 1) => M.emails.set(`${to}|${subject}`, (M.emails.get(`${to}|${subject}`) ?? 0) + n);
const expectSms = (to: string, text: string, n = 1) => M.sms.set(`${to}|${text}`, (M.sms.get(`${to}|${text}`) ?? 0) + n);
const note = (s: string) => M.log.push(`${simNow.replace('T', ' ').slice(0, 16)}  ${s}`);

// ---------- Środowisko ----------
const outDir = path.resolve('symulacja/wyniki', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
const dataDir = path.join(outDir, 'dane');
fs.mkdirSync(dataDir, { recursive: true });
const ADMIN_START_PW = 'Start12345';
const PW = 'Symulacja2026';

let ctx: Ctx;
let app: Awaited<ReturnType<typeof buildApp>>;
let smtp: Awaited<ReturnType<typeof startSmtpCapture>>;
let smsGw: Awaited<ReturnType<typeof startSmsGateway>>;
let admin: Bot, kier: Bot, serwis: Bot;
let team: Bot[] = []; // handlowcy podlegli kierownikowi
let bots: Bot[] = []; // wszyscy pracujący operatorzy
const byId = new Map<number, Bot>();
let D: Record<string, any[]> = {}; // słowniki
const dict = (d: string, name: string) => D[d].find((x) => x.name === name)!.id as number;
const kindId = (code: string) => D.corr_kind.find((x) => x.code === code)!.id as number;
const kindName = (code: string) => D.corr_kind.find((x) => x.code === code)!.name as string;
const statusId = (code: string) => D.task_status.find((x) => x.code === code)!.id as number;
let folders: Record<string, number> = {};
let deps: Record<string, number> = {};
let templates: any[] = [];
let ruleContact: any, ruleOrder: any;

async function runTick() {
  await tick(ctx);
}

// ---------- Rejestracja zdarzeń w księdze ----------
function addReminders(t: MTask) {
  if (!t.remind) return;
  for (const op of t.ops) {
    const b = byId.get(op);
    M.rems.push({ taskId: t.id, op, remindAt: addMin(t.start, -t.remind.before), inapp: t.remind.inapp, email: t.remind.email, sms: t.remind.sms, state: 'waiting', text: reminderText(t), subject: `Przypomnienie: ${t.title}` });
    void b;
  }
}
function reminderText(t: MTask): string {
  const c = t.contractorId ? M.contractors.get(t.contractorId) : null;
  return `Przypomnienie DIAGNOS CRM: ${t.title}${c ? ` (${c.short || c.name})` : ''}, termin ${plDate(t.start)} ${t.start.slice(11, 16)}.`;
}
function dropReminders(taskId: number, to: MRem['state'] = 'gone') {
  for (const r of M.rems) if (r.taskId === taskId && (r.state === 'waiting' || r.state === 'due' || r.state === 'maybe')) r.state = to;
}
function fireReminder(r: MRem) {
  const b = byId.get(r.op)!;
  if (r.email && b.email) expectEmail(b.email, r.subject);
  if (r.sms && b.phone) expectSms(b.phone, r.text);
  bump('przypomnienia');
}

// ---------- Kroki scenariusza: przygotowanie firmy ----------
async function bootstrap() {
  process.env.DIAGNOS_ADMIN_PASSWORD = ADMIN_START_PW;
  const config = loadConfig({ dataDir, scheduler: false, clientDir: path.resolve(process.env.DIAGNOS_CLIENT_DIR ?? 'dist/client') });
  ctx = { db: openDb(config), config };
  setNow(simNow);
  ensureAdmin(ctx);
  app = await buildApp(ctx);
  smtp = await startSmtpCapture();
  smsGw = await startSmsGateway();

  // 1. Bez sesji żaden zasób API nie jest dostępny.
  const routes = (app.printRoutes({ commonPrefix: false }) as string).split('\n');
  void routes;
  for (const url of ['/api/contractors', '/api/tasks', '/api/documents', '/api/operators', '/api/settings/smtp', '/api/outbox', '/api/reports/sales', '/api/attachments/1/file', '/api/documents/1/file', '/api/audit']) {
    const r = await app.inject({ method: 'GET', url });
    C.check('Logowanie i sesje', 'bez zalogowania API odpowiada 401', r.statusCode === 401, `${url} → ${r.statusCode}`);
  }

  for (const url of ['/%61pi/operators', '/%61pi/dicts', '/API/operators', '/api//operators', '/%2fapi/operators', '/api/%6fperators']) {
    const r = await app.inject({ method: 'GET', url });
    C.check('Logowanie i sesje', 'zakodowany lub zniekształcony adres nie omija logowania', r.statusCode === 401 || r.statusCode === 404 || r.statusCode === 400 || String(r.headers['content-type']).includes('text/html'), `${url} → ${r.statusCode} ${r.body.slice(0, 80)}`);
  }

  // 2. Administrator: wymuszona zmiana hasła startowego.
  admin = new Bot(app, C, 'admin', ADMIN_START_PW, 'Administrator', 'admin', '', '');
  const l = await admin.signIn();
  C.check('Logowanie i sesje', 'logowanie hasłem startowym wymaga zmiany hasła', l.status === 200 && l.json?.must_change_password === true, JSON.stringify(l.json));
  const blocked = await admin.raw('GET', '/api/contractors');
  C.check('Logowanie i sesje', 'przed zmianą hasła startowego API jest zablokowane', blocked.status === 403, `GET /api/contractors → ${blocked.status}`);
  const weak = await admin.raw('POST', '/api/auth/password', { current: ADMIN_START_PW, password: 'abc' });
  C.check('Logowanie i sesje', 'słabe hasło jest odrzucane', weak.status === 400, `→ ${weak.status}`);
  await admin.post('/api/auth/password', { current: ADMIN_START_PW, password: PW });
  admin.password = PW;
  await admin.signIn();
  const me = await admin.get('/api/auth/me');
  admin.id = me.user.id;
  byId.set(admin.id, admin);
  const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', password: ADMIN_START_PW } });
  C.check('Logowanie i sesje', 'stare hasło przestaje działać', bad.statusCode === 401, `→ ${bad.statusCode}`);

  D = (await admin.get('/api/dicts')).items;
  for (const d of await admin.get('/api/departments')) deps[d.name] = d.id;
  for (const f of await admin.get('/api/doc-folders')) folders[f.name] = f.id;
  templates = (await admin.get('/api/doc-templates')).templates;

  // 3. Operatorzy.
  const mk = async (login: string, name: string, role: Bot['role'], dep: string, manager: Bot | null) => {
    const email = `${login}@diagnos.example`;
    const phone = `6${String(100000000 + rng.int(0, 99999999)).slice(1)}`;
    const r = await admin.post('/api/operators', { login, name, role, email, phone, manager_id: manager?.id ?? null, departments: [deps[dep]], password: 'Start' + PW });
    const b = new Bot(app, C, login, 'Start' + PW, name, role, email, phone);
    b.id = r.id;
    const first = await b.signIn();
    const blk = await b.raw('GET', '/api/tasks');
    C.check('Logowanie i sesje', 'nowy operator musi zmienić hasło przy pierwszym logowaniu', first.json?.must_change_password === true && blk.status === 403, `${login}: ${blk.status}`);
    await b.post('/api/auth/password', { current: 'Start' + PW, password: PW });
    b.password = PW;
    await b.signIn();
    byId.set(b.id, b);
    return b;
  };
  kier = await mk('jkowalska', 'Joanna Kowalska', 'kierownik', 'Dział handlowy', null);
  team = [
    await mk('pnowak', 'Piotr Nowak', 'handlowiec', 'Dział handlowy', kier),
    await mk('mwisniewska', 'Maria Wiśniewska', 'handlowiec', 'Dział handlowy', kier),
    await mk('tzielinski', 'Tomasz Zieliński', 'handlowiec', 'Dział handlowy', kier),
    await mk('akrawczyk', 'Agnieszka Krawczyk', 'handlowiec', 'Dział handlowy', kier),
  ];
  serwis = await mk('lserwis', 'Łukasz Żak', 'handlowiec', 'Serwis', null);
  bots = [kier, ...team, serwis];

  // 4. Blokada po serii błędnych haseł (osobne konto, żeby nie blokować pracujących operatorów).
  await admin.post('/api/operators', { login: 'testblokady', name: 'Konto testowe', role: 'handlowiec', password: 'Start' + PW });
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'testblokady', password: 'zle' + i } })).statusCode;
  const locked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'testblokady', password: 'Start' + PW } });
  C.check('Logowanie i sesje', 'po 5 błędnych hasłach konto jest chwilowo blokowane', locked.statusCode !== 200, `ostatnia próba ${last}, poprawne hasło po serii błędów → ${locked.statusCode}`);

  // 5. Konfiguracja firmy: pola dodatkowe, dane firmy, reguła, harmonogramy raportów, uprawnienia segregatora.
  await admin.post('/api/custom-fields', { label: 'Liczba pracowników', type: 'number' });
  await admin.post('/api/custom-fields', { label: 'Umowa serwisowa', type: 'bool' });
  await admin.post('/api/custom-fields', { label: 'Segment', type: 'select', options: ['A', 'B', 'C'] });
  await admin.put('/api/settings/company', { name: 'DIAGNOS Sp. z o.o.', address: 'ul. Przemysłowa 12, 30-701 Kraków', nip: '6762466740', bank_account: '11 1020 0000 0000 0000 0000 0001' });
  const rules = (await admin.get('/api/auto-rules')).rules;
  ruleContact = rules.find((r: any) => r.event === 'contractor.created');
  const ro = await admin.post('/api/auto-rules', { name: 'Potwierdzenie zamówienia', event: 'order.created', delay_days: 1, time_of_day: '08:30', duration_min: 30, title_tpl: 'Potwierdź zamówienie {{numer}}', assign_to: 'creator', priority: 3 });
  ruleOrder = { id: ro.id };
  await admin.post('/api/report-schedules', { name: 'Tygodniowa statystyka zadań', report_type: 'tasks', period: 'last_7_days', frequency: 'weekly', weekday: 5, time_of_day: '16:30', recipients: 'zarzad@diagnos.example' });
  await admin.post('/api/report-schedules', { name: 'Miesięczna sprzedaż', report_type: 'sales', period: 'current_month', frequency: 'month_last_day', time_of_day: '18:00', recipients: 'zarzad@diagnos.example, ksiegowosc@diagnos.example' });
  await admin.put(`/api/permissions/folder/${folders['Umowy']}`, { entries: [{ subject_type: 'department', subject_id: deps['Dział handlowy'], level: 'view' }, { subject_type: 'operator', subject_id: kier.id, level: 'edit' }] });

  // 6. Kartoteka towarowa.
  const prods: [string, number, number][] = [['Analizator AX-200', 12500, 23], ['Zestaw odczynników R-50', 349.9, 8], ['Przegląd serwisowy', 480, 23], ['Szkolenie stanowiskowe', 1900, 23], ['Wirówka laboratoryjna W-4', 7420.5, 23], ['Probówki 100 szt.', 36.99, 23], ['Licencja oprogramowania LIS', 3300, 23], ['Transport i instalacja', 650, 23]];
  for (const [name, price, vat] of prods) {
    const r = await admin.post('/api/products', { name, sku: `T-${M.products.length + 1}`, net_price: price, vat_rate: vat, unit: 'szt.' });
    M.products.push({ id: r.id, name, price, vat });
  }

  // 7. Zadania cykliczne.
  const day1 = START;
  const s1 = await kier.post('/api/task-series', { title: 'Zebranie zespołu handlowego', freq: 'weekly', interval_n: 1, weekdays: [1, 3], start_date: day1, time_from: '09:00', time_to: '09:30', operator_ids: [team[0].id, team[1].id] });
  M.series.push({ id: s1.id, title: 'Zebranie zespołu handlowego', createdBy: kier.id, ops: [team[0].id, team[1].id], timeFrom: '09:00', timeTo: '09:30', createdDay: day1, dates: (f, t) => range(f, t).filter((d) => [1, 3].includes(weekday(d))) });
  const end2 = addDays(day1, 20);
  const s2 = await team[2].post('/api/task-series', { title: 'Przegląd skrzynki ofertowej', freq: 'every_n_days', interval_n: 2, start_date: day1, end_date: end2, time_from: '15:00', time_to: '15:15', remind_before_min: 10, remind_email: true });
  M.series.push({ id: s2.id, title: 'Przegląd skrzynki ofertowej', createdBy: team[2].id, ops: [team[2].id], timeFrom: '15:00', timeTo: '15:15', createdDay: day1, remind: { before: 10, inapp: true, email: true, sms: false }, dates: (f, t) => range(f, t).filter((d) => d <= end2 && daysBetween(day1, d) % 2 === 0) });
  const s3 = await admin.post('/api/task-series', { title: 'Zamknięcie miesiąca', freq: 'monthly', interval_n: 1, month_day: 31, start_date: day1, time_from: '16:00', time_to: '16:30', operator_ids: [kier.id] });
  M.series.push({ id: s3.id, title: 'Zamknięcie miesiąca', createdBy: admin.id, ops: [kier.id], timeFrom: '16:00', timeTo: '16:30', createdDay: day1, dates: (f, t) => range(f, t).filter((d) => Number(d.slice(8, 10)) === lastDay(Number(d.slice(0, 4)), Number(d.slice(5, 7)))) });
  note('Założono firmę: 7 kont, pola dodatkowe, reguły, harmonogramy raportów, 3 serie zadań cyklicznych.');
}
function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------- Czynności operatorów ----------
async function expectRuleTask(b: Bot, contractorId: number, ownerId: number) {
  const tasks = await admin.get(`/api/tasks?contractor_id=${contractorId}&archived=1`);
  const mine = (tasks ?? []).filter((t: any) => t.rule_id === ruleContact.id && !M.tasks.has(t.id));
  const c = M.contractors.get(contractorId)!;
  const start = `${addDays(today(), 3)}T10:00:00`;
  const ok = mine.length === 1 && mine[0].start_at === start && JSON.stringify(mine[0].operator_ids) === JSON.stringify([ownerId]) && mine[0].title === `Kontakt z nowym kontrahentem: ${c.short || c.name}`;
  C.check('Zadania automatyczne', 'nowy kontrahent → jedno zadanie „kontakt” dla prowadzącego za 3 dni o 10:00', ok, () => `kontrahent ${c.name}: ${JSON.stringify(mine.map((t: any) => [t.title, t.start_at, t.operator_ids]))}`);
  for (const t of mine) {
    const mt: MTask = { id: t.id, title: t.title, start: t.start_at, end: t.end_at, ops: t.operator_ids, principal: b.id, createdBy: b.id, status: 'new', progress: 0, contractorId, projectId: null, deleted: false, ruleId: t.rule_id, remind: { before: 15, inapp: true, email: false, sms: false } };
    M.tasks.set(t.id, mt);
    addReminders(mt);
  }
}

async function addContractor(b: Bot) {
  const co = makeCompany(rng);
  const group = rng.pick(D.contractor_group);
  const subs = D.contractor_subgroup.filter((s) => s.parent_id === group.id);
  const status = rng.pick(D.contractor_status.filter((s) => s.name !== 'Zablokowany'));
  const isKey = rng.chance(0.25);
  const owner = b.role === 'kierownik' && rng.chance(0.5) ? rng.pick(team) : b;
  const body = {
    ...co, type_id: rng.pick(D.contractor_type).id, status_id: status.id, group_id: group.id, subgroup_id: subs.length ? rng.pick(subs).id : null,
    price_group_id: rng.pick(D.price_group).id, source_id: rng.pick(D.contact_source).id, owner_id: owner.id, is_key: isKey, credit_limit: rng.int(0, 20) * 1000,
    tax_office: `Urząd Skarbowy ${co.city}`, custom: { liczba_pracownikow: rng.int(3, 900), umowa_serwisowa: rng.chance(0.4), segment: rng.pick(['A', 'B', 'C']) },
  };
  const r = await b.post('/api/contractors', body);
  if (!r) return;
  const mc: MContractor = { id: r.id, name: co.name, short: co.short_name, city: co.city, ownerId: owner.id, email: co.email, active: true, isKey, groupId: group.id, statusId: status.id, contacts: [] };
  M.contractors.set(r.id, mc);
  bump('kontrahenci dodani ręcznie');
  const n = rng.int(0, 3);
  for (let i = 0; i < n; i++) {
    const p = makePerson(rng, co.slug, i);
    const withEmail = rng.chance(0.8);
    const pr = await b.post(`/api/contractors/${r.id}/contacts`, { ...p, email: withEmail ? p.email : '', is_primary: i === 0 });
    if (pr) mc.contacts.push({ id: pr.id, email: withEmail ? p.email : null, name: `${p.first_name} ${p.last_name}` });
  }
  await expectRuleTask(b, r.id, owner.id);
  // zapis i odczyt pól, w tym dodatkowych i polskich znaków
  const back = await b.get(`/api/contractors/${r.id}`);
  C.check('Kontrahenci', 'kartoteka zwraca dokładnie zapisane dane (w tym pola dodatkowe)', !!back && back.name === co.name && back.nip === co.nip && back.city === co.city && back.custom?.segment === body.custom.segment && back.custom?.liczba_pracownikow === body.custom.liczba_pracownikow && back.owner_id === owner.id, () => JSON.stringify({ name: back?.name, nip: back?.nip, custom: back?.custom }));
}

const anyContractor = (b?: Bot) => {
  const all = [...M.contractors.values()].filter((c) => c.active);
  if (!all.length) return null;
  const own = b ? all.filter((c) => c.ownerId === b.id) : [];
  return own.length && rng.chance(0.7) ? rng.pick(own) : rng.pick(all);
};

async function addCorrespondence(b: Bot, opts: { kind?: string; send?: boolean } = {}) {
  const c = anyContractor(b);
  if (!c) return;
  const kind = opts.kind ?? rng.weighted([['phone', 10], ['meeting', 4], ['note', 3], ['letter', 1]]);
  const dir: 'in' | 'out' = kind === 'note' ? 'out' : rng.chance(0.3) ? 'in' : 'out';
  const dur = kind === 'phone' ? rng.int(20, 1500) : kind === 'meeting' ? rng.int(15, 150) * 60 : 0;
  const contact = c.contacts.length && rng.chance(0.7) ? rng.pick(c.contacts) : null;
  const proj = M.projects.filter((p) => p.contractorId === c.id);
  const p = proj.length && rng.chance(0.5) ? rng.pick(proj) : null;
  const eventAt = addMin(simNow, -rng.int(0, 10)).slice(0, 16);
  const topic = rng.pick(D.corr_topic);
  const body: any = { kind_id: kindId(kind), direction: dir, event_at: eventAt, duration_sec: dur, topic_id: topic.id, contractor_id: c.id, contact_id: contact?.id ?? null, project_id: p?.id ?? null, stage_id: p && p.stageIds.length ? rng.pick(p.stageIds) : null, body: `Ustalenia z ${contact?.name ?? c.short}: zażółć gęślą jaźń nr ${rng.int(1000, 9999)}.` };
  const r = await b.post('/api/correspondence', body);
  if (!r) return;
  const mk: MCorr = { id: r.id, op: b.id, kind: kindName(kind), dir, eventAt: `${eventAt}:00`, dur, contractorId: c.id, projectId: p?.id ?? null, deleted: false };
  M.corr.set(r.id, mk);
  C.check('Korespondencja', 'numer nadawany automatycznie we wzorze DIAGNOS/n/RRRRMMDD', new RegExp(`^DIAGNOS/\\d+/${eventAt.slice(0, 10).replace(/-/g, '')}$`).test(r.number ?? ''), r.number);
  bump('korespondencja');
  if (rng.chance(0.12)) {
    const content = fakeFile(`zalacznik-${r.id}`, 'txt');
    const up = await b.upload(`/api/attachments/correspondence/${r.id}`, {}, { name: `Notatka ze spotkania ${r.id}.txt`, content, type: 'text/plain' });
    if (up.status < 300) {
      const list = await b.get(`/api/attachments/correspondence/${r.id}`);
      const f = await b.raw('GET', `/api/attachments/${list?.[0]?.id}/file`);
      C.check('Załączniki', 'załącznik korespondencji pobiera się w niezmienionej postaci i pod właściwą nazwą', f.status === 200 && sha(f.raw) === sha(content) && list?.[0]?.name === `Notatka ze spotkania ${r.id}.txt`, `status ${f.status}, nazwa ${list?.[0]?.name}`);
    }
  }
}

async function sendEmail(b: Bot) {
  const c = anyContractor(b);
  if (!c) return;
  const contact = c.contacts.find((p) => p.email) ?? null;
  const to = contact?.email ?? c.email;
  if (!to) return;
  const subject = `Oferta ${rng.int(10000, 99999)} dla ${c.short}`;
  const r = await b.post('/api/correspondence', { kind_id: kindId('email'), direction: 'out', event_at: simNow.slice(0, 16), duration_sec: 0, topic_text: subject, contractor_id: c.id, contact_id: contact?.id ?? null, body: `Szanowni Państwo,\nprzesyłamy ofertę.\nPozdrawiam, ${b.name}`, email_to: to });
  if (!r) return;
  M.corr.set(r.id, { id: r.id, op: b.id, kind: kindName('email'), dir: 'out', eventAt: simNow, dur: 0, contractorId: c.id, projectId: null, deleted: false, sent: true });
  const s = await b.post(`/api/correspondence/${r.id}/send`);
  expectEmail(to, subject);
  bump('e-maile z korespondencji');
  if (s && !smtp.state.down && smtpConfigured) C.check('E-mail', 'wysyłka z korespondencji kończy się statusem „wysłano”', s.status === 'sent', `${subject}: ${JSON.stringify(s)}`);
  if (s && !smtpConfigured) C.check('E-mail', 'bez konfiguracji SMTP wiadomość czeka i interfejs nie zgłasza sukcesu', s.status === 'awaiting_config', JSON.stringify(s));
  const again = await b.raw('POST', `/api/correspondence/${r.id}/send`);
  C.check('E-mail', 'tej samej wiadomości nie da się wysłać drugi raz', again.status === 400, `→ ${again.status}`);
}

async function sendSms(b: Bot) {
  const c = anyContractor(b);
  if (!c) return;
  const phone = `+48${rng.int(500000000, 799999999)}`;
  const text = `DIAGNOS: potwierdzamy termin wizyty ${rng.int(1000, 9999)} — ${c.short}`;
  const r = await b.post('/api/correspondence', { kind_id: kindId('sms'), direction: 'out', event_at: simNow.slice(0, 16), topic_text: 'Potwierdzenie terminu', contractor_id: c.id, body: text, phone_to: phone });
  if (!r) return;
  M.corr.set(r.id, { id: r.id, op: b.id, kind: kindName('sms'), dir: 'out', eventAt: simNow, dur: 0, contractorId: c.id, projectId: null, deleted: false, sent: true });
  const s = await b.post(`/api/correspondence/${r.id}/send`);
  expectSms(phone, text);
  bump('SMS-y z korespondencji');
  if (s && !smsConfigured) C.check('SMS', 'bez skonfigurowanej bramki SMS czeka w kolejce', s.status === 'awaiting_config', JSON.stringify(s));
  if (s && smsConfigured && !smsGw.state.down) C.check('SMS', 'wysyłka SMS kończy się statusem „wysłano”', s.status === 'sent', JSON.stringify(s));
}

let taskSeq = 0;
async function addTask(b: Bot) {
  const c = rng.chance(0.75) ? anyContractor(b) : null;
  // termin: dziś za 1–4 h albo w jednym z kolejnych dni roboczych, zawsze na granicy kwadransa
  let start: string;
  if (rng.chance(0.5) && hhmm() < '13:00') start = addMin(simNow, rng.pick([45, 60, 90, 120, 180, 240]));
  else {
    let d = addDays(today(), rng.int(1, 6));
    while (weekday(d) > 5) d = addDays(d, 1);
    start = slotIso(d, `${String(rng.int(8, 15)).padStart(2, '0')}:${rng.pick(['00', '15', '30', '45'])}`);
  }
  const end = addMin(start, rng.pick([15, 30, 45, 60, 120]));
  let ops = [b.id];
  if (b.role === 'kierownik' && rng.chance(0.6)) ops = rng.chance(0.3) ? [team[0].id, team[1].id, team[2].id] : [rng.pick(team).id];
  const remind = rng.chance(0.55) ? { before: rng.pick([10, 15, 30, 60, 100]), inapp: rng.chance(0.9), email: rng.chance(0.35), sms: rng.chance(0.1) } : undefined;
  if (remind && !remind.inapp && !remind.email && !remind.sms) remind.inapp = true;
  const title = `${rng.pick(['Zadzwonić', 'Przygotować ofertę', 'Umówić prezentację', 'Wysłać wycenę', 'Sprawdzić płatność', 'Raport z wizyty'])} #${++taskSeq}`;
  const r = await b.post('/api/tasks', { title, description: 'Opis zadania z symulacji.', start_at: start.slice(0, 16), end_at: end.slice(0, 16), operator_ids: ops, priority: rng.int(1, 4), contractor_id: c?.id ?? null, remind_before_min: remind ? remind.before : null, remind_inapp: remind?.inapp ?? true, remind_email: remind?.email ?? false, remind_sms: remind?.sms ?? false });
  if (!r) return;
  const mt: MTask = { id: r.id, title, start, end, ops, principal: b.id, createdBy: b.id, status: 'new', progress: 0, contractorId: c?.id ?? null, projectId: null, deleted: false, remind };
  M.tasks.set(r.id, mt);
  addReminders(mt);
  bump('zadania dodane ręcznie');
}

async function workTasks(b: Bot) {
  const mine = [...M.tasks.values()].filter((t) => !t.deleted && t.ops.includes(b.id) && (t.status === 'new' || t.status === 'in_progress') && t.start <= addMin(simNow, 60));
  if (!mine.length) return;
  const t = rng.pick(mine);
  const act = rng.weighted([['progress', 5], ['done', 5], ['time', 3], ['cancel', 1]]);
  if (act === 'time') {
    const min = rng.pick([15, 30, 45, 60, 90, 120]);
    const r = await b.post(`/api/tasks/${t.id}/time`, { minutes: min, work_date: today(), note: 'praca nad zadaniem' });
    if (r) M.time.push({ op: b.id, date: today(), min, contractorId: t.contractorId, projectId: t.projectId });
    return;
  }
  if (act === 'cancel') {
    const r = await b.put(`/api/tasks/${t.id}`, { title: t.title, start_at: t.start, end_at: t.end, operator_ids: t.ops, contractor_id: t.contractorId, project_id: t.projectId, status_id: statusId('cancelled'), progress: t.progress, remind_before_min: t.remind?.before ?? null, remind_inapp: t.remind?.inapp ?? true, remind_email: t.remind?.email ?? false, remind_sms: t.remind?.sms ?? false });
    if (r) {
      t.status = 'cancelled';
      dropReminders(t.id);
    }
    return;
  }
  const progress = act === 'done' ? 100 : Math.min(90, t.progress + rng.pick([10, 25, 40]));
  const r = await b.patch(`/api/tasks/${t.id}/progress`, { progress });
  if (!r) return;
  t.progress = progress;
  if (progress === 100) {
    t.status = 'done';
    t.doneAt = simNow;
    dropReminders(t.id);
    bump('zadania wykonane');
  } else {
    t.status = 'in_progress';
    // Zmiana postępu nie rusza przypomnień: wyświetlone czeka na potwierdzenie, potwierdzone nie wraca, e-mail nie idzie drugi raz.
  }
  const back = await b.get(`/api/tasks/${t.id}`);
  C.check('Zadania', 'zmiana postępu ustawia właściwy procent i status', !!back && back.progress === progress && back.status_code === t.status, () => `${t.title}: ${back?.progress}% ${back?.status_code}, oczekiwano ${progress}% ${t.status}`);
}

async function moveTask(b: Bot) {
  const mine = [...M.tasks.values()].filter((t) => !t.deleted && t.createdBy === b.id && !t.seriesId && !t.ruleId && t.status === 'new' && t.start > simNow);
  if (!mine.length) return;
  const t = rng.pick(mine);
  let d = addDays(today(), rng.int(1, 4));
  while (weekday(d) > 5) d = addDays(d, 1);
  const dur = (parseIso(t.end).getTime() - parseIso(t.start).getTime()) / 60000;
  const start = slotIso(d, `${String(rng.int(8, 15)).padStart(2, '0')}:${rng.pick(['00', '30'])}`);
  const r = await b.patch(`/api/tasks/${t.id}/move`, { start_at: start.slice(0, 16) });
  if (!r) return;
  t.start = start;
  t.end = addMin(start, dur);
  dropReminders(t.id);
  addReminders(t);
  const back = await b.get(`/api/tasks/${t.id}`);
  C.check('Zadania', 'przesunięcie w kalendarzu zachowuje czas trwania', !!back && back.start_at === t.start && back.end_at === t.end, () => `${back?.start_at}–${back?.end_at}, oczekiwano ${t.start}–${t.end}`);
  bump('zadania przesunięte');
}

async function deleteTask(b: Bot) {
  const mine = [...M.tasks.values()].filter((t) => !t.deleted && t.createdBy === b.id && !t.seriesId && !t.ruleId);
  if (!mine.length) return;
  const t = rng.pick(mine);
  const r = await b.del(`/api/tasks/${t.id}`);
  if (!r) return;
  t.deleted = true;
  dropReminders(t.id);
  bump('zadania usunięte');
}

function itemsFor(): { body: any[]; net: number; gross: number } {
  const n = rng.int(1, 4);
  const body: any[] = [];
  let net = 0;
  let gross = 0;
  for (let i = 0; i < n; i++) {
    const p = rng.pick(M.products);
    const qty = rng.pick([1, 1, 2, 3, 5, 10, 2.5]);
    const price = rng.chance(0.3) ? round2(p.price * (1 - rng.int(1, 15) / 100)) : p.price;
    body.push({ product_id: p.id, name: p.name, qty, net_price: price, vat_rate: p.vat });
    const lineNet = round2(qty * price);
    net += lineNet;
    gross += round2(lineNet * (1 + p.vat / 100));
  }
  return { body, net: round2(net), gross: round2(gross) };
}

async function addOrder(b: Bot) {
  const c = anyContractor(b);
  if (!c) return;
  const it = itemsFor();
  const r = await b.post('/api/orders', { contractor_id: c.id, order_date: today(), items: it.body, notes: 'Zamówienie z symulacji' });
  if (!r) return;
  M.orders++;
  const o = await b.get(`/api/orders/${r.id}`);
  C.near('Zamówienia i sprzedaż', 'wartość netto zamówienia = suma pozycji', o?.net_total, it.net, o?.number);
  C.near('Zamówienia i sprzedaż', 'wartość brutto zamówienia = suma pozycji z VAT', o?.gross_total, it.gross, o?.number);
  C.check('Zamówienia i sprzedaż', 'numer zamówienia we wzorze DIAGNOS/ZAM/n/RRRR', /^DIAGNOS\/ZAM\/\d+\/\d{4}$/.test(o?.number ?? ''), o?.number);
  // reguła dodana przez administratora: zadanie dla autora następnego dnia o 08:30
  const tasks = (await admin.get(`/api/tasks?contractor_id=${c.id}&archived=1`)) ?? [];
  const nt = tasks.filter((t: any) => t.rule_id === ruleOrder.id && !M.tasks.has(t.id));
  const ok = nt.length === 1 && nt[0].title === `Potwierdź zamówienie ${o?.number}` && nt[0].start_at === `${addDays(today(), 1)}T08:30:00` && JSON.stringify(nt[0].operator_ids) === JSON.stringify([b.id]);
  C.check('Zadania automatyczne', 'reguła administratora: zamówienie → zadanie dla autora następnego dnia 08:30', ok, () => JSON.stringify(nt.map((t: any) => [t.title, t.start_at, t.operator_ids])));
  for (const t of nt) M.tasks.set(t.id, { id: t.id, title: t.title, start: t.start_at, end: t.end_at, ops: t.operator_ids, principal: b.id, createdBy: b.id, status: 'new', progress: 0, contractorId: c.id, projectId: null, deleted: false, ruleId: t.rule_id });
}

let saleSeq = 0;
async function addSale(b: Bot) {
  const c = anyContractor(b);
  if (!c) return;
  const it = itemsFor();
  const r = await b.post('/api/sales', { doc_number: `FV/${++saleSeq}/${today().slice(0, 7)}`, doc_date: today(), contractor_id: c.id, items: it.body });
  if (!r) return;
  M.sales.push({ id: r.id, op: b.id, contractorId: c.id, date: today(), net: it.net, gross: it.gross });
  const s = await b.get(`/api/sales/${r.id}`);
  C.near('Zamówienia i sprzedaż', 'wartość netto sprzedaży = suma pozycji', s?.net_total, it.net, s?.doc_number);
  C.near('Zamówienia i sprzedaż', 'wartość brutto sprzedaży = suma pozycji z VAT', s?.gross_total, it.gross, s?.doc_number);
}

async function addProject(b: Bot) {
  const c = anyContractor(b);
  if (!c) return;
  const r = await b.post('/api/projects', { name: `Wdrożenie ${c.short} ${rng.int(10, 99)}`, contractor_id: c.id, start_date: today(), end_date: addDays(today(), 60), stages: [{ name: 'Analiza', status: 'w toku' }, { name: 'Dostawa', status: 'planowany' }, { name: 'Szkolenie', status: 'planowany' }] });
  if (!r) return;
  const p = await b.get(`/api/projects/${r.id}`);
  C.check('Projekty', 'projekt zapisuje etapy', p?.stages?.length === 3, `${p?.stages?.length}`);
  M.projects.push({ id: r.id, contractorId: c.id, stageIds: (p?.stages ?? []).map((s: any) => s.id) });
}

async function addDocument(b: Bot) {
  const c = rng.chance(0.7) ? anyContractor(b) : null;
  const folder = rng.pick(['Oferty', 'Cenniki', 'Instrukcje', 'Katalogi']);
  const label = `dok-${M.docs.length + 1}`;
  const content = fakeFile(label);
  const validTo = rng.chance(0.4) ? addDays(today(), rng.int(2, 8)) : null;
  const name = `${folder === 'Oferty' ? 'Oferta' : 'Dokument'} ${label} ${c?.short ?? 'ogólny'}`;
  const fields: Record<string, string> = { name, folder_id: String(folders[folder]), description: 'Dokument z symulacji' };
  if (c) fields.contractor_id = String(c.id);
  if (validTo) (fields.valid_from = today()), (fields.valid_to = validTo);
  const r = await b.upload('/api/documents', fields, { name: `${label}.pdf`, content, type: 'application/pdf' });
  if (r.status >= 300) return;
  M.docs.push({ id: r.json.id, name, folderId: folders[folder], authorId: b.id, contractorId: c?.id ?? null, validTo, versions: [sha(content)] });
  bump('dokumenty');
}

async function newVersion(b: Bot) {
  const mine = M.docs.filter((d) => d.authorId === b.id && !d.restricted);
  if (!mine.length) return;
  const d = rng.pick(mine);
  const content = fakeFile(`dok-${d.id}-wersja-${d.versions.length}`);
  const r = await b.upload(`/api/documents/${d.id}/versions`, { comment: 'aktualizacja treści' }, { name: `dok-${d.id}-v${d.versions.length}.pdf`, content, type: 'application/pdf' });
  if (r.status >= 300) return;
  d.versions.push(sha(content));
  const doc = await b.get(`/api/documents/${d.id}`);
  const cur = await b.raw('GET', `/api/documents/${d.id}/file`);
  const first = await b.raw('GET', `/api/documents/${d.id}/file?version=0`);
  C.check('Dokumenty', 'nowa wersja nie kasuje starej: obie wersje pobierają się poprawnie', doc?.current_version === d.versions.length - 1 && sha(cur.raw) === d.versions[d.versions.length - 1] && sha(first.raw) === d.versions[0] && doc?.versions?.length === d.versions.length, `wersja ${doc?.current_version}, historia ${doc?.versions?.length}`);
  bump('nowe wersje dokumentów');
}

async function generateDoc(b: Bot) {
  const c = anyContractor(b);
  if (!c) return;
  const tpl = rng.pick(templates.filter((t) => t.kind !== 'zamowienie'));
  const it = itemsFor();
  const r = await b.post(`/api/doc-templates/${tpl.id}/generate`, { contractor_id: c.id, items: it.body, valid_to: addDays(today(), 30) });
  if (!r) return;
  const f = await b.raw('GET', `/api/documents/${r.id}/file`);
  const att = (await b.get(`/api/contractors/${c.id}/attachments`)) ?? [];
  C.check('Dokumenty', 'dokument z szablonu jest plikiem PDF i trafia do kartoteki kontrahenta', f.status === 200 && f.raw.subarray(0, 5).toString() === '%PDF-' && f.raw.length > 1500 && att.some((a: any) => a.document_id === r.id), `status ${f.status}, rozmiar ${f.raw.length}`);
  C.check('Dokumenty', 'numer dokumentu we wzorze DIAGNOS/D/n/RRRRMMDD', new RegExp(`^DIAGNOS/D/\\d+/${today().replace(/-/g, '')}$`).test(r.number ?? ''), r.number);
  M.docs.push({ id: r.id, name: tpl.name, folderId: tpl.folder_id, authorId: b.id, contractorId: c.id, validTo: addDays(today(), 30), versions: [sha(f.raw)] });
  bump('dokumenty z szablonów');
}

async function internalMessage(b: Bot) {
  const others = [admin, ...bots].filter((x) => x.id !== b.id);
  const all = rng.chance(0.2);
  const rec = all ? others : [rng.pick(others)];
  const scheduled = rng.chance(0.5);
  const deliver = scheduled ? addMin(simNow, rng.pick([45, 90, 180, 60 * 24])) : null;
  const subject = `Wiadomość ${M.msgs.length + 1}: ${rng.pick(['raport wykonania', 'przypomnienie o ofercie', 'zmiana terminu', 'prośba o kontakt'])}`;
  const r = await b.post('/api/internal', all ? { subject, body: 'Treść wiadomości wewnętrznej.', all: true, deliver_at: deliver?.slice(0, 16) } : { subject, body: 'Treść wiadomości wewnętrznej.', recipient_ids: rec.map((x) => x.id), deliver_at: deliver?.slice(0, 16) });
  if (!r) return;
  C.check('Korespondencja wewnętrzna', 'system rozróżnia wiadomość natychmiastową i zaplanowaną', r.scheduled === scheduled, `${subject}: scheduled=${r.scheduled}`);
  M.msgs.push({ id: r.id, sender: b.id, recipients: rec.map((x) => x.id), deliverAt: deliver ?? simNow, subject, read: new Set() });
  bump('wiadomości wewnętrzne');
}

async function editContractor(b: Bot) {
  const c = anyContractor(b);
  if (!c) return;
  const status = rng.pick(D.contractor_status.filter((s) => s.name !== 'Zablokowany'));
  const isKey = rng.chance(0.3);
  const r = await b.put(`/api/contractors/${c.id}`, { status_id: status.id, is_key: isKey, notes: `Aktualizacja ${simNow}` });
  if (!r) return;
  c.statusId = status.id;
  c.isKey = isKey;
  await b.post(`/api/contractors/${c.id}/notes`, { body: `Notatka z rozmowy ${rng.int(100, 999)}: klient prosi o kontakt po 15.` });
}

async function deleteCorrespondence(b: Bot) {
  const mine = [...M.corr.values()].filter((k) => !k.deleted && k.op === b.id && !k.sent);
  if (!mine.length) return;
  const k = rng.pick(mine);
  const r = await b.del(`/api/correspondence/${k.id}`);
  if (r) k.deleted = true;
}

const ACTIONS: [(b: Bot) => Promise<void>, number][] = [
  [addContractor, 5], [addCorrespondence, 16], [sendEmail, 5], [sendSms, 1], [addTask, 9], [workTasks, 12], [moveTask, 2], [deleteTask, 1],
  [addOrder, 3], [addSale, 5], [addProject, 1], [addDocument, 2], [newVersion, 1], [generateDoc, 1], [internalMessage, 2], [editContractor, 2], [deleteCorrespondence, 1],
];

// ---------- Powiadomienia: przypomnienia i wiadomości wewnętrzne ----------
async function pollAll() {
  for (const b of [admin, ...bots]) {
    const n = await b.get('/api/notifications');
    if (!n) continue;
    const present = new Map<number, number>(n.reminders.map((r: any) => [r.task_id, r.id]));
    for (const r of M.rems.filter((x) => x.op === b.id)) {
      const task = M.tasks.get(r.taskId)!;
      if (r.state === 'waiting' && r.remindAt <= simNow) {
        fireReminder(r);
        r.state = r.inapp ? 'due' : 'acked';
      }
      if (r.state === 'due') {
        const snoozed = r.snoozeUntil && simNow < r.snoozeUntil;
        if (snoozed) C.check('Przypomnienia', 'odłożone przypomnienie znika do wyznaczonej pory', !present.has(r.taskId), `${task.title} (${b.login}) odłożone do ${r.snoozeUntil}`);
        else C.check('Przypomnienia', 'przypomnienie pojawia się w porę i czeka na potwierdzenie', present.has(r.taskId), `${task.title} (${b.login}), przypomnienie od ${r.remindAt}, termin ${task.start}`);
      }
      if (r.state === 'maybe' && !present.has(r.taskId)) r.state = 'gone';
    }
    for (const [taskId, remId] of present) {
      const recs = M.rems.filter((x) => x.op === b.id && x.taskId === taskId && (x.state === 'due' || x.state === 'maybe'));
      const live = recs.find((x) => !(x.snoozeUntil && simNow < x.snoozeUntil));
      C.check('Przypomnienia', 'nie pojawia się przypomnienie, którego nie powinno być (przed czasem, po potwierdzeniu, do zamkniętego zadania)', !!live, () => `${M.tasks.get(taskId)?.title ?? '#' + taskId} (${b.login}): stan w księdze ${JSON.stringify(M.rems.filter((x) => x.op === b.id && x.taskId === taskId).map((x) => [x.state, x.remindAt, x.snoozeUntil]))}`);
      if (!live || live.state !== 'due') continue;
      const what = rng.weighted([['ack', 6], ['snooze', 2], ['wait', 2]]);
      if (what === 'ack') {
        if (await b.post(`/api/reminders/${remId}/ack`)) live.state = 'acked';
      } else if (what === 'snooze') {
        const m = rng.pick([10, 20, 40]);
        if (await b.post(`/api/reminders/${remId}/snooze`, { minutes: m })) live.snoozeUntil = addMin(simNow, m);
      }
    }
    // wiadomości wewnętrzne: dokładnie te, których termin doręczenia minął i których adresat nie przeczytał
    const expected = M.msgs.filter((m) => !m.deleted && m.recipients.includes(b.id) && m.deliverAt <= simNow && !m.read.has(b.id)).map((m) => m.id).sort((x, y) => x - y);
    const got = n.messages.map((m: any) => m.id).sort((x: number, y: number) => x - y);
    C.eq('Korespondencja wewnętrzna', 'adresat widzi wiadomość dopiero od wyznaczonego terminu (i tylko nieprzeczytane)', got, expected, b.login);
    for (const id of got) {
      if (!rng.chance(0.5)) continue;
      if (await b.post(`/api/internal/${id}/read`)) M.msgs.find((m) => m.id === id)?.read.add(b.id);
    }
  }
}

// ---------- Sprawdzenia okresowe ----------
let smtpConfigured = false;
let smsConfigured = false;

async function morningChecks() {
  // zadania cykliczne: dokładnie oczekiwane wystąpienia, wygenerowane z wyprzedzeniem 60 dni
  const all = (await admin.get('/api/tasks?archived=1')) ?? [];
  for (const s of M.series) {
    const got = all.filter((t: any) => t.series_id === s.id).map((t: any) => t.occurrence_date).sort();
    const exp = s.dates(s.createdDay, addDays(today(), 60)).sort();
    C.eq('Zadania cykliczne', 'seria ma dokładnie oczekiwane wystąpienia (bez braków i duplikatów) na 60 dni naprzód', got, exp, s.title);
    for (const t of all.filter((t: any) => t.series_id === s.id && !M.tasks.has(t.id))) {
      const okTime = t.start_at === `${t.occurrence_date}T${s.timeFrom}:00` && t.end_at === `${t.occurrence_date}T${s.timeTo}:00`;
      C.check('Zadania cykliczne', 'wystąpienie ma właściwe godziny i wykonawców (także po zmianie czasu)', okTime && JSON.stringify([...t.operator_ids].sort()) === JSON.stringify([...s.ops].sort()), `${s.title} ${t.occurrence_date}: ${t.start_at}–${t.end_at} ${t.operator_ids}`);
      const mt: MTask = { id: t.id, title: t.title, start: t.start_at, end: t.end_at, ops: t.operator_ids, principal: t.principal_id, createdBy: s.createdBy, status: 'new', progress: 0, contractorId: null, projectId: null, deleted: false, seriesId: s.id, remind: s.remind };
      M.tasks.set(t.id, mt);
      if (mt.start >= simNow) addReminders(mt);
    }
  }
  for (const t of all) C.check('Zadania', 'w systemie nie ma zadań, których nikt nie utworzył', M.tasks.has(t.id), `${t.title} (#${t.id}) start ${t.start_at}`);
}

function visibleTo(b: Bot): number[] {
  const teamIds = new Set(b.role === 'kierownik' ? [b.id, ...team.map((x) => x.id)] : [b.id]);
  return [...M.tasks.values()].filter((t) => !t.deleted && (b.role === 'admin' || t.principal === b.id || t.createdBy === b.id || t.ops.some((o) => teamIds.has(o)))).map((t) => t.id).sort((a, b2) => a - b2);
}

async function eveningChecks() {
  // rejestry: liczba rekordów zgodna z księgą
  const cs = (await admin.get('/api/contractors?all=1')) ?? [];
  C.eq('Rejestry', 'liczba kontrahentów w rejestrze zgodna z księgą', cs.length, M.contractors.size);
  C.eq('Rejestry', 'rejestr domyślnie pokazuje tylko aktywnych kontrahentów', ((await admin.get('/api/contractors')) ?? []).length, [...M.contractors.values()].filter((c) => c.active).length);
  const ks = (await admin.get('/api/correspondence')) ?? [];
  C.eq('Rejestry', 'liczba pozycji korespondencji zgodna z księgą', ks.length, [...M.corr.values()].filter((k) => !k.deleted).length);
  const nums = ks.map((k: any) => k.number);
  C.check('Korespondencja', 'numery korespondencji są unikalne', new Set(nums).size === nums.length, `${nums.length - new Set(nums).size} duplikatów`);
  C.eq('Rejestry', 'liczba dokumentów sprzedaży zgodna z księgą', ((await admin.get('/api/sales')) ?? []).length, M.sales.length);
  C.eq('Rejestry', 'liczba zamówień zgodna z księgą', ((await admin.get('/api/orders')) ?? []).length, M.orders);
  C.eq('Rejestry', 'liczba projektów zgodna z księgą', ((await admin.get('/api/projects')) ?? []).length, M.projects.length);
  // widoczność zadań wg roli
  for (const b of [admin, kier, team[0], team[3], serwis]) {
    const got = ((await b.get('/api/tasks?archived=1')) ?? []).map((t: any) => t.id).sort((x: number, y: number) => x - y);
    C.eq('Uprawnienia', 'operator widzi w rejestrze zadań dokładnie zadania swoje / zespołu (administrator wszystkie)', got, visibleTo(b), `${b.login} (${b.role})`);
  }
  // data ostatniego kontaktu w kartotece
  const sample = cs.filter(() => rng.chance(0.15)).slice(0, 12);
  for (const c of sample) {
    const last = [...M.corr.values()].filter((k) => !k.deleted && k.contractorId === c.id).map((k) => k.eventAt).sort().pop() ?? null;
    C.eq('Kontrahenci', 'data ostatniego kontaktu w rejestrze = najnowsza korespondencja', c.last_contact ?? null, last, c.name);
  }
  // ważność dokumentów: po terminie dokument przechodzi do archiwalnych
  const cur = new Set(((await admin.get('/api/documents?state=current')) ?? []).map((d: any) => d.id));
  const arch = new Set(((await admin.get('/api/documents?state=archived')) ?? []).map((d: any) => d.id));
  for (const d of M.docs) {
    const expired = !!d.validTo && d.validTo < today();
    C.check('Dokumenty', 'dokument po terminie ważności trafia do archiwalnych, ważny pozostaje w aktualnych', expired ? arch.has(d.id) && !cur.has(d.id) : cur.has(d.id) && !arch.has(d.id), `${d.name}: ważny do ${d.validTo}, dziś ${today()}, aktualne=${cur.has(d.id)}, archiwalne=${arch.has(d.id)}`);
  }
  await permissionProbes();
}

async function permissionProbes() {
  const h = team[0];
  const probes: [Bot, string, string, any, number, string][] = [
    [h, 'POST', '/api/operators', { login: 'intruz', name: 'X', role: 'admin', password: PW }, 403, 'handlowiec nie zakłada kont'],
    [h, 'PUT', `/api/operators/${h.id}`, { login: h.login, name: h.name, role: 'admin' }, 403, 'handlowiec nie nadaje sobie roli administratora'],
    [h, 'GET', '/api/settings/smtp', undefined, 403, 'handlowiec nie czyta konfiguracji SMTP'],
    [h, 'PUT', '/api/settings/sms', { provider: 'none' }, 403, 'handlowiec nie zmienia konfiguracji SMS'],
    [h, 'POST', '/api/dicts/contractor_type', { name: 'Hack' }, 403, 'handlowiec nie zmienia słowników'],
    [h, 'POST', '/api/auto-rules', { name: 'x', event: 'order.created', title_tpl: 'x', assign_to: 'creator', time_of_day: '08:00', delay_days: 0 }, 403, 'handlowiec nie zmienia reguł automatycznych'],
    [h, 'GET', '/api/audit', undefined, 403, 'handlowiec nie czyta dziennika zmian'],
    [h, 'PUT', `/api/products/${M.products[0].id}`, { name: 'Analizator AX-200', net_price: 0.01, vat_rate: 23 }, 403, 'handlowiec nie zmienia cen w kartotece towarowej'],
    [h, 'POST', '/api/import/run', { token: 'x', mapping: {} }, 403, 'handlowiec nie importuje danych'],
    [h, 'GET', `/api/permissions/folder/${folders['Umowy']}`, undefined, 200, 'pracownik uprawnionego działu widzi uprawnienia segregatora'],
    [serwis, 'GET', `/api/permissions/folder/${folders['Umowy']}`, undefined, 403, 'operator bez dostępu nie odczyta uprawnień segregatora'],
    [kier, 'POST', '/api/operators', { login: 'intruz2', name: 'X', role: 'handlowiec', password: PW }, 403, 'kierownik nie zakłada kont'],
    [kier, 'PUT', '/api/settings/smtp', { host: 'evil.example', port: 25, from_email: 'a@b.pl' }, 403, 'kierownik nie zmienia konfiguracji SMTP'],
    [h, 'GET', `/api/reports/sales?operator_id=${team[1].id}`, undefined, 400, 'handlowiec nie pobiera raportu innego handlowca'],
    [serwis, 'GET', `/api/reports/tasks?operator_id=${kier.id}`, undefined, 400, 'operator spoza zespołu nie pobiera raportu kierownika'],
  ];
  const cWithRel = [...M.contractors.values()].find((c) => [...M.corr.values()].some((k) => k.contractorId === c.id && !k.deleted));
  if (cWithRel) {
    probes.push([h, 'DELETE', `/api/contractors/${cWithRel.id}`, undefined, 403, 'handlowiec nie usuwa kontrahentów']);
    probes.push([kier, 'DELETE', `/api/contractors/${cWithRel.id}`, undefined, 409, 'kontrahenta z historią nie da się usunąć (nawet kierownikowi)']);
  }
  const foreignCorr = [...M.corr.values()].find((k) => !k.deleted && k.op === team[1].id);
  if (foreignCorr) {
    probes.push([h, 'PUT', `/api/correspondence/${foreignCorr.id}`, { kind_id: kindId('note'), direction: 'out', event_at: simNow.slice(0, 16), topic_text: 'przejęte' }, 403, 'handlowiec nie edytuje cudzej korespondencji']);
    probes.push([h, 'DELETE', `/api/correspondence/${foreignCorr.id}`, undefined, 403, 'handlowiec nie usuwa cudzej korespondencji']);
  }
  // prywatne zadanie innego operatora (bez kontrahenta) nie powinno być dostępne po identyfikatorze
  const priv = [...M.tasks.values()].find((t) => !t.deleted && !t.contractorId && t.createdBy === team[1].id && t.ops.length === 1 && t.ops[0] === team[1].id);
  if (priv) {
    probes.push([serwis, 'GET', `/api/tasks/${priv.id}`, undefined, 403, 'operator nie odczyta po identyfikatorze prywatnego zadania innej osoby']);
    probes.push([serwis, 'PATCH', `/api/tasks/${priv.id}/progress`, { progress: 100 }, 403, 'operator nie zmieni postępu cudzego zadania']);
    probes.push([serwis, 'DELETE', `/api/tasks/${priv.id}`, undefined, 403, 'operator nie usunie cudzego zadania']);
  }
  const foreignSale = M.sales.find((s) => s.op === team[1].id);
  if (foreignSale) probes.push([h, 'PUT', `/api/sales/${foreignSale.id}`, { doc_number: 'PRZEJETA', doc_date: today(), contractor_id: foreignSale.contractorId, operator_id: h.id, net_total: 999999 }, 403, 'handlowiec nie przypisze sobie cudzej sprzedaży']);
  const foreignMail = [...M.corr.values()].find((k) => !k.deleted && k.op === team[1].id && k.kind === kindName('note'));
  if (foreignMail) probes.push([h, 'POST', `/api/correspondence/${foreignMail.id}/send`, {}, 403, 'handlowiec nie wyśle cudzej korespondencji']);
  const out = ((await admin.get('/api/outbox')) ?? []);
  const sentByOther = out.find((o: any) => o.status === 'sent' && o.created_by_name === team[1].name);
  if (sentByOther) {
    probes.push([h, 'POST', `/api/outbox/${sentByOther.id}/retry`, {}, 403, 'operator nie ponowi cudzej wysyłki']);
    probes.push([kier, 'POST', `/api/outbox/${sentByOther.id}/retry`, {}, 400, 'wysłanej wiadomości nie da się wysłać ponownie z kolejki']);
    probes.push([kier, 'POST', `/api/outbox/${sentByOther.id}/cancel`, {}, 400, 'wysłanej wiadomości nie da się „anulować”']);
  }
  const foreignMsg = M.msgs.find((m) => !m.deleted && m.sender === team[1].id);
  if (foreignMsg) probes.push([h, 'DELETE', `/api/internal/${foreignMsg.id}`, undefined, foreignMsg.deliverAt <= simNow ? 403 : 403, 'operator nie wycofa cudzej wiadomości']);
  for (const [b, method, url, body, want, label] of probes) {
    const r = await b.raw(method, url, body);
    C.check('Uprawnienia', label, r.status === want, `${b.login} ${method} ${url} → ${r.status} (oczekiwano ${want})`);
  }
  // cudze wiadomości wewnętrzne nie trafiają do skrzynki
  const inbox = (await serwis.get('/api/internal/inbox')) ?? [];
  const allowed = new Set(M.msgs.filter((m) => m.recipients.includes(serwis.id)).map((m) => m.id));
  C.check('Uprawnienia', 'w skrzynce odbiorczej są wyłącznie wiadomości adresowane do operatora', inbox.every((m: any) => allowed.has(m.id)), `${inbox.filter((m: any) => !allowed.has(m.id)).length} cudzych`);
}

// ---------- Raporty kontra księga ----------
async function reportChecks(from: string, to: string) {
  const inP = (d: string) => d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const q = `from=${from}&to=${to}`;
  // aktywność operatora
  for (const b of [kier, ...team]) {
    const r = await b.get(`/api/reports/activity?${q}`);
    if (!r) continue;
    const exp = new Map<string, { out: number; in: number; sec: number }>();
    for (const k of M.corr.values()) {
      if (k.deleted || k.op !== b.id || !inP(k.eventAt)) continue;
      const e = exp.get(k.kind) ?? { out: 0, in: 0, sec: 0 };
      e[k.dir]++;
      e.sec += k.dur;
      exp.set(k.kind, e);
    }
    const got = Object.fromEntries(r.rows.map((x: any) => [x.kind, [x.out, x.in, x.total, x.hours]]));
    const want = Object.fromEntries([...exp.entries()].map(([k, e]) => [k, [e.out, e.in, e.out + e.in, round2(e.sec / 3600)]]));
    const kinds = [...new Set([...Object.keys(got), ...Object.keys(want)])];
    const sameA = kinds.every((n) => got[n] && want[n] && [0, 1, 2].every((i) => got[n][i] === want[n][i]) && Math.abs(got[n][3] - want[n][3]) <= 0.011);
    C.check('Raporty', 'aktywność operatora: liczby wg rodzaju i kierunku oraz czas zgodne z księgą', sameA, () => `${b.login} ${from}–${to}: jest ${JSON.stringify(sortKeys(got))}, powinno być ${JSON.stringify(sortKeys(want))}`);
    const tot = [...exp.values()].reduce((s, e) => s + e.out + e.in, 0);
    C.eq('Raporty', 'aktywność operatora: wiersz sumy', r.totals?.total, tot, b.login);
  }
  // skuteczność handlowców (widok administratora: wszyscy)
  {
    const r = await admin.get(`/api/reports/sales?${q}`);
    const exp = new Map<string, { cnt: number; net: number; gross: number; clients: Set<number> }>();
    for (const s of M.sales) {
      if (!inP(s.date)) continue;
      const name = s.op ? byId.get(s.op)!.name : '(bez handlowca)';
      const e = exp.get(name) ?? { cnt: 0, net: 0, gross: 0, clients: new Set() };
      e.cnt++;
      e.net += s.net;
      e.gross += s.gross;
      e.clients.add(s.contractorId);
      exp.set(name, e);
    }
    const got = Object.fromEntries((r?.rows ?? []).map((x: any) => [x.operator, [x.cnt, x.clients, x.net, x.gross]]));
    const want = Object.fromEntries([...exp.entries()].map(([k, e]) => [k, [e.cnt, e.clients.size, round2(e.net), round2(e.gross)]]));
    C.eq('Raporty', 'skuteczność handlowców: transakcje, klienci, netto i brutto zgodne z księgą', sortKeys(got), sortKeys(want), `${from}–${to}`);
    C.near('Raporty', 'skuteczność handlowców: suma netto', r?.totals?.net ?? 0, round2([...exp.values()].reduce((s, e) => s + e.net, 0)));
    // zakres wg roli
    const own = await team[0].get(`/api/reports/sales?${q}`);
    C.check('Raporty', 'handlowiec widzi w raporcie sprzedaży tylko siebie', (own?.rows ?? []).every((x: any) => x.operator === team[0].name), JSON.stringify((own?.rows ?? []).map((x: any) => x.operator)));
    const teamNames = new Set([kier.name, ...team.map((t) => t.name)]);
    const tr = await kier.get(`/api/reports/sales?${q}`);
    C.check('Raporty', 'kierownik widzi w raporcie sprzedaży tylko swój zespół', (tr?.rows ?? []).every((x: any) => teamNames.has(x.operator)), JSON.stringify((tr?.rows ?? []).map((x: any) => x.operator)));
  }
  // statystyka zadań
  {
    const r = await admin.get(`/api/reports/tasks?${q}`);
    const exp = new Map<string, number[]>();
    for (const t of M.tasks.values()) {
      if (t.deleted || !inP(t.start)) continue;
      for (const o of t.ops) {
        const name = byId.get(o)!.name;
        const e = exp.get(name) ?? [0, 0, 0, 0, 0, 0];
        e[0]++;
        if (t.status === 'done') (e[1]++, t.doneAt! <= t.end && e[2]++);
        else if (t.status === 'cancelled') e[5]++;
        else if (t.end < simNow) e[4]++;
        else e[3]++;
        exp.set(name, e);
      }
    }
    const got = Object.fromEntries((r?.rows ?? []).map((x: any) => [x.operator, [x.total, x.done, x.on_time, x.open, x.overdue, x.cancelled]]));
    C.eq('Raporty', 'statystyka zadań: wszystkie / wykonane / w terminie / w toku / przeterminowane / anulowane zgodne z księgą', sortKeys(got), sortKeys(Object.fromEntries(exp)), `${from}–${to}`);
  }
  // czas pracy wg operatora i wg kontrahenta
  {
    const r = await admin.get(`/api/reports/time?${q}&group_by=operator`);
    const exp = new Map<string, [number, number]>();
    for (const k of M.corr.values()) if (!k.deleted && inP(k.eventAt) && k.dur) (exp.get(byId.get(k.op)!.name) ?? exp.set(byId.get(k.op)!.name, [0, 0]).get(byId.get(k.op)!.name)!)[0] += k.dur / 60;
    for (const e of M.time) if (inP(e.date)) (exp.get(byId.get(e.op)!.name) ?? exp.set(byId.get(e.op)!.name, [0, 0]).get(byId.get(e.op)!.name)!)[1] += e.min;
    const got = Object.fromEntries((r?.rows ?? []).map((x: any) => [x.name, [x.corr_h, x.tasks_h, x.total_h]]));
    const want = Object.fromEntries([...exp.entries()].filter(([, v]) => round2((v[0] + v[1]) / 60) > 0).map(([k, v]) => [k, [round2(v[0] / 60), round2(v[1] / 60), round2((v[0] + v[1]) / 60)]]));
    const names = [...new Set([...Object.keys(got), ...Object.keys(want)])].sort();
    const same = names.every((n) => got[n] && want[n] && [0, 1, 2].every((i) => Math.abs(got[n][i] - want[n][i]) <= 0.011));
    C.check('Raporty', 'czas pracy wg operatora: korespondencja + ewidencja zadań zgodne z księgą', same, () => `${from}–${to}: jest ${JSON.stringify(sortKeys(got))}, powinno być ${JSON.stringify(sortKeys(want))}`);
    const totalMin = [...exp.values()].reduce((s, v) => s + v[0] + v[1], 0);
    const rc = await admin.get(`/api/reports/time?${q}&group_by=contractor`);
    C.near('Raporty', 'czas pracy wg kontrahenta: ta sama suma godzin co wg operatora', rc?.totals?.total_h ?? 0, round2(totalMin / 60));
    const share = (rc?.rows ?? []).reduce((s: number, x: any) => s + x.share, 0);
    if ((rc?.rows ?? []).length) C.check('Raporty', 'czas pracy: udziały kontrahentów sumują się do 100%', Math.abs(share - 100) < 0.6, `suma udziałów ${share}`);
  }
  // brak aktywności
  for (const days of [7, 14]) {
    const r = await admin.get(`/api/reports/inactivity?days=${days}`);
    const limit = `${addDays(today(), -days)}T00:00:00`;
    const want = [...M.contractors.values()].filter((c) => c.active).filter((c) => {
      const last = [...M.corr.values()].filter((k) => !k.deleted && k.contractorId === c.id).map((k) => k.eventAt).sort().pop();
      return !last || last < limit;
    }).map((c) => c.name).sort();
    C.eq('Raporty', 'brak aktywności: lista kontrahentów bez kontaktu od N dni zgodna z księgą', (r?.rows ?? []).map((x: any) => x.name).sort(), want, `${days} dni`);
    const rk = await admin.get(`/api/reports/inactivity?days=${days}&only_key=1`);
    const wantKey = [...M.contractors.values()].filter((c) => c.active && c.isKey).filter((c) => {
      const last = [...M.corr.values()].filter((k) => !k.deleted && k.contractorId === c.id).map((k) => k.eventAt).sort().pop();
      return !last || last < limit;
    }).map((c) => c.name).sort();
    C.eq('Raporty', 'brak aktywności: filtr „tylko kluczowi”', (rk?.rows ?? []).map((x: any) => x.name).sort(), wantKey, `${days} dni`);
  }
  // PDF i XLSX każdego raportu
  for (const type of ['inactivity', 'sales', 'tasks', 'activity', 'time']) {
    const pdf = await admin.raw('GET', `/api/reports/${type}/pdf?${q}`);
    C.check('Raporty', 'raport zapisuje się do PDF', pdf.status === 200 && pdf.raw.subarray(0, 5).toString() === '%PDF-' && pdf.raw.length > 2000, `${type}: ${pdf.status}, ${pdf.raw.length} B`);
    const x = await admin.raw('GET', `/api/reports/${type}/xlsx?${q}`);
    let rows = 0;
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(x.raw as any);
      rows = wb.worksheets[0].rowCount;
    } catch {
      rows = -1;
    }
    C.check('Raporty', 'raport eksportuje się do XLSX', x.status === 200 && rows >= 3, `${type}: ${x.status}, wierszy ${rows}`);
  }
}
function sortKeys(o: Record<string, any>) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

// ---------- Zdarzenia zaplanowane w scenariuszu ----------
type Scripted = { day: number; time: string; label: string; run: () => Promise<void> };
const scripted: Scripted[] = [];
const at = (day: number, time: string, label: string, run: () => Promise<void>) => scripted.push({ day, time, label, run });

function planScenario() {
  // Dzień 1: praca bez skonfigurowanej poczty i SMS, konfiguracja w południe.
  at(0, '09:15', 'e-mail i SMS przed konfiguracją kanałów', async () => {
    await addContractor(team[0]);
    await addContractor(team[1]);
    await sendEmail(team[0]);
    await sendSms(team[0]);
    const st = await admin.get('/api/settings/status');
    C.check('E-mail', 'system zgłasza brak konfiguracji SMTP i SMS', st?.smtp_configured === false && st?.sms_configured === false, JSON.stringify(st));
    C.eq('E-mail', 'bez konfiguracji nic nie zostaje wysłane', smtp.messages.length + smsGw.messages.length, 0);
  });
  at(0, '12:00', 'administrator konfiguruje SMTP i bramkę SMS', async () => {
    await admin.put('/api/settings/smtp', { host: '127.0.0.1', port: smtp.port, secure: false, user: 'crm', password: 'tajne-haslo-smtp', from_email: 'crm@diagnos.example', from_name: 'DIAGNOS CRM' });
    await admin.put('/api/settings/sms', { provider: 'http', http_url: `http://127.0.0.1:${smsGw.port}/send`, http_method: 'POST', sender: 'DIAGNOS', token: 'tajny-token' });
    smtpConfigured = smsConfigured = true;
    const s = await admin.get('/api/settings/smtp');
    C.check('E-mail', 'hasło SMTP nie wraca do przeglądarki', !!s && !JSON.stringify(s).includes('tajne-haslo-smtp') && s.has_password === true, JSON.stringify(s).slice(0, 200));
    const t = await admin.post('/api/settings/smtp/test', { to: 'test@diagnos.example' });
    C.check('E-mail', 'wiadomość testowa SMTP dociera', t?.ok === true, JSON.stringify(t));
    expectEmail('test@diagnos.example', 'DIAGNOS CRM: wiadomość testowa');
    await runTick();
    const out = (await admin.get('/api/outbox')) ?? [];
    C.check('E-mail', 'po skonfigurowaniu kanałów zaległe wiadomości wychodzą z kolejki', out.every((o: any) => o.status === 'sent'), JSON.stringify(out.map((o: any) => [o.channel, o.status])));
  });
  // Dzień 2: import bazy z Excela / programu fakturującego.
  at(1, '10:00', 'import kontrahentów, osób, towarów i sprzedaży z plików', importScenario);
  // Dzień 3: dokumenty z uprawnieniami.
  at(2, '11:00', 'dokumenty: segregator z ograniczonym dostępem', documentScenario);
  // Dzień 4: korespondencja seryjna.
  at(3, '10:30', 'korespondencja seryjna do grupy kontrahentów', campaignScenario);
  // Dzień 9: awaria serwera poczty na kilka godzin.
  at(8, '10:00', 'awaria serwera SMTP i bramki SMS', async () => {
    smtp.state.down = true;
    smsGw.state.down = true;
    note('Awaria serwera poczty i bramki SMS (10:00–13:00).');
  });
  at(8, '13:00', 'koniec awarii; kierownik ponawia nieudane wysyłki', async () => {
    smtp.state.down = false;
    smsGw.state.down = false;
    const out = (await kier.get('/api/outbox')) ?? [];
    const failed = out.filter((o: any) => o.status === 'failed');
    const stuck = out.filter((o: any) => o.status === 'sending');
    C.check('E-mail', 'w czasie awarii wiadomości nie giną: są w kolejce jako błąd wysyłki lub oczekujące', stuck.length === 0, `${stuck.length} pozycji utknęło w stanie „wysyłanie”`);
    C.check('E-mail', 'nieudana wysyłka ma zapisany opis błędu', failed.every((o: any) => !!o.last_error), `${failed.filter((o: any) => !o.last_error).length} bez opisu`);
    for (const o of failed) await kier.post(`/api/outbox/${o.id}/retry`);
    await kier.post('/api/outbox/process');
    note(`Po awarii ponowiono ${failed.length} wysyłek.`);
    bump('wysyłki ponowione po awarii', failed.length);
  });
  // Dzień 12: druga kampania do wybranych kontrahentów (wynik filtra), z załącznikiem z rejestru dokumentów.
  at(11, '09:30', 'korespondencja seryjna do wyniku filtra z dokumentem w załączniku', campaignFilterScenario);
  // Usuwanie i dezaktywacja.
  at(6, '14:00', 'kierownik usuwa pustego kontrahenta i dezaktywuje innego', async () => {
    const co = makeCompany(rng);
    const r = await kier.post('/api/contractors', { name: co.name, short_name: co.short_name, owner_id: kier.id });
    const t = ((await admin.get(`/api/tasks?contractor_id=${r.id}&archived=1`)) ?? [])[0];
    const stillBlocked = await kier.raw('DELETE', `/api/contractors/${r.id}`);
    C.check('Kontrahenci', 'kontrahent z zadaniem (choćby automatycznym) nie daje się usunąć', stillBlocked.status === 409, `→ ${stillBlocked.status}`);
    if (t) await kier.del(`/api/tasks/${t.id}`);
    const del = await kier.raw('DELETE', `/api/contractors/${r.id}`);
    C.check('Kontrahenci', 'kontrahent bez powiązań daje się usunąć', del.status === 200, `→ ${del.status}`);
    const victim = [...M.contractors.values()].find((c) => c.active && c.ownerId === kier.id) ?? [...M.contractors.values()][0];
    await kier.put(`/api/contractors/${victim.id}`, { active: false });
    victim.active = false;
    const dup = [...M.contractors.values()][1];
    const full = await admin.get(`/api/contractors/${dup.id}`);
    const d = await team[0].raw('POST', '/api/contractors', { name: 'Duplikat NIP', nip: full.nip });
    C.check('Kontrahenci', 'próba dodania kontrahenta z istniejącym NIP daje ostrzeżenie o duplikacie', d.status === 409, `→ ${d.status}`);
    const badNip = await team[0].raw('POST', '/api/contractors', { name: 'Zły NIP', nip: '1234567890' });
    C.check('Kontrahenci', 'NIP z błędną sumą kontrolną jest odrzucany', badNip.status === 400, `→ ${badNip.status}`);
  });
  // Równoległe zapisy: numeracja bez duplikatów.
  at(4, '11:30', 'dwudziestu równoczesnych wpisów korespondencji', async () => {
    const c = anyContractor()!;
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => team[i % 4].post('/api/correspondence', { kind_id: kindId('note'), direction: 'out', event_at: simNow.slice(0, 16), topic_text: `Notatka równoległa ${i}`, contractor_id: c.id, body: 'x' })));
    rs.forEach((r, i) => r && M.corr.set(r.id, { id: r.id, op: team[i % 4].id, kind: kindName('note'), dir: 'out', eventAt: simNow, dur: 0, contractorId: c.id, projectId: null, deleted: false }));
    const nums = rs.map((r) => r?.number);
    C.check('Korespondencja', 'równoczesne zapisy dostają różne numery', new Set(nums).size === 20, JSON.stringify(nums));
  });
}

async function xlsxBuffer(header: string[], rows: any[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dane');
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function doImport(b: Bot, kind: string, fileName: string, content: Buffer) {
  const up = await b.upload('/api/import/upload', { kind }, { name: fileName, content });
  if (up.status >= 300) return null;
  return b.post('/api/import/run', { token: up.json.token, mapping: up.json.mapping, source: 'enova365' });
}

async function importScenario() {
  // kontrahenci: 30 poprawnych + 2 błędne wiersze
  const header = ['Kod kontrahenta', 'Nazwa', 'Skrót', 'NIP', 'Ulica', 'Kod pocztowy', 'Miasto', 'Województwo', 'Telefon', 'E-mail', 'Status', 'Grupa', 'Prowadzący', 'Kluczowy', 'Segment'];
  const imp: any[] = [];
  const rows: any[][] = [];
  for (let i = 0; i < 30; i++) {
    const co = makeCompany(rng);
    const owner = rng.pick(team);
    const isKey = i % 5 === 0;
    imp.push({ ext: `ENV-${1000 + i}`, co, owner, isKey });
    rows.push([`ENV-${1000 + i}`, co.name, co.short_name, co.nip, co.street, co.postal_code, co.city, co.voivodeship, co.phone, co.email, 'Aktywny', 'Handel', owner.login, isKey ? 'tak' : 'nie', 'B']);
  }
  rows.push(['ENV-9001', 'Firma z błędnym NIP', 'BLEDNA', '1234567890', '', '', 'Łódź', '', '', '', 'Aktywny', 'Handel', '', 'nie', '']);
  rows.push(['ENV-9002', '', 'BEZNAZWY', makeNip(rng), '', '', 'Łódź', '', '', '', '', '', '', '', '']);
  const file = await xlsxBuffer(header, rows);
  const before = M.contractors.size;
  const r = await doImport(admin, 'contractors', 'kontrahenci-enova.xlsx', file);
  C.eq('Import', 'import kontrahentów: 30 dodanych, 2 odrzucone z podaniem przyczyny', [r?.added, r?.updated, r?.rejected], [30, 0, 2]);
  C.check('Import', 'odrzucone wiersze mają opis przyczyny', (r?.results ?? []).filter((x: any) => x.status === 'odrzucono').every((x: any) => !!x.reason), JSON.stringify((r?.results ?? []).filter((x: any) => x.status === 'odrzucono')));
  const list = (await admin.get('/api/contractors?all=1')) ?? [];
  for (const x of imp) {
    const c = list.find((y: any) => y.nip === x.co.nip);
    C.check('Import', 'zaimportowany kontrahent ma poprawne dane, prowadzącego, słowniki i pole dodatkowe', !!c && c.name === x.co.name && c.city === x.co.city && c.owner_id === x.owner.id && c.status_name === 'Aktywny' && c.group_name === 'Handel' && !!c.is_key === x.isKey && c.custom?.segment === 'B' && c.external_id === x.ext, () => JSON.stringify(c ? { name: c.name, city: c.city, owner: c.owner_id, st: c.status_name, g: c.group_name, key: c.is_key, custom: c.custom, ext: c.external_id } : null));
    if (!c) continue;
    M.contractors.set(c.id, { id: c.id, name: x.co.name, short: x.co.short_name, city: x.co.city, ownerId: x.owner.id, email: x.co.email, active: true, isKey: x.isKey, groupId: dict('contractor_group', 'Handel'), statusId: dict('contractor_status', 'Aktywny'), contacts: [], imported: true });
    x.id = c.id;
    await expectRuleTask(admin, c.id, x.owner.id);
  }
  C.eq('Import', 'liczba kontrahentów po imporcie', list.length, before + 30);
  // ponowny import tego samego pliku ze zmienioną nazwą jednej firmy: aktualizacja, bez duplikatów
  rows[0][1] = imp[0].co.name + ' (po zmianie)';
  const r2 = await doImport(admin, 'contractors', 'kontrahenci-enova.xlsx', await xlsxBuffer(header, rows));
  C.eq('Import', 'ponowny import: 0 dodanych, 30 zaktualizowanych, bez duplikatów', [r2?.added, r2?.updated, r2?.rejected], [0, 30, 2]);
  const list2 = (await admin.get('/api/contractors?all=1')) ?? [];
  C.eq('Import', 'liczba kontrahentów po ponownym imporcie bez zmian', list2.length, before + 30);
  C.check('Import', 'ponowny import aktualizuje dane po identyfikatorze zewnętrznym', list2.find((y: any) => y.id === imp[0].id)?.name === imp[0].co.name + ' (po zmianie)', list2.find((y: any) => y.id === imp[0].id)?.name);
  M.contractors.get(imp[0].id)!.name = imp[0].co.name + ' (po zmianie)';
  const tasksAfter = ((await admin.get('/api/tasks?archived=1')) ?? []).filter((t: any) => t.rule_id === ruleContact.id).length;
  C.eq('Import', 'ponowny import nie tworzy drugi raz zadań „kontakt”', tasksAfter, [...M.tasks.values()].filter((t) => t.ruleId === ruleContact.id).length);

  // osoby kontaktowe: CSV ze średnikami i polskimi znakami (typowy eksport z Excela)
  const people = imp.slice(0, 20).map((x, i) => ({ x, p: makePerson(rng, x.co.slug, i) }));
  const csv = ['Kod kontrahenta;Imię;Nazwisko;Stanowisko;Telefon;E-mail', ...people.map(({ x, p }) => `${x.ext};${p.first_name};${p.last_name};${p.position};${p.phone};${p.email}`)].join('\r\n');
  const rc = await doImport(admin, 'contacts', 'osoby.csv', Buffer.from('﻿' + csv, 'utf8'));
  C.eq('Import', 'import osób kontaktowych z CSV (średniki, polskie znaki)', [rc?.added, rc?.rejected], [20, 0]);
  const contacts = (await admin.get('/api/contacts')) ?? [];
  for (const { x, p } of people) {
    const got = contacts.find((c: any) => c.email === p.email);
    C.check('Import', 'osoba z CSV przypisana do właściwego kontrahenta, z polskimi znakami', !!got && got.contractor_id === x.id && got.first_name === p.first_name && got.last_name === p.last_name, () => JSON.stringify(got ? [got.contractor_id, got.first_name, got.last_name] : null));
    if (got) M.contractors.get(x.id)!.contacts.push({ id: got.id, email: p.email, name: `${p.first_name} ${p.last_name}` });
  }
  // kartoteka towarowa
  const pr = await doImport(admin, 'products', 'towary.xlsx', await xlsxBuffer(['Indeks', 'Nazwa', 'JM', 'Cena netto', 'VAT'], [['IMP-1', 'Odczynnik kontrolny K-1', 'op.', 129.5, 8], ['IMP-2', 'Papier do drukarki termicznej', 'rolka', 12.3, 23], ['T-1', 'Analizator AX-200', 'szt.', 12900, 23]]));
  C.eq('Import', 'import towarów: 2 nowe, 1 zaktualizowany po indeksie', [pr?.added, pr?.updated, pr?.rejected], [2, 1, 0]);
  const prods = (await admin.get('/api/products')) ?? [];
  C.near('Import', 'cena towaru zaktualizowana importem', prods.find((p: any) => p.sku === 'T-1')?.net_price, 12900);
  M.products[0].price = 12900;
  // transakcje sprzedaży: dokumenty wielopozycyjne
  const sh = ['Numer dokumentu', 'Data', 'Kod kontrahenta', 'Handlowiec', 'Towar', 'Ilość', 'Cena netto', 'VAT', 'ID dokumentu'];
  const srows: any[][] = [];
  const docs: { op: Bot; cid: number; date: string; net: number; gross: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const x = imp[i];
    const op = rng.pick(team);
    const date = addDays(today(), -rng.int(0, 1)); // część dokumentów sprzed startu symulacji
    let net = 0;
    let gross = 0;
    const n = rng.int(1, 3);
    for (let j = 0; j < n; j++) {
      const qty = rng.int(1, 6);
      const price = round2(rng.int(1000, 90000) / 100);
      const vat = rng.pick([23, 8]);
      srows.push([`FS/${i + 1}/03/2026`, date, x.ext, op.login, `Towar importowany ${j + 1}`, qty, price, vat, `DOK-${i + 1}`]);
      const ln = round2(qty * price);
      net += ln;
      gross += round2(ln * (1 + vat / 100));
    }
    docs.push({ op, cid: x.id, date, net: round2(net), gross: round2(gross) });
  }
  const sr = await doImport(admin, 'sales', 'sprzedaz.xlsx', await xlsxBuffer(sh, srows));
  const sales = (await admin.get('/api/sales')) ?? [];
  C.eq('Import', 'import sprzedaży: 12 dokumentów złożonych z wielu wierszy', sales.filter((s: any) => /^FS\//.test(s.doc_number)).length, 12);
  C.eq('Import', 'import sprzedaży: żaden wiersz nie został odrzucony', sr?.rejected, 0);
  docs.forEach((d, i) => {
    const s = sales.find((y: any) => y.doc_number === `FS/${i + 1}/03/2026`);
    C.check('Import', 'zaimportowany dokument sprzedaży: kontrahent, handlowiec, data i wartości zgodne z plikiem', !!s && s.contractor_id === d.cid && s.operator_id === d.op.id && s.doc_date === d.date && Math.abs(s.net_total - d.net) < 0.011 && Math.abs(s.gross_total - d.gross) < 0.011, () => JSON.stringify(s ? [s.contractor_id, s.operator_id, s.doc_date, s.net_total, s.gross_total] : null) + ` oczekiwano ${JSON.stringify([d.cid, d.op.id, d.date, d.net, d.gross])}`);
    if (s) M.sales.push({ id: s.id, op: d.op.id, contractorId: d.cid, date: d.date, net: d.net, gross: d.gross });
  });
  const sr2 = await doImport(admin, 'sales', 'sprzedaz.xlsx', await xlsxBuffer(sh, srows));
  C.eq('Import', 'ponowny import sprzedaży nie dubluje dokumentów', ((await admin.get('/api/sales')) ?? []).length, M.sales.length, `dodano ${sr2?.added}`);
  note('Import: 30 kontrahentów, 20 osób, 3 towary, 12 dokumentów sprzedaży; ponowny import bez duplikatów.');
}

let contractDoc: MDoc | null = null;
async function documentScenario() {
  const c = anyContractor(team[0])!;
  // kierownik dodaje umowę do segregatora z ograniczonym dostępem (dział handlowy: wgląd, kierownik: edycja)
  const content = fakeFile('umowa-ramowa');
  const up = await kier.upload('/api/documents', { name: 'Umowa ramowa 2026', folder_id: String(folders['Umowy']), contractor_id: String(c.id) }, { name: 'Umowa ramowa — żółć.pdf', content, type: 'application/pdf' });
  if (up.status >= 300) return;
  const id = up.json.id;
  contractDoc = { id, name: 'Umowa ramowa 2026', folderId: folders['Umowy'], authorId: kier.id, contractorId: c.id, validTo: null, versions: [sha(content)], restricted: true };
  M.docs.push(contractDoc);
  const info = await kier.get(`/api/documents/${id}`);
  C.check('Dokumenty', 'nazwa pliku z polskimi znakami zachowana', info?.versions?.[0]?.original_name === 'Umowa ramowa — żółć.pdf', info?.versions?.[0]?.original_name);
  const h = team[1];
  const view = await h.raw('GET', `/api/documents/${id}/file`);
  C.check('Uprawnienia do dokumentów', 'pracownik uprawnionego działu pobiera dokument', view.status === 200 && sha(view.raw) === sha(content), `→ ${view.status}`);
  const edit = await h.raw('PUT', `/api/documents/${id}`, { name: 'Przejęta umowa', folder_id: folders['Umowy'] });
  C.check('Uprawnienia do dokumentów', 'uprawnienie „wgląd” nie pozwala edytować dokumentu', edit.status === 403, `→ ${edit.status}`);
  const ver = await h.upload(`/api/documents/${id}/versions`, {}, { name: 'podmiana.pdf', content: fakeFile('podmiana'), type: 'application/pdf' }, false);
  C.check('Uprawnienia do dokumentów', 'uprawnienie „wgląd” nie pozwala dodać nowej wersji', ver.status === 403, `→ ${ver.status}`);
  const addTo = await h.upload('/api/documents', { name: 'Wrzutka', folder_id: String(folders['Umowy']) }, { name: 'wrzutka.pdf', content: fakeFile('wrzutka'), type: 'application/pdf' }, false);
  C.check('Uprawnienia do dokumentów', 'bez uprawnienia „edycja” nie można dodać dokumentu do segregatora', addTo.status === 403, `→ ${addTo.status}`);
  for (const [label, url] of [['kartę dokumentu', `/api/documents/${id}`], ['plik dokumentu', `/api/documents/${id}/file`], ['starszą wersję pliku', `/api/documents/${id}/file?version=0`], ['uprawnienia dokumentu', `/api/permissions/document/${id}`]] as const) {
    const r = await serwis.raw('GET', url);
    C.check('Uprawnienia do dokumentów', `operator spoza uprawnionych nie otworzy: ${label}`, r.status === 403, `${url} → ${r.status}`);
  }
  const list = (await serwis.get('/api/documents')) ?? [];
  C.check('Uprawnienia do dokumentów', 'dokument bez uprawnień nie pojawia się w rejestrze', !list.some((d: any) => d.id === id), '');
  const att = (await serwis.get(`/api/contractors/${c.id}/attachments`)) ?? [];
  C.check('Uprawnienia do dokumentów', 'dokument bez uprawnień nie pojawia się w załącznikach kartoteki kontrahenta', !att.some((a: any) => a.document_id === id), '');
  // dokument dołączony jako załącznik korespondencji nadal chroniony
  const k = await kier.post('/api/correspondence', { kind_id: kindId('note'), direction: 'out', event_at: simNow.slice(0, 16), topic_text: 'Umowa w załączniku', contractor_id: c.id });
  M.corr.set(k.id, { id: k.id, op: kier.id, kind: kindName('note'), dir: 'out', eventAt: simNow, dur: 0, contractorId: c.id, projectId: null, deleted: false });
  const a = await kier.post(`/api/attachments/correspondence/${k.id}/from-document`, { document_id: id });
  const leak = await serwis.raw('GET', `/api/attachments/${a.id}/file`);
  C.check('Uprawnienia do dokumentów', 'chroniony dokument dołączony do korespondencji nie daje się pobrać bez uprawnień', leak.status === 403, `→ ${leak.status}`);
  const steal = await serwis.raw('POST', `/api/attachments/correspondence/${k.id}/from-document`, { document_id: id });
  C.check('Uprawnienia do dokumentów', 'nie można dołączyć jako załącznik dokumentu, do którego nie ma się dostępu', steal.status === 403, `→ ${steal.status}`);
  // uprawnienie imienne dla operatora spoza działu
  await kier.put(`/api/permissions/document/${id}`, { entries: [{ subject_type: 'operator', subject_id: serwis.id, level: 'view' }, { subject_type: 'operator', subject_id: kier.id, level: 'edit' }] });
  const granted = await serwis.raw('GET', `/api/documents/${id}/file`);
  C.check('Uprawnienia do dokumentów', 'uprawnienie imienne daje dostęp do pojedynczego dokumentu', granted.status === 200, `→ ${granted.status}`);
  const h2 = await h.raw('GET', `/api/documents/${id}/file`);
  C.check('Uprawnienia do dokumentów', 'uprawnienia dokumentu zastępują uprawnienia segregatora', h2.status === 403, `pracownik działu po zawężeniu → ${h2.status}`);
  await kier.put(`/api/permissions/document/${id}`, { entries: [] });
  // rejestr zmian
  const log = (await kier.get(`/api/documents/${id}`))?.log ?? [];
  const actions = log.map((l: any) => l.action);
  C.check('Dokumenty', 'rejestr zmian dokumentu notuje dodanie, pobrania i zmiany uprawnień z osobą i datą', actions.includes('dodanie') && actions.includes('pobranie') && actions.includes('zmiana uprawnień') && log.every((l: any) => l.operator && l.at), JSON.stringify(actions));
  // zapis załącznika korespondencji do rejestru dokumentów
  const k2 = await team[0].post('/api/correspondence', { kind_id: kindId('email'), direction: 'in', event_at: simNow.slice(0, 16), topic_text: 'Zapytanie ofertowe z załącznikiem', contractor_id: c.id });
  M.corr.set(k2.id, { id: k2.id, op: team[0].id, kind: kindName('email'), dir: 'in', eventAt: simNow, dur: 0, contractorId: c.id, projectId: null, deleted: false });
  const spec = fakeFile('specyfikacja', 'txt');
  const upa = await team[0].upload(`/api/attachments/correspondence/${k2.id}`, {}, { name: 'specyfikacja.txt', content: spec, type: 'text/plain' });
  const saved = await team[0].post(`/api/attachments/${upa.json.ids[0]}/to-document`, { folder_id: folders['Załączniki korespondencji'] });
  const f = await team[0].raw('GET', `/api/documents/${saved.id}/file`);
  C.check('Dokumenty', 'załącznik z wiadomości zapisuje się do rejestru dokumentów przy kontrahencie', f.status === 200 && sha(f.raw) === sha(spec) && ((await team[0].get(`/api/documents?contractor_id=${c.id}`)) ?? []).some((d: any) => d.id === saved.id), `→ ${f.status}`);
  M.docs.push({ id: saved.id, name: 'specyfikacja', folderId: folders['Załączniki korespondencji'], authorId: team[0].id, contractorId: c.id, validTo: null, versions: [sha(spec)] });
  // plik z aktywną treścią (HTML/SVG) nie może zostać wyświetlony w przeglądarce w sesji innego operatora
  for (const [fname, mime, payload] of [['cennik.html', 'text/html', '<script>alert(1)</script>'], ['logo.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], ['faktura.pdf', 'text/html', '<script>alert(1)</script>']] as const) {
    const x = await team[0].upload('/api/documents', { name: `Plik ${fname}`, folder_id: String(folders['Katalogi']) }, { name: fname, content: Buffer.from(payload), type: mime });
    const g = await admin.raw('GET', `/api/documents/${x.json.id}/file?inline=1`);
    const ct = String(g.headers['content-type'] ?? '');
    const cd = String(g.headers['content-disposition'] ?? '');
    const safe = !/html|svg|xml/i.test(ct) && (cd.startsWith('attachment') || /^application\/pdf/.test(ct)) && g.headers['x-content-type-options'] === 'nosniff' && /sandbox/.test(String(g.headers['content-security-policy'] ?? ''));
    C.check('Bezpieczeństwo plików', 'plik HTML/SVG lub z fałszywym typem nie jest wykonywany w przeglądarce (pobieranie zamiast podglądu, nosniff, sandbox)', safe, `${fname}: ${ct}; ${cd.slice(0, 30)}; nosniff=${g.headers['x-content-type-options']}`);
    M.docs.push({ id: x.json.id, name: `Plik ${fname}`, folderId: folders['Katalogi'], authorId: team[0].id, contractorId: null, validTo: null, versions: [sha(Buffer.from(payload))], restricted: true });
  }
  note('Dokumenty: sprawdzono uprawnienia segregatora i dokumentu, wersje, rejestr zmian, pliki z aktywną treścią.');
}

async function campaignScenario() {
  const groupId = dict('contractor_group', 'Handel');
  const pv = await kier.post('/api/campaigns/preview', { target: { type: 'group', group_id: groupId }, recipient_mode: 'primary', subject: 'Zaproszenie dla {{firma}}', body: 'Dzień dobry {{osoba}},\nzapraszamy firmę {{firma_pelna}} z miasta {{miasto}} na pokaz.\n{{operator}}' });
  const targets = [...M.contractors.values()].filter((c) => c.active && c.groupId === groupId);
  const exp = targets.map((c) => ({ c, email: c.contacts.find((p) => p.email)?.email ?? c.email, person: c.contacts.find((p) => p.email)?.name ?? '' }));
  C.eq('Korespondencja seryjna', 'podgląd: liczba odbiorców = liczba aktywnych kontrahentów grupy', pv?.total, targets.length);
  const before = smtp.messages.length;
  const r = await kier.post('/api/campaigns', { name: 'Zaproszenie na pokaz — marzec', target: { type: 'group', group_id: groupId }, recipient_mode: 'primary', subject: 'Zaproszenie dla {{firma}}', body: 'Dzień dobry {{osoba}},\nzapraszamy firmę {{firma_pelna}} z miasta {{miasto}} na pokaz.\n{{operator}}' });
  if (!r) return;
  for (let i = 0; i < 6; i++) await kier.post('/api/outbox/process');
  const camp = await kier.get(`/api/campaigns/${r.id}`);
  C.eq('Korespondencja seryjna', 'każdy odbiorca z adresem ma status „wysłano”', camp?.recipients?.filter((x: any) => x.status === 'sent').length, exp.filter((e) => e.email).length);
  C.eq('Korespondencja seryjna', 'odbiorcy bez adresu są pominięci z informacją', camp?.recipients?.filter((x: any) => x.status === 'skipped').length, exp.filter((e) => !e.email).length);
  const got = smtp.messages.slice(before);
  for (const e of exp.filter((x) => x.email)) {
    const subject = `Zaproszenie dla ${e.c.short || e.c.name}`;
    const m = got.find((x) => x.rcpt.includes(e.email!) && x.subject === subject);
    C.check('Korespondencja seryjna', 'każdy odbiorca dostaje własną wiadomość z podstawionymi polami', !!m && (m.text ?? '').includes(`zapraszamy firmę ${e.c.name} z miasta ${e.c.city}`) && (m.text ?? '').includes(`Dzień dobry ${e.person},`) && (m.text ?? '').includes(kier.name), () => `${e.email}: ${m ? (m.text ?? '').slice(0, 160) : 'brak wiadomości'}`);
    expectEmail(e.email!, subject);
  }
  // u każdego kontrahenta powstał wpis korespondencji
  const corr = (await admin.get(`/api/correspondence?campaign_id=${r.id}`)) ?? [];
  C.eq('Korespondencja seryjna', 'u każdego odbiorcy powstaje wpis korespondencji wychodzącej', corr.map((k: any) => k.contractor_id).sort((a: number, b: number) => a - b), exp.filter((e) => e.email).map((e) => e.c.id).sort((a, b) => a - b));
  for (const k of corr) M.corr.set(k.id, { id: k.id, op: kier.id, kind: kindName('email'), dir: 'out', eventAt: k.event_at, dur: 0, contractorId: k.contractor_id, projectId: null, deleted: false, sent: true });
  bump('e-maile z korespondencji seryjnej', exp.filter((e) => e.email).length);
  note(`Korespondencja seryjna do grupy Handel: ${exp.filter((e) => e.email).length} wiadomości.`);
}

async function campaignFilterScenario() {
  const pool = [...M.contractors.values()].filter((c) => c.active && c.city === 'Kraków');
  const ids = (pool.length >= 3 ? pool : [...M.contractors.values()].filter((c) => c.active)).slice(0, 8).map((c) => c.id);
  const doc = M.docs.find((d) => !d.restricted && d.versions.length === 1 && d.authorId === team[0].id) ?? M.docs.find((d) => !d.restricted)!;
  const before = smtp.messages.length;
  const r = await team[0].post('/api/campaigns', { name: 'Nowy cennik', target: { type: 'ids', contractor_ids: ids }, target_desc: 'Filtr: wybrani kontrahenci', recipient_mode: 'contacts', subject: 'Nowy cennik — {{firma}}', body: 'Szanowna Pani / Szanowny Panie {{imie}} {{nazwisko}},\nw załączniku aktualny cennik.', document_ids: [doc.id] });
  if (!r) return;
  for (let i = 0; i < 6; i++) await team[0].post('/api/outbox/process');
  const got = smtp.messages.slice(before);
  let expected = 0;
  for (const id of ids) {
    const c = M.contractors.get(id)!;
    for (const p of c.contacts.filter((x) => x.email)) {
      expected++;
      const subject = `Nowy cennik — ${c.short || c.name}`;
      const m = got.find((x) => x.rcpt.includes(p.email!) && x.subject === subject);
      C.check('Korespondencja seryjna', 'tryb „wszystkie osoby kontaktowe”: wiadomość do każdej osoby z adresem, z załącznikiem z rejestru dokumentów', !!m && m.attachments.length === 1 && (m.text ?? '').includes(p.name), () => `${p.email}: ${m ? `załączników ${m.attachments.length}` : 'brak wiadomości'}`);
      expectEmail(p.email!, subject);
    }
  }
  const corr = (await admin.get(`/api/correspondence?campaign_id=${r.id}`)) ?? [];
  C.eq('Korespondencja seryjna', 'liczba wpisów korespondencji = liczba wysłanych wiadomości', corr.length, expected);
  for (const k of corr) M.corr.set(k.id, { id: k.id, op: team[0].id, kind: kindName('email'), dir: 'out', eventAt: k.event_at, dur: 0, contractorId: k.contractor_id, projectId: null, deleted: false, sent: true });
  const stolen = await serwis.raw('POST', '/api/campaigns', { name: 'x', target: { type: 'ids', contractor_ids: ids.slice(0, 1) }, recipient_mode: 'primary', subject: 's', body: 'b', document_ids: [contractDoc?.id ?? doc.id] });
  if (contractDoc) C.check('Uprawnienia do dokumentów', 'nie można rozesłać dokumentu, do którego nie ma się dostępu', stolen.status === 403, `→ ${stolen.status}`);
  bump('e-maile z korespondencji seryjnej', expected);
}

// ---------- Przebieg dnia ----------
async function runDay(dayIndex: number, date: string) {
  const work = weekday(date) <= 5;
  if (!work) {
    for (const t of ['09:00', '15:10', '18:05', '23:30']) {
      setNow(slotIso(date, t));
      await runTick();
    }
    return;
  }
  setNow(slotIso(date, '07:45'));
  await runTick();
  await morningChecks();
  for (let m = 8 * 60; m <= 16 * 60; m += 15) {
    const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    setNow(slotIso(date, time));
    await runTick();
    await pollAll();
    for (const s of scripted.filter((x) => x.day === dayIndex && x.time === time)) {
      await s.run();
    }
    for (const b of bots) {
      const p = b === serwis ? INTENSITY * 0.5 : INTENSITY;
      if (rng.chance(p)) await rng.weighted(ACTIONS)(b);
    }
  }
  for (const t of ['16:35', '18:05']) {
    setNow(slotIso(date, t));
    await runTick();
  }
  await eveningChecks();
  if (weekday(date) === 5) await reportChecks(addDays(date, -4), date);
  setNow(slotIso(date, '23:30'));
  await runTick();
}

// ---------- Sprawdzenia końcowe ----------
async function finalChecks(firstDay: string, lastDayDate: string) {
  setNow(slotIso(lastDayDate, '23:45'));
  for (let i = 0; i < 5; i++) await runTick();
  await reportChecks(firstDay, lastDayDate);
  await reportChecks(`${lastDayDate.slice(0, 8)}01`, lastDayDate);

  // E-maile: każdy oczekiwany doszedł dokładnie raz; nic nadmiarowego.
  const scheduleMails = smtp.messages.filter((m) => /^(Tygodniowa statystyka zadań|Miesięczna sprzedaż):/.test(m.subject ?? ''));
  const got = new Map<string, number>();
  for (const m of smtp.messages) {
    if (scheduleMails.includes(m)) continue;
    for (const to of m.rcpt) got.set(`${to}|${m.subject}`, (got.get(`${to}|${m.subject}`) ?? 0) + 1);
  }
  for (const [k, n] of M.emails) C.check('E-mail', 'każda wiadomość dociera do adresata dokładnie raz (także po awarii i ponowieniu)', (got.get(k) ?? 0) === n, `${k}: doszło ${got.get(k) ?? 0}, powinno ${n}`);
  for (const [k, n] of got) C.check('E-mail', 'system nie wysyła wiadomości, których nikt nie zlecił', M.emails.has(k), `${k}: ${n} szt.`);
  const gotSms = new Map<string, number>();
  for (const m of smsGw.messages) gotSms.set(`${m.to}|${m.message}`, (gotSms.get(`${m.to}|${m.message}`) ?? 0) + 1);
  for (const [k, n] of M.sms) C.check('SMS', 'każdy SMS trafia do bramki dokładnie raz', (gotSms.get(k) ?? 0) === n, `${k.slice(0, 90)}: doszło ${gotSms.get(k) ?? 0}, powinno ${n}`);
  for (const [k] of gotSms) C.check('SMS', 'system nie wysyła SMS-ów, których nikt nie zlecił', M.sms.has(k), k.slice(0, 90));
  C.check('SMS', 'SMS ma ustawionego nadawcę i polskie znaki', smsGw.messages.every((m) => m.from === 'DIAGNOS') && (smsGw.messages.length === 0 || smsGw.messages.some((m) => /[ąćęłńóśźż—]/i.test(m.message))), '');

  // Raporty automatyczne: co piątek 16:30 i ostatniego dnia miesiąca 18:00, z plikiem PDF.
  const fridays = range(firstDay, lastDayDate).filter((d) => weekday(d) === 5);
  const weekly = scheduleMails.filter((m) => m.subject!.startsWith('Tygodniowa statystyka zadań:'));
  C.eq('Raporty automatyczne', 'raport tygodniowy wysłany w każdy piątek, po jednym', weekly.length, fridays.length);
  const monthEnds = range(firstDay, lastDayDate).filter((d) => Number(d.slice(8, 10)) === lastDay(Number(d.slice(0, 4)), Number(d.slice(5, 7))));
  const monthly = scheduleMails.filter((m) => m.subject!.startsWith('Miesięczna sprzedaż:'));
  C.eq('Raporty automatyczne', 'raport miesięczny wysłany ostatniego dnia miesiąca do obu odbiorców', monthly.map((m) => m.rcpt[0]).sort(), monthEnds.flatMap(() => ['ksiegowosc@diagnos.example', 'zarzad@diagnos.example']).sort());
  for (const m of scheduleMails) C.check('Raporty automatyczne', 'wiadomość z raportem ma załącznik PDF', m.attachments.length === 1 && m.attachments[0].content.subarray(0, 5).toString() === '%PDF-' && m.attachments[0].content.length > 2000, `${m.subject}: załączników ${m.attachments.length}`);
  for (const m of monthly) for (const d of monthEnds) C.check('Raporty automatyczne', 'raport miesięczny obejmuje okres od 1. do ostatniego dnia miesiąca', m.subject!.includes(`${plDate(d.slice(0, 8) + '01')}–${plDate(d)}`) || monthEnds.length > 1, m.subject);

  // Kolejka wysyłki i spójność bazy.
  const out = (await admin.get('/api/outbox')) ?? [];
  C.check('E-mail', 'na koniec w kolejce nie zostają niewysłane wiadomości', out.every((o: any) => o.status === 'sent' || o.status === 'cancelled'), JSON.stringify(out.filter((o: any) => o.status !== 'sent' && o.status !== 'cancelled').map((o: any) => [o.channel, o.status, o.last_error]).slice(0, 5)));
  const db = ctx.db;
  C.eq('Spójność danych', 'baza przechodzi kontrolę integralności', db.all<any>('PRAGMA integrity_check').map((r) => Object.values(r)[0]), ['ok']);
  C.eq('Spójność danych', 'brak naruszonych powiązań między tabelami', db.all('PRAGMA foreign_key_check').length, 0);
  const orphan = (sql: string) => db.get<any>(sql)!.n as number;
  C.eq('Spójność danych', 'każdy załącznik wskazuje istniejący obiekt', orphan(`SELECT COUNT(*) AS n FROM attachments a WHERE (a.owner_type='correspondence' AND NOT EXISTS (SELECT 1 FROM correspondence k WHERE k.id=a.owner_id)) OR (a.owner_type='task' AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id=a.owner_id)) OR (a.owner_type='contractor' AND NOT EXISTS (SELECT 1 FROM contractors c WHERE c.id=a.owner_id))`), 0);
  C.eq('Spójność danych', 'przypomnienia nie wiszą przy usuniętych zadaniach', orphan('SELECT COUNT(*) AS n FROM reminders r WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = r.task_id)'), 0);
  C.eq('Spójność danych', 'każde zadanie ma co najmniej jednego wykonawcę', orphan('SELECT COUNT(*) AS n FROM tasks t WHERE NOT EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id)'), 0);
  C.eq('Spójność danych', 'zadania wykonane mają 100% i datę wykonania', orphan("SELECT COUNT(*) AS n FROM tasks t JOIN dict_items d ON d.id = t.status_id WHERE (d.code = 'done') <> (t.progress = 100) OR (d.code = 'done') <> (t.done_at IS NOT NULL)"), 0);
  const files = db.all<any>('SELECT * FROM files');
  const missing = files.filter((f) => !fs.existsSync(path.join(ctx.config.filesDir, f.storage_name)));
  C.eq('Spójność danych', 'każdy plik z bazy istnieje na dysku', missing.length, 0, Object.keys(files[0] ?? {}).join(','));
  for (const kind of ['K', 'D', 'ZAM']) {
    const table = { K: 'correspondence', D: 'documents', ZAM: 'orders' }[kind]!;
    const d = db.get<any>(`SELECT COUNT(*) - COUNT(DISTINCT number) AS n FROM ${table}`)!.n;
    C.eq('Spójność danych', 'numery dokumentów, korespondencji i zamówień są unikalne', d, 0, table);
  }
  // eksport rejestru do XLSX z polskimi znakami
  const ex = await admin.raw('POST', '/api/export/xlsx', { title: 'Kontrahenci — żółć', columns: [{ label: 'Nazwa' }, { label: 'Limit', type: 'money' }], rows: [['Świętochłowickie Zakłady Źródlane', 1234.5], ['=HYPERLINK("http://zly.example")', 1]] });
  let cell = '';
  let formula = false;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(ex.raw as any);
    cell = String(wb.worksheets[0].getRow(2).getCell(1).value);
    const v: any = wb.worksheets[0].getRow(3).getCell(1).value;
    formula = typeof v === 'object' && v !== null && 'formula' in v;
  } catch {
    /* niepoprawny plik */
  }
  C.check('Rejestry', 'eksport rejestru do XLSX zachowuje polskie znaki', ex.status === 200 && cell === 'Świętochłowickie Zakłady Źródlane', `→ ${ex.status}, komórka: ${cell}`);
  C.check('Rejestry', 'eksport nie zamienia tekstu zaczynającego się od „=” w formułę', !formula, '');
  // sesja wygasa po okresie bezczynności
  C.check('Logowanie i sesje', 'sesja wygasa po nocy bezczynności i operator loguje się ponownie', bots.every((b) => b.relogins >= 1), JSON.stringify(bots.map((b) => [b.login, b.relogins])));
}

// ---------- Start ----------
async function main() {
  const t0 = Date.now();
  console.log(`Symulacja DIAGNOS CRM: ${DAYS} dni od ${START}, ziarno ${SEED}. Wyniki: ${path.relative('.', outDir)}`);
  await bootstrap();
  planScenario();
  const lastDate = addDays(START, DAYS - 1);
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(START, i);
    await runDay(i, date);
    if (weekday(date) === 5 || i === DAYS - 1) console.log(`  ${date}  kontrahenci ${M.contractors.size}, korespondencja ${M.corr.size}, zadania ${M.tasks.size}, e-maile ${smtp.messages.length}, sprawdzenia ${C.totalPass + C.totalFail} (błędne: ${C.totalFail})`);
  }
  await finalChecks(START, lastDate);

  let ui: Awaited<ReturnType<typeof runUi>> | null = null;
  if (WITH_UI && fs.existsSync(path.join(ctx.config.clientDir, 'index.html'))) {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as any).port;
    const sample = [...M.contractors.values()].find((c) => c.active && c.contacts.length > 0 && [...M.corr.values()].some((k) => k.contractorId === c.id && !k.deleted))!;
    ui = await runUi({
      baseUrl: `http://127.0.0.1:${port}`, simNow, outDir, checks: C, password: PW,
      users: [{ login: 'admin', role: 'admin' }, { login: kier.login, role: 'kierownik' }, { login: team[0].login, role: 'handlowiec' }],
      expected: {
        contractorsActive: [...M.contractors.values()].filter((c) => c.active).length,
        correspondence: [...M.corr.values()].filter((k) => !k.deleted).length,
        sales: M.sales.length, orders: M.orders, projects: M.projects.length, products: M.products.length + 2,
        sampleContractor: { id: sample.id, name: sample.name, correspondence: [...M.corr.values()].filter((k) => k.contractorId === sample.id && !k.deleted).length, contacts: sample.contacts.length },
        sampleProjectId: M.projects[0]?.id ?? null,
      },
      setServerNow: setNow, tick: runTick,
      createReminderTask: async (login: string) => {
        const b = [admin, ...bots].find((x) => x.login === login)!;
        const start = addMin(simNow, 20);
        const r = await b.post('/api/tasks', { title: 'Zadanie z przypomnieniem (test interfejsu)', start_at: start.slice(0, 16), end_at: addMin(start, 30).slice(0, 16), operator_ids: [b.id], remind_before_min: 10, remind_inapp: true });
        return { id: r.id, remindAt: addMin(start, -10) };
      },
    });
  } else if (WITH_UI) console.log('  (pominięto etap interfejsu: brak zbudowanego klienta w dist/client — uruchom najpierw `npm run build`)');

  const stats = {
    start: START, days: DAYS, seed: SEED, lastDate, durationSec: Math.round((Date.now() - t0) / 1000),
    requests: [admin, ...bots].reduce((s, b) => s + b.requests, 0),
    operators: bots.length + 1, contractors: M.contractors.size, contacts: [...M.contractors.values()].reduce((s, c) => s + c.contacts.length, 0),
    correspondence: [...M.corr.values()].filter((k) => !k.deleted).length, tasks: [...M.tasks.values()].filter((t) => !t.deleted).length,
    orders: M.orders, sales: M.sales.length, salesNet: round2(M.sales.reduce((s, x) => s + x.net, 0)), projects: M.projects.length, documents: M.docs.length,
    internalMessages: M.msgs.length, emails: smtp.messages.length, sms: smsGw.messages.length, reminders: M.counters['przypomnienia'] ?? 0, counters: M.counters,
  };
  const file = writeReport(outDir, C, stats, M.log, ui);
  await app.close();
  await smtp.close();
  await smsGw.close();
  ctx.db.close();
  if (!KEEP) fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\nSprawdzeń: ${C.totalPass + C.totalFail}, poprawnych: ${C.totalPass}, błędnych: ${C.totalFail} (w ${C.failed.length} rodzajach).`);
  for (const f of C.failed.slice(0, 40)) console.log(`  ✗ [${f.area}] ${f.name} — ${f.fail}× np. ${f.details[0] ?? ''}`);
  console.log(`Raport: ${path.relative('.', file)}`);
  process.exit(C.totalFail ? 1 : 0);
}

main().catch((e) => {
  console.error('Symulacja przerwana błędem:', e);
  process.exit(2);
});
