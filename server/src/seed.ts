// Dane przykładowe (fikcyjne) do prezentacji systemu. Uruchamianie: npm run seed
// Nie uruchamia się automatycznie. Odmawia działania, jeśli w bazie są już kontrahenci (chyba że podano --force).
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { loadConfig, openDb, type Ctx } from './context.js';
import { ensureAdmin, hashPassword } from './auth.js';
import { addDaysDate, makeNumber, nowIso, round2, todayIso, addMinutesIso } from './util.js';
import { createTask, generateSeries, statusIdByCode } from './services/tasks.js';
import { saveFile } from './services/files.js';
import { createDocument } from './routes/documents.js';
import { nextRun } from './services/reports.js';
import { assetsDir } from './services/pdf.js';

process.env.TZ ??= 'Europe/Warsaw';

let s = 20261121;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

export function makeNip(): string {
  for (;;) {
    const d = Array.from({ length: 9 }, (_, i) => (i === 0 ? int(1, 9) : int(0, 9)));
    const c = [6, 5, 7, 2, 3, 4, 5, 6, 7].reduce((sum, w, i) => sum + w * d[i], 0) % 11;
    if (c !== 10) return d.join('') + c;
  }
}
export function makeRegon(): string {
  const d = Array.from({ length: 8 }, () => int(0, 9));
  const c = ([8, 9, 2, 3, 4, 5, 6, 7].reduce((sum, w, i) => sum + w * d[i], 0) % 11) % 10;
  return d.join('') + c;
}

const CITIES: [string, string, string][] = [
  ['Kraków', 'małopolskie', '30-'],
  ['Kraków', 'małopolskie', '31-'],
  ['Warszawa', 'mazowieckie', '00-'],
  ['Warszawa', 'mazowieckie', '02-'],
  ['Wrocław', 'dolnośląskie', '50-'],
  ['Poznań', 'wielkopolskie', '60-'],
  ['Gdańsk', 'pomorskie', '80-'],
  ['Katowice', 'śląskie', '40-'],
  ['Łódź', 'łódzkie', '90-'],
  ['Lublin', 'lubelskie', '20-'],
  ['Rzeszów', 'podkarpackie', '35-'],
  ['Kielce', 'świętokrzyskie', '25-'],
  ['Opole', 'opolskie', '45-'],
  ['Białystok', 'podlaskie', '15-'],
  ['Tarnów', 'małopolskie', '33-'],
  ['Nowy Sącz', 'małopolskie', '33-'],
];
const STREETS = ['Długa', 'Krótka', 'Polna', 'Leśna', 'Słoneczna', 'Kwiatowa', 'Ogrodowa', 'Lipowa', 'Brzozowa', 'Przemysłowa', 'Fabryczna', 'Handlowa', 'Kościuszki', 'Mickiewicza', 'Słowackiego', 'Piłsudskiego', 'Grunwaldzka', 'Wielicka', 'Zakopiańska', 'Rynek'];
const NAME_A = ['Agro', 'Bud', 'Eko', 'Meta', 'Tech', 'Inter', 'Pol', 'Trans', 'Elektro', 'Medi', 'Info', 'Termo', 'Hydro', 'Drew', 'Plast', 'Stal', 'Gal', 'Nord', 'Vista', 'Sanit'];
const NAME_B = ['mex', 'pol', 'tron', 'bud', 'serwis', 'net', 'med', 'trans', 'max', 'land', 'chem', 'lux', 'plan', 'system', 'tech'];
const FORMS = ['Sp. z o.o.', 'S.A.', 'sp.j.', 'Sp. z o.o. sp.k.', 's.c.', ''];
const PREFIX = ['Przedsiębiorstwo Handlowe', 'Zakład Produkcyjny', 'Hurtownia', 'Firma Usługowa', 'Centrum', 'Spółdzielnia', 'Biuro Projektowe', 'Grupa'];
const FIRST = ['Anna', 'Katarzyna', 'Małgorzata', 'Agnieszka', 'Joanna', 'Ewa', 'Magdalena', 'Monika', 'Piotr', 'Krzysztof', 'Andrzej', 'Tomasz', 'Paweł', 'Michał', 'Marcin', 'Jakub', 'Łukasz', 'Grzegorz', 'Wojciech', 'Zofia'];
const LAST_M = ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur', 'Kwiatkowski', 'Krawczyk', 'Piotrowski', 'Grabowski'];
const fem = (last: string) => last.replace(/ski$/, 'ska').replace(/cki$/, 'cka').replace(/dzki$/, 'dzka');
const POSITIONS = ['Prezes Zarządu', 'Dyrektor handlowy', 'Kierownik zakupów', 'Specjalista ds. zakupów', 'Główna księgowa', 'Kierownik zmiany', 'Właściciel', 'Asystentka zarządu', 'Kierownik IT'];
const PRODUCTS: [string, string, number, number][] = [
  ['Analizator DIAG-100', 'szt.', 4890, 23],
  ['Analizator DIAG-200 Pro', 'szt.', 8790, 23],
  ['Moduł pomiarowy MP-12', 'szt.', 1290, 23],
  ['Czujnik temperatury CT-3', 'szt.', 189, 23],
  ['Czujnik ciśnienia CP-8', 'szt.', 349, 23],
  ['Zestaw kalibracyjny ZK-1', 'kpl.', 990, 23],
  ['Kabel pomiarowy 5 m', 'szt.', 79, 23],
  ['Kabel pomiarowy 10 m', 'szt.', 119, 23],
  ['Licencja oprogramowania DIAG Soft (rok)', 'szt.', 1490, 23],
  ['Szkolenie stanowiskowe (dzień)', 'usł.', 2200, 23],
  ['Przegląd okresowy urządzenia', 'usł.', 450, 23],
  ['Naprawa serwisowa (roboczogodzina)', 'h', 180, 23],
  ['Wdrożenie systemu pomiarowego', 'usł.', 6500, 23],
  ['Obudowa ochronna IP67', 'szt.', 260, 23],
  ['Zasilacz 24 V', 'szt.', 145, 23],
  ['Rejestrator danych RD-4', 'szt.', 2150, 23],
  ['Podręcznik użytkownika (druk)', 'szt.', 45, 5],
  ['Dojazd serwisu (km)', 'km', 2.2, 23],
];

