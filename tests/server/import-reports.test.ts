import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { setup, uploadAs, type TestEnv } from './helpers.js';
import { upsertContractor } from '../../server/src/services/importCore.js';
import { todayIso, addDaysDate } from '../../server/src/util.js';

async function importFile(env: TestEnv, kind: string, name: string, content: Buffer | string, mappingOverride?: Record<string, number | null>, source?: string, dry = false) {
  const prep = await uploadAs(env, 'admin', '/api/import/upload', { kind }, [{ name, content }]);
  expect(prep.status).toBe(200);
  const admin = await env.login('admin');
  const r = await admin('POST', '/api/import/run', { token: prep.json.token, mapping: { ...prep.json.mapping, ...(mappingOverride ?? {}) }, dry_run: dry, source });
  return { prep: prep.json, result: r.json, status: r.status };
}

describe('import z plików', () => {
  it('kontrahenci z CSV: automatyczne mapowanie, odrzucone wiersze z powodem, ponowny import aktualizuje po id zewnętrznym i NIP', async () => {
    const env = await setup();
    try {
      const csv = [
        'Kod kontrahenta;Nazwa;Skrót;NIP;Miasto;Telefon;E-mail;Status;Grupa;Podgrupa',
        'K001;Alfa Sp. z o.o.;ALFA;526-104-08-28;Kraków;12 111 22 33;biuro@alfa.example;Aktywny;Handel;Hurt',
        'K002;Beta S.A.;BETA;1234567890;Łódź;;;;;',
        'K003;;BEZNAZWY;;;;;;;',
        'K004;Gamma;GAMMA;;Wrocław;;zly-email;Nowy status;;',
        'K005;Delta;DELTA;1234567883;Gdańsk;;;;;',
      ].join('\n');
      const dry = await importFile(env, 'contractors', 'kontrahenci.csv', csv, undefined, 'eksport testowy', true);
      expect(dry.prep.mapping.name).toBe(1);
      expect(dry.prep.mapping.external_id).toBe(0);
      expect(dry.result).toMatchObject({ added: 2, rejected: 3, dry_run: true });
      expect(env.ctx.db.get<any>('SELECT COUNT(*) AS n FROM contractors').n).toBe(0); // podgląd nic nie zapisuje
      const r = await importFile(env, 'contractors', 'kontrahenci.csv', csv, undefined, 'eksport testowy');
      expect(r.result).toMatchObject({ added: 2, updated: 0, rejected: 3 });
      const reasons = r.result.results.filter((x: any) => x.status === 'odrzucono').map((x: any) => `${x.row}: ${x.reason}`);
      expect(reasons).toEqual(['3: Niepoprawny NIP: 1234567890', '4: Brak nazwy kontrahenta.', '5: Niepoprawny adres e-mail: zly-email']);
      const alfa = env.ctx.db.get<any>("SELECT * FROM contractors WHERE short_name = 'ALFA'");
      expect(alfa).toMatchObject({ nip: '5261040828', external_source: 'eksport testowy', external_id: 'K001', city: 'Kraków' });
      expect(env.ctx.db.get<any>('SELECT name FROM dict_items WHERE id = ?', alfa.subgroup_id).name).toBe('Hurt');
      // reguła automatyczna działa także przy imporcie
      expect(env.ctx.db.get<any>('SELECT COUNT(*) AS n FROM tasks WHERE contractor_id = ?', alfa.id).n).toBe(1);
      // ponowny import: zmiana nazwy po id zewnętrznym (bez duplikatu), nowy rekord K999 dodany
      const csv2 = ['Kod kontrahenta;Nazwa;NIP;Miasto', 'K001;Alfa Polska Sp. z o.o.;5261040828;Kraków', 'K999;Delta Nowa;;Gdańsk'].join('\n');
      const r2 = await importFile(env, 'contractors', 'k2.csv', csv2, undefined, 'eksport testowy');
      expect(r2.result).toMatchObject({ added: 1, updated: 1, rejected: 0 });
      expect(env.ctx.db.get<any>('SELECT name FROM contractors WHERE id = ?', alfa.id).name).toBe('Alfa Polska Sp. z o.o.');
      expect(env.ctx.db.get<any>('SELECT COUNT(*) AS n FROM contractors').n).toBe(3);
      // NIP jako klucz zapasowy (inne źródło, brak id)
      const res = env.ctx.db.tx(() => upsertContractor(env.ctx, { source: 'enova365', name: 'Delta z enovy', nip: '1234567883' } as any, { actorId: 1 }));
      expect(res.status).toBe('zaktualizowano');
      const logs = (await (await env.login('admin'))('GET', '/api/import/logs')).json;
      expect(logs).toHaveLength(2);
    } finally {
      await env.close();
    }
  });

  it('osoby, towary i transakcje sprzedaży z XLSX (pozycje jednego dokumentu w wielu wierszach)', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      await admin('POST', '/api/contractors', { name: 'Alfa Sp. z o.o.', short_name: 'ALFA', nip: '5261040828' });
      env.addOperator('pnowak', 'handlowiec', { name: 'Piotr Nowak' });
      const xlsx = async (rows: any[][]) => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Arkusz1');
        rows.forEach((r) => ws.addRow(r));
        return Buffer.from(await wb.xlsx.writeBuffer());
      };
      const contacts = await importFile(env, 'contacts', 'osoby.xlsx', await xlsx([
        ['NIP', 'Imię', 'Nazwisko', 'Stanowisko', 'E-mail'],
        ['5261040828', 'Anna', 'Nowak', 'Prezes', 'anna@alfa.example'],
        ['9999999999', 'Jan', 'Brak', '', ''],
      ]));
      expect(contacts.result).toMatchObject({ added: 1, rejected: 1 });
      expect(contacts.result.results[1].reason).toMatch(/Nie znaleziono kontrahenta/);
      const products = await importFile(env, 'products', 'towary.xlsx', await xlsx([
        ['Indeks', 'Nazwa', 'J.m.', 'Cena netto', 'VAT'],
        ['A1', 'Analizator', 'szt.', '1 000,00', '23%'],
        ['A2', 'Usługa', 'h', 'abc', '23'],
      ]));
      expect(products.result).toMatchObject({ added: 1, rejected: 1 });
      const sales = await importFile(env, 'sales', 'sprzedaz.xlsx', await xlsx([
        ['Numer dokumentu', 'Data wystawienia', 'NIP kontrahenta', 'Handlowiec', 'Indeks', 'Ilość', 'Cena netto', 'Stawka VAT'],
        ['FV/1/2026', '05.03.2026', '5261040828', 'Piotr Nowak', 'A1', 2, '', ''],
        ['FV/1/2026', '05.03.2026', '5261040828', 'Piotr Nowak', '', '', '', ''],
        ['FV/2/2026', '2026-03-06', '5261040828', 'pnowak', 'A1', 1, 900, 23],
        ['FV/3/2026', '07.03.2026', '1111111111', '', 'A1', 1, 900, 23],
      ]), { item_name: null });
      expect(sales.result).toMatchObject({ added: 3, rejected: 1 });
      const s1 = env.ctx.db.get<any>("SELECT * FROM sales WHERE doc_number = 'FV/1/2026'");
      expect(s1).toMatchObject({ net_total: 2000, gross_total: 2460, doc_date: '2026-03-05', source: 'import' });
      // ponowny import tego samego pliku nie dubluje transakcji
      const again = await importFile(env, 'sales', 'sprzedaz.xlsx', await xlsx([
        ['Numer dokumentu', 'Data wystawienia', 'NIP kontrahenta', 'Indeks', 'Ilość'],
        ['FV/1/2026', '05.03.2026', '5261040828', 'A1', 3],
      ]));
      expect(again.result).toMatchObject({ added: 0, updated: 1 });
      expect(env.ctx.db.get<any>("SELECT COUNT(*) AS n FROM sales WHERE doc_number = 'FV/1/2026'").n).toBe(1);
      expect(env.ctx.db.get<any>("SELECT net_total FROM sales WHERE doc_number = 'FV/1/2026'").net_total).toBe(3000);
    } finally {
      await env.close();
    }
  });
});

describe('obliczenia raportów', () => {
  it('skuteczność handlowców, aktywność operatora, brak aktywności, statystyka zadań, czas pracy', async () => {
    const env = await setup();
    try {
      const { db } = env.ctx;
      const h1 = env.addOperator('h1', 'handlowiec', { name: 'Handlowiec Jeden' });
      const h2 = env.addOperator('h2', 'handlowiec', { name: 'Handlowiec Dwa' });
      const admin = await env.login('admin');
      const a = (await admin('POST', '/api/contractors', { name: 'Alfa', is_key: true })).json.id;
      const b = (await admin('POST', '/api/contractors', { name: 'Beta' })).json.id;
      const c = (await admin('POST', '/api/contractors', { name: 'Gamma', is_key: true })).json.id;
      const t = todayIso();
      for (const [doc, cid, op, net] of [['F1', a, h1, 1000], ['F2', b, h1, 500], ['F3', a, h2, 250], ['F4', a, h1, 100]] as const)
        await admin('POST', '/api/sales', { doc_number: doc, doc_date: t, contractor_id: cid, operator_id: op, items: [], net_total: net, gross_total: net * 1.23 });
      await admin('POST', '/api/sales', { doc_number: 'STARA', doc_date: '2000-01-01', contractor_id: a, operator_id: h1, items: [], net_total: 99999 });
      const sales = (await admin('GET', `/api/reports/sales?from=${t.slice(0, 8)}01&to=${t}`)).json;
      expect(sales.rows.map((r: any) => [r.operator, r.cnt, r.clients, r.net])).toEqual([['Handlowiec Jeden', 3, 2, 1600], ['Handlowiec Dwa', 1, 1, 250]]);
      expect(sales.totals).toMatchObject({ cnt: 4, clients: 2, net: 1850 });
      expect(sales.rows[0].share).toBeCloseTo(86.49, 1);
      const kinds = Object.fromEntries(db.all<any>("SELECT code, id FROM dict_items WHERE dict='corr_kind'").map((k) => [k.code, k.id]));
      const h1c = await env.login('h1');
      const now = `${t}T10:00`;
      for (const [kind, dir, cid] of [['phone', 'out', a], ['phone', 'out', a], ['phone', 'in', a], ['email', 'out', b], ['meeting', 'out', b]] as const)
        await h1c('POST', '/api/correspondence', { kind_id: kinds[kind], direction: dir, event_at: now, topic_text: 'x', contractor_id: cid, duration_sec: 600 });
      const act = (await h1c('GET', `/api/reports/activity?from=${t}&to=${t}`)).json;
      expect(act.title).toBe('Raport aktywności dla operatora: Handlowiec Jeden');
      expect(act.rows.map((r: any) => [r.kind, r.out, r.in, r.total])).toEqual([['Telefon', 2, 1, 3], ['E-mail', 1, 0, 1], ['Spotkanie', 1, 0, 1]]);
      expect(act.totals).toMatchObject({ out: 4, in: 1, total: 5, hours: 0.83 });
      // brak aktywności: tylko kluczowi bez kontaktu od 30 dni → Gamma (Alfa miała kontakt dziś)
      const ina = (await admin('GET', '/api/reports/inactivity?days=30&only_key=1')).json;
      expect(ina.rows.map((r: any) => r.name)).toEqual(['Gamma']);
      expect(ina.rows[0].ostatni).toBe('nigdy');
      const all = (await admin('GET', '/api/reports/inactivity?days=30')).json.rows.map((r: any) => r.name).sort();
      expect(all).toEqual(['Gamma']);
      // statystyka zadań
      db.run('DELETE FROM tasks');
      const mk = (title: string, op: number, day: string, progress: number) => admin('POST', '/api/tasks', { title, start_at: `${day}T09:00`, end_at: `${day}T10:00`, operator_ids: [op], progress });
      await mk('w1', h1, t, 100);
      await mk('w2', h1, addDaysDate(t, -1), 100);
      await mk('p1', h1, addDaysDate(t, -2), 40);
      await mk('o1', h2, addDaysDate(t, 5), 0);
      const from = addDaysDate(t, -10);
      const ts = (await admin('GET', `/api/reports/tasks?from=${from}&to=${addDaysDate(t, 10)}`)).json;
      const row = (n: string) => ts.rows.find((r: any) => r.operator === n);
      expect(row('Handlowiec Jeden')).toMatchObject({ total: 3, done: 2, overdue: 1, open: 0 });
      expect(row('Handlowiec Dwa')).toMatchObject({ total: 1, done: 0, overdue: 0, open: 1 });
      // czas pracy: korespondencja + ewidencja zadań, udział kontrahenta
      const tid = db.get<any>("SELECT id FROM tasks WHERE title = 'w1'").id;
      db.run('UPDATE tasks SET contractor_id = ? WHERE id = ?', c, tid);
      await h1c('POST', `/api/tasks/${tid}/time`, { minutes: 90, work_date: t });
      const time = (await admin('GET', `/api/reports/time?from=${t}&to=${t}&group_by=contractor`)).json;
      const byName = Object.fromEntries(time.rows.map((r: any) => [r.name, r]));
      expect(byName.Alfa.corr_h).toBe(0.5);
      expect(byName.Beta.corr_h).toBe(0.33);
      expect(byName.Gamma.tasks_h).toBe(1.5);
      expect(time.totals.total_h).toBe(2.33);
      expect(byName.Gamma.share).toBeCloseTo(64.29, 1);
      // PDF i XLSX raportu
      const pdf = await admin('GET', `/api/reports/sales?from=${t}&to=${t}`.replace('/sales?', '/sales/pdf?'));
      expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-');
      const xl = await admin('GET', `/api/reports/activity/xlsx?from=${t}&to=${t}&operator_id=${h1}`);
      expect(xl.status).toBe(200);
      expect(xl.raw.subarray(0, 2).toString()).toBe('PK');
    } finally {
      await env.close();
    }
  });
});