function tinyPdf(title: string, lines: string[]): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.registerFont('main', path.join(assetsDir(), 'fonts', 'DejaVuSans.ttf'));
    doc.font('main');
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(18).fillColor('#1b2f5b').text(title);
    doc.moveDown();
    doc.fontSize(11).fillColor('#111');
    lines.forEach((l) => doc.text(l).moveDown(0.4));
    doc.end();
  });
}

async function main() {
  const config = loadConfig();
  const db = openDb(config);
  const ctx: Ctx = { db, config };
  const force = process.argv.includes('--force');
  const has = db.get<any>('SELECT COUNT(*) AS n FROM contractors')!.n;
  if (has && !force) {
    console.error(`W bazie jest już ${has} kontrahentów. Dane przykładowe ładuje się do pustej bazy (lub użyj --force).`);
    process.exit(1);
  }
  const adminPw = ensureAdmin(ctx);
  const demoPw = process.env.DIAGNOS_SEED_PASSWORD || crypto.randomBytes(5).toString('base64url') + '9x';
  const now = nowIso();
  const today = todayIso();
  const dict = (d: string) => db.all<any>('SELECT * FROM dict_items WHERE dict = ? ORDER BY sort', d);
  const byName = (d: string, n: string) => dict(d).find((x) => x.name === n)?.id ?? null;
  const deps = db.all<any>('SELECT * FROM departments');
  const dep = (n: string) => deps.find((d) => d.name === n)!.id;

  const opDefs = [
    { login: 'jkowalska', name: 'Joanna Kowalska', role: 'kierownik', email: 'j.kowalska@diagnos.example', phone: '600100200', deps: ['Zarząd', 'Dział handlowy'] },
    { login: 'pnowak', name: 'Piotr Nowak', role: 'handlowiec', email: 'p.nowak@diagnos.example', phone: '600100201', deps: ['Dział handlowy'] },
    { login: 'mwisniewska', name: 'Magdalena Wiśniewska', role: 'handlowiec', email: 'm.wisniewska@diagnos.example', phone: '600100202', deps: ['Dział handlowy'] },
    { login: 'tzielinski', name: 'Tomasz Zieliński', role: 'handlowiec', email: 't.zielinski@diagnos.example', phone: '600100203', deps: ['Dział handlowy', 'Serwis'] },
    { login: 'akrawczyk', name: 'Anna Krawczyk', role: 'handlowiec', email: 'a.krawczyk@diagnos.example', phone: '600100204', deps: ['Księgowość'] },
  ];
  const ops: Record<string, number> = {};
  db.tx(() => {
    for (const o of opDefs) {
      const ex = db.get<any>('SELECT id FROM operators WHERE login = ?', o.login);
      const id = ex?.id ?? db.insert('operators', { login: o.login, name: o.name, role: o.role, email: o.email, phone: o.phone, password_hash: hashPassword(demoPw), must_change_password: 0, created_at: now });
      ops[o.login] = id;
      for (const d of o.deps) db.run('INSERT OR IGNORE INTO operator_departments (operator_id, department_id) VALUES (?, ?)', id, dep(d));
    }
    for (const l of ['pnowak', 'mwisniewska', 'tzielinski', 'akrawczyk']) db.run('UPDATE operators SET manager_id = ? WHERE id = ?', ops.jkowalska, ops[l]);
  });
  const sellers = [ops.pnowak, ops.mwisniewska, ops.tzielinski, ops.jkowalska];
  const allOps = Object.values(ops);
  const admin = db.get<any>("SELECT id FROM operators WHERE login = 'admin'")!.id;

  // pola dodatkowe
  if (!db.get("SELECT id FROM custom_fields WHERE code = 'liczba_pracownikow'")) {
    db.insert('custom_fields', { entity: 'contractor', code: 'liczba_pracownikow', label: 'Liczba pracowników', type: 'number', options: '[]', sort: 1 });
    db.insert('custom_fields', { entity: 'contractor', code: 'wielkosc_firmy', label: 'Wielkość firmy', type: 'select', options: JSON.stringify(['mikro', 'mała', 'średnia', 'duża']), sort: 2 });
    db.insert('custom_fields', { entity: 'contractor', code: 'umowa_serwisowa', label: 'Umowa serwisowa', type: 'bool', options: '[]', sort: 3 });
  }

  const types = dict('contractor_type');
  const statuses = dict('contractor_status');
  const groups = dict('contractor_group');
  const subgroups = dict('contractor_subgroup');
  const prices = dict('price_group');
  const sources = dict('contact_source');
  const contractors: any[] = [];
  const usedNames = new Set<string>();
  db.tx(() => {
    for (let i = 0; i < 64; i++) {
      let short = '';
      do short = `${pick(NAME_A)}${pick(NAME_B)}`.toUpperCase();
      while (usedNames.has(short));
      usedNames.add(short);
      const full = `${rnd() < 0.4 ? pick(PREFIX) + ' ' : ''}${short[0] + short.slice(1).toLowerCase()} ${pick(FORMS)}`.trim();
      const [city, voiv, zip] = pick(CITIES);
      const g = pick(groups);
      const sg = pick(subgroups.filter((x) => x.parent_id === g.id));
      const st = i < 6 ? statuses[2] : pick(statuses.slice(0, 4));
      const owner = pick(sellers);
      const created = `${addDaysDate(today, -int(20, 700))}T${String(int(8, 16)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00`;
      const workers = int(3, 800);
      const id = db.insert('contractors', {
        name: full,
        short_name: short,
        type_id: i % 9 === 0 ? types[1].id : i % 13 === 0 ? types[2].id : types[0].id,
        status_id: st.id,
        group_id: g.id,
        subgroup_id: sg?.id ?? null,
        price_group_id: pick(prices).id,
        source_id: pick(sources).id,
        owner_id: owner,
        nip: makeNip(),
        regon: makeRegon(),
        tax_office: `Urząd Skarbowy w ${city === 'Kraków' ? 'Krakowie' : city === 'Warszawa' ? 'Warszawie' : city === 'Wrocław' ? 'Wrocławiu' : city === 'Poznań' ? 'Poznaniu' : city === 'Gdańsk' ? 'Gdańsku' : city === 'Katowice' ? 'Katowicach' : city === 'Łódź' ? 'Łodzi' : city}`,
        contract_no: rnd() < 0.5 ? `UM/${int(1, 200)}/${int(2023, 2026)}` : null,
        credit_limit: rnd() < 0.6 ? int(1, 40) * 1000 : null,
        street: `ul. ${pick(STREETS)} ${int(1, 120)}${rnd() < 0.2 ? '/' + int(1, 30) : ''}`,
        postal_code: `${zip}${String(int(1, 999)).padStart(3, '0')}`,
        city,
        voivodeship: voiv,
        country: 'Polska',
        phone: `${int(12, 91)} ${int(200, 899)} ${int(10, 99)} ${int(10, 99)}`,
        email: `biuro@${short.toLowerCase()}.example`,
        www: `www.${short.toLowerCase()}.example`,
        is_key: i < 10 ? 1 : 0,
        notes: rnd() < 0.3 ? pick(['Preferuje kontakt mailowy.', 'Płatności zawsze w terminie.', 'Decyzje zakupowe podejmuje zarząd w I kwartale.', 'Zainteresowani rozszerzeniem umowy serwisowej.']) : null,
        custom: JSON.stringify({ liczba_pracownikow: workers, wielkosc_firmy: workers < 10 ? 'mikro' : workers < 50 ? 'mała' : workers < 250 ? 'średnia' : 'duża', umowa_serwisowa: rnd() < 0.4 }),
        created_at: created,
        created_by: owner,
      });
      if (rnd() < 0.3) db.insert('contractor_addresses', { contractor_id: id, kind: 'dostawy', street: `ul. ${pick(STREETS)} ${int(1, 80)}`, postal_code: `${zip}${String(int(1, 999)).padStart(3, '0')}`, city, voivodeship: voiv, country: 'Polska' });
      if (rnd() < 0.35) db.run('INSERT INTO contractor_group_members (contractor_id, group_id) VALUES (?, ?)', id, pick(groups).id);
      const contacts: number[] = [];
      for (let k = 0; k < int(1, 3); k++) {
        const female = rnd() < 0.5;
        const fn = female ? pick(FIRST.slice(0, 8).concat('Zofia')) : pick(FIRST.slice(8, 19));
        const ln = female ? fem(pick(LAST_M)) : pick(LAST_M);
        const plain = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
        contacts.push(
          db.insert('contacts', {
            contractor_id: id,
            first_name: fn,
            last_name: ln,
            position: pick(POSITIONS),
            phone: `${int(12, 91)} ${int(200, 899)} ${int(10, 99)} ${int(10, 99)}`,
            mobile: `${int(500, 799)} ${int(100, 999)} ${int(100, 999)}`,
            email: `${plain(fn)[0]}.${plain(ln)}@${short.toLowerCase()}.example`,
            is_primary: k === 0 ? 1 : 0,
            created_at: created,
          }),
        );
      }
      contractors.push({ id, owner, contacts, short, full });
    }
  });

  // korespondencja
  const kinds = dict('corr_kind');
  const topics = dict('corr_topic');
  const bodies = [
    'Omówiono warunki współpracy na kolejny rok. Klient prosi o ofertę z rabatem ilościowym.',
    'Klient zgłosił usterkę czujnika. Umówiono wizytę serwisu.',
    'Przedstawiono nową wersję analizatora. Zainteresowanie modułem pomiarowym.',
    'Wysłano zaproszenie na szkolenie z obsługi oprogramowania.',
    'Ustalono termin dostawy na koniec miesiąca.',
    'Rozmowa w sprawie przeterminowanej płatności. Klient potwierdził zapłatę do piątku.',
    'Spotkanie w siedzibie klienta: prezentacja możliwości systemu, uczestniczył dyrektor handlowy.',
    'Przesłano cennik i katalog produktów.',
  ];
  db.tx(() => {
    for (const c of contractors) {
      const n = c.short.length % 3 === 0 ? 0 : int(2, 9);
      for (let k = 0; k < n; k++) {
        const kind = pick(kinds.slice(0, 5));
        const dt = `${addDaysDate(today, -int(0, 360))}T${String(int(8, 16)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00`;
        const op = rnd() < 0.7 ? c.owner : pick(sellers);
        db.insert('correspondence', {
          number: makeNumber(db, 'K', dt),
          kind_id: kind.id,
          direction: rnd() < 0.7 ? 'out' : 'in',
          event_at: dt,
          duration_sec: kind.code === 'phone' ? int(60, 1500) : kind.code === 'meeting' ? int(1800, 7200) : kind.code === 'email' ? int(120, 900) : int(30, 300),
          topic_id: pick(topics).id,
          contractor_id: c.id,
          contact_id: pick(c.contacts),
          operator_id: op,
          body: pick(bodies),
          email_to: kind.code === 'email' ? `kontakt@${c.short.toLowerCase()}.example` : null,
          created_at: dt,
          created_by: op,
        });
      }
    }
  });

  // projekty
  const pStatus = dict('project_status');
  const projects: any[] = [];
  db.tx(() => {
    const names = ['Wdrożenie systemu pomiarowego', 'Modernizacja linii kontroli jakości', 'Serwis roczny urządzeń', 'Szkolenia operatorów', 'Rozbudowa stanowisk diagnostycznych', 'Audyt aparatury', 'Pilotaż DIAG-200 Pro', 'Integracja z systemem MES'];
    names.forEach((n, i) => {
      const c = contractors[i * 3];
      const start = addDaysDate(today, -int(30, 200));
      const id = db.insert('projects', { number: makeNumber(db, 'PRJ', start), name: `${n} — ${c.short}`, contractor_id: c.id, manager_id: c.owner, start_date: start, end_date: addDaysDate(start, int(60, 240)), status_id: pick(pStatus.slice(0, 3)).id, budget: int(10, 200) * 1000, description: `Projekt realizowany dla ${c.full}.`, created_at: `${start}T09:00:00`, created_by: c.owner });
      ['Analiza potrzeb', 'Oferta i umowa', 'Realizacja', 'Odbiór'].forEach((st, j) =>
        db.insert('project_stages', { project_id: id, name: st, start_date: addDaysDate(start, j * 30), end_date: addDaysDate(start, j * 30 + 29), status: j < 1 ? 'zakończony' : j === 1 ? 'w toku' : 'planowany', sort: j }),
      );
      projects.push({ id, c });
    });
    // część korespondencji powiąż z projektami
    for (const p of projects) {
      const st = db.get<any>('SELECT id FROM project_stages WHERE project_id = ? ORDER BY sort LIMIT 1', p.id);
      db.run('UPDATE correspondence SET project_id = ?, stage_id = ? WHERE id IN (SELECT id FROM correspondence WHERE contractor_id = ? LIMIT 2)', p.id, st.id, p.c.id);
    }
  });

  // zadania
  const done = statusIdByCode(ctx, 'done');
  const inProg = statusIdByCode(ctx, 'in_progress');
  const taskTitles = ['Zadzwonić w sprawie oferty', 'Przygotować ofertę', 'Wysłać umowę do podpisu', 'Spotkanie u klienta', 'Prezentacja produktu', 'Sprawdzić płatność', 'Przygotować wycenę serwisu', 'Umówić szkolenie', 'Raport z wizyty', 'Zebranie zespołu handlowego', 'Uzupełnić dane w kartotece', 'Kontrola stanu realizacji zamówienia'];
  const taskIds: number[] = [];
  for (let i = 0; i < 170; i++) {
    const c = pick(contractors);
    const offset = int(-45, 30);
    const day = addDaysDate(today, offset);
    const hour = int(8, 16);
    const start = `${day}T${String(hour).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}:00`;
    const past = offset < 0;
    const progress = past ? pick([100, 100, 100, 50, 0, 80]) : offset === 0 ? pick([0, 25, 50]) : 0;
    const op = rnd() < 0.8 ? c.owner : pick(allOps);
    const prj = rnd() < 0.15 ? pick(projects) : null;
    taskIds.push(
      createTask(
        ctx,
        {
          title: pick(taskTitles),
          description: rnd() < 0.5 ? pick(bodies) : null,
          start_at: start,
          end_at: addMinutesIso(start, pick([15, 30, 45, 60, 90])),
          operator_ids: rnd() < 0.08 ? [op, pick(allOps)] : [op],
          principal_id: rnd() < 0.3 ? ops.jkowalska : op,
          priority: pick([2, 2, 2, 3, 1, 4]),
          status_id: progress === 100 ? done : progress > 0 ? inProg : null,
          progress,
          contractor_id: prj ? prj.c.id : c.id,
          contact_id: prj ? null : pick(c.contacts),
          project_id: prj?.id ?? null,
          remind_before_min: past ? null : 15,
        },
        op,
      ),
    );
  }
  // ewidencja czasu
  db.tx(() => {
    for (const id of taskIds.slice(0, 90)) {
      const t = db.get<any>('SELECT * FROM tasks WHERE id = ?', id);
      if (t.start_at > now) continue;
      db.insert('time_entries', { operator_id: t.operator_id, work_date: t.start_at.slice(0, 10), minutes: int(15, 180), task_id: id, contractor_id: t.contractor_id, project_id: t.project_id, note: 'Realizacja zadania', created_at: now });
    }
  });
  // zadania cykliczne
  for (const [title, freq, wd, op] of [
    ['Cotygodniowe zebranie działu handlowego', 'weekly', [1], ops.jkowalska],
    ['Przegląd zaległych płatności', 'weekly', [5], ops.akrawczyk],
  ] as const) {
    const sid = db.insert('task_series', {
      title,
      operator_ids: JSON.stringify(title.startsWith('Cotyg') ? [ops.jkowalska, ops.pnowak, ops.mwisniewska, ops.tzielinski] : [op]),
      principal_id: ops.jkowalska,
      priority: 2,
      freq,
      interval_n: 1,
      weekdays: JSON.stringify(wd),
      start_date: addDaysDate(today, -14),
      time_from: '09:00',
      time_to: '09:45',
      remind_before_min: 15,
      created_by: ops.jkowalska,
      created_at: now,
    });
    generateSeries(ctx, sid);
  }
  db.insert('task_series', { title: 'Raport miesięczny sprzedaży dla zarządu', operator_ids: JSON.stringify([ops.jkowalska]), principal_id: admin, priority: 3, freq: 'monthly', interval_n: 1, month_day: 28, start_date: addDaysDate(today, -60), time_from: '14:00', time_to: '15:00', remind_before_min: 60, remind_email: 1, created_by: admin, created_at: now });
  generateSeries(ctx, db.get<any>('SELECT MAX(id) AS id FROM task_series')!.id);

  // towary, zamówienia, sprzedaż
  const prodIds: number[] = [];
  db.tx(() => {
    PRODUCTS.forEach(([n, u, p, v], i) => prodIds.push(db.insert('products', { sku: `DG-${String(i + 1).padStart(4, '0')}`, name: n, unit: u, net_price: p, vat_rate: v, product_group: i < 8 || i === 13 || i === 14 || i === 15 ? 'Urządzenia i akcesoria' : 'Usługi i licencje', created_at: now })));
    const oStatus = dict('order_status');
    const mkItems = () =>
      Array.from({ length: int(1, 4) }, () => {
        const pi = int(0, PRODUCTS.length - 1);
        const [n, u, p, v] = PRODUCTS[pi];
        const qty = int(1, 10);
        const net = round2(qty * p);
        return { product_id: prodIds[pi], name: n, qty, unit: u, net_price: p, vat_rate: v, net_value: net, gross_value: round2(net * (1 + v / 100)) };
      });
    for (let i = 0; i < 45; i++) {
      const c = pick(contractors);
      const d = addDaysDate(today, -int(0, 300));
      const items = mkItems();
      const oid = db.insert('orders', { number: makeNumber(db, 'ZAM', d), contractor_id: c.id, order_date: d, delivery_date: addDaysDate(d, int(7, 30)), status_id: pick(oStatus).id, operator_id: c.owner, net_total: round2(items.reduce((a, x) => a + x.net_value, 0)), gross_total: round2(items.reduce((a, x) => a + x.gross_value, 0)), created_at: `${d}T10:00:00`, created_by: c.owner });
      items.forEach((it, k) => db.insert('order_items', { ...it, order_id: oid, sort: k }));
    }
    for (let i = 0; i < 160; i++) {
      const c = pick(contractors);
      const d = addDaysDate(today, -int(0, 365));
      const items = mkItems();
      const sid = db.insert('sales', { doc_number: `FV/${int(1, 999)}/${d.slice(5, 7)}/${d.slice(0, 4)}`, doc_date: d, contractor_id: c.id, operator_id: rnd() < 0.85 ? c.owner : pick(sellers), net_total: round2(items.reduce((a, x) => a + x.net_value, 0)), gross_total: round2(items.reduce((a, x) => a + x.gross_value, 0)), source: rnd() < 0.5 ? 'import' : 'ręcznie', external_source: null, created_at: `${d}T12:00:00`, created_by: admin });
      items.forEach((it, k) => db.insert('sale_items', { ...it, sale_id: sid, sort: k }));
    }
  });

  // dokumenty
  const folders = db.all<any>('SELECT * FROM doc_folders');
  const folder = (n: string) => folders.find((f) => f.name === n)!.id;
  const docType = (n: string) => byName('doc_type', n);
  const userObj = (id: number) => ({ id, login: '', name: '', email: null, phone: null, role: 'admin' as const, manager_id: null, must_change_password: 0, departments: [] });
  const docs: [string, string, string, string | null, number | null, string | null][] = [
    ['Cennik produktów 2026', 'Cenniki', 'Cennik', null, null, `${addDaysDate(today, 400)}`],
    ['Cennik usług serwisowych', 'Cenniki', 'Cennik', null, null, null],
    ['Promocja jesienna — rabat 10%', 'Oferty', 'Oferta', addDaysDate(today, -60), null, addDaysDate(today, -5)],
    ['Instrukcja obsługi DIAG-100', 'Instrukcje', 'Instrukcja', null, null, null],
    ['Instrukcja obsługi DIAG-200 Pro', 'Instrukcje', 'Instrukcja', null, null, null],
    ['Katalog produktów', 'Katalogi', 'Katalog', null, null, null],
    ['Procedura obsługi reklamacji PR-07', 'Procedury ISO', 'Procedura ISO', null, null, null],
    ['Procedura nadzoru nad dokumentacją PR-01', 'Procedury ISO', 'Procedura ISO', null, null, null],
    ['Wzór umowy serwisowej', 'Umowy', 'Umowa', null, null, null],
  ];
  for (const [n, f, t, vf, cIdx, vt] of docs) {
    const pdf = await tinyPdf(n, ['Dokument przykładowy DIAGNOS CRM.', 'Treść ma charakter demonstracyjny.', `Data: ${today}`]);
    const fid = saveFile(ctx, pdf, `${n}.pdf`, 'application/pdf', ops.jkowalska);
    createDocument(ctx, userObj(ops.jkowalska), { name: n, description: `${t} — dokument przykładowy`, folder_id: folder(f), type_id: docType(t), contractor_id: cIdx, project_id: null, valid_from: vf, valid_to: vt }, fid, 'wersja początkowa');
  }
  // oferty dla kontrahentów
  for (const c of contractors.slice(0, 6)) {
    const pdf = await tinyPdf(`Oferta dla ${c.short}`, [`Kontrahent: ${c.full}`, 'Zakres: dostawa i wdrożenie systemu pomiarowego.']);
    const fid = saveFile(ctx, pdf, `Oferta ${c.short}.pdf`, 'application/pdf', c.owner);
    createDocument(ctx, userObj(c.owner), { name: `Oferta handlowa — ${c.short}`, description: 'Oferta wysłana do klienta', folder_id: folder('Oferty'), type_id: docType('Oferta'), contractor_id: c.id, project_id: null, valid_from: today, valid_to: addDaysDate(today, 30) }, fid, null);
  }
  // nowa wersja cennika
  const cennik = db.get<any>("SELECT * FROM documents WHERE name = 'Cennik produktów 2026'")!;
  const v1 = saveFile(ctx, await tinyPdf('Cennik produktów 2026 (aktualizacja)', ['Zmiana cen kabli pomiarowych.']), 'Cennik produktów 2026 v2.pdf', 'application/pdf', ops.jkowalska);
  db.insert('document_versions', { document_id: cennik.id, version: 1, file_id: v1, author_id: ops.jkowalska, comment: 'aktualizacja cen', created_at: now });
  db.update('documents', cennik.id, { current_version: 1 });
  // segregator tylko dla księgowości i zarządu
  const ks = db.insert('doc_folders', { name: 'Finanse (poufne)', description: 'Dostęp: Księgowość i Zarząd', sort: 20 });
  db.insert('document_permissions', { target_type: 'folder', target_id: ks, subject_type: 'department', subject_id: dep('Księgowość'), level: 'edit' });
  db.insert('document_permissions', { target_type: 'folder', target_id: ks, subject_type: 'department', subject_id: dep('Zarząd'), level: 'view' });
  const fin = saveFile(ctx, await tinyPdf('Zestawienie należności', ['Dokument poufny — przykład uprawnień do segregatora.']), 'Zestawienie należności.pdf', 'application/pdf', ops.akrawczyk);
  createDocument(ctx, userObj(ops.akrawczyk), { name: 'Zestawienie należności — III kwartał', description: 'Poufne', folder_id: ks, type_id: docType('Inne'), contractor_id: null, project_id: null, valid_from: null, valid_to: null }, fin, null);

  // dane firmy, wiadomości wewnętrzne, notatki, raport automatyczny
  if (!db.get("SELECT key FROM settings WHERE key = 'company'"))
    db.run(
      "INSERT INTO settings (key, value) VALUES ('company', ?)",
      JSON.stringify({ name: 'DIAGNOS (dane przykładowe)', address: 'ul. Przykładowa 1, 30-001 Kraków', nip: '0000000000', phone: '12 000 00 00', email: 'biuro@diagnos.example', www: 'www.diagnos.example', bank_account: '00 0000 0000 0000 0000 0000 0000', footer: 'Dane firmy do uzupełnienia w Ustawieniach.', logo_file_id: null }),
    );
  const mid = db.insert('internal_messages', { sender_id: ops.jkowalska, subject: 'Zebranie działu w poniedziałek', body: 'Proszę przygotować krótkie podsumowanie tygodnia i listę ofert w toku.', deliver_at: now, created_at: now });
  for (const o of [ops.pnowak, ops.mwisniewska, ops.tzielinski, admin]) db.run('INSERT INTO internal_recipients (message_id, recipient_id, delivered_at) VALUES (?, ?, ?)', mid, o, now);
  const mid2 = db.insert('internal_messages', { sender_id: admin, subject: 'Przypomnienie: aktualizacja cennika', body: 'Od przyszłego miesiąca obowiązuje nowy cennik — jest w rejestrze dokumentów.', deliver_at: `${addDaysDate(today, 1)}T08:00:00`, created_at: now });
  for (const o of sellers) db.run('INSERT INTO internal_recipients (message_id, recipient_id) VALUES (?, ?)', mid2, o);
  db.insert('quick_notes', { operator_id: admin, body: 'Uzupełnić dane firmy i konfigurację SMTP w Ustawieniach', created_at: now });
  const sch = { frequency: 'month_last_day', time_of_day: '18:00' };
  db.insert('report_schedules', { name: 'Sprzedaż handlowców — koniec miesiąca', report_type: 'sales', params: '{}', period: 'current_month', ...sch, recipients: 'zarzad@diagnos.example', next_run_at: nextRun(sch, now), created_by: admin, created_at: now });

  console.log('Załadowano dane przykładowe:');
  console.log(`  kontrahenci: ${contractors.length}, korespondencja: ${db.get<any>('SELECT COUNT(*) AS n FROM correspondence')!.n}, zadania: ${db.get<any>('SELECT COUNT(*) AS n FROM tasks')!.n}, sprzedaż: 160, dokumenty: ${db.get<any>('SELECT COUNT(*) AS n FROM documents')!.n}`);
  console.log(`  operatorzy przykładowi (hasło dla wszystkich: ${demoPw}): ${opDefs.map((o) => `${o.login} (${o.role})`).join(', ')}`);
  if (adminPw) console.log(`  konto admin utworzone, hasło startowe: ${adminPw} (do zmiany przy pierwszym logowaniu)`);
  db.close();
}

if (process.argv[1] && path.resolve(process.argv[1]).includes('seed')) main().catch((e) => (console.error(e), process.exit(1)));
