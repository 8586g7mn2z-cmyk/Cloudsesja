// Etap przeglądarkowy symulacji: na danych wytworzonych przez symulację otwiera każdy ekran jako
// administrator, kierownik i handlowiec. Sprawdza brak błędów w konsoli i nieudanych żądań,
// zgodność liczników rejestrów z księgą oraz to, że przypomnienie faktycznie wyskakuje na ekranie.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { addMin, parseIso, type Checks } from './lib.js';

export interface UiOptions {
  baseUrl: string;
  simNow: string;
  outDir: string;
  checks: Checks;
  password: string;
  users: { login: string; role: string }[];
  expected: {
    contractorsActive: number; correspondence: number; sales: number; orders: number; projects: number; products: number;
    sampleContractor: { id: number; name: string; correspondence: number; contacts: number };
    sampleProjectId: number | null;
  };
  setServerNow: (iso: string) => void;
  tick: () => Promise<void>;
  createReminderTask: (login: string) => Promise<{ id: number; remindAt: string }>;
}

const SCREENS: [string, string, string?][] = [
  ['/', 'Moje zadania na dziś'], ['/kalendarz', 'Kalendarz zadań'], ['/zadania', 'Rejestr zadań'], ['/zadania-cykliczne', 'Zadania cykliczne'],
  ['/kontrahenci', 'Rejestr kontrahentów', 'contractorsActive'], ['/korespondencja', 'Korespondencja', 'correspondence'], ['/korespondencja-seryjna', 'Korespondencja seryjna'],
  ['/wiadomosci', 'Korespondencja wewnętrzna'], ['/projekty', 'Projekty', 'projects'], ['/zamowienia', 'Zamówienia', 'orders'], ['/sprzedaz', 'Sprzedaż', 'sales'],
  ['/towary', 'Kartoteka towarowa', 'products'], ['/dokumenty', 'Rejestr dokumentów'], ['/szablony', 'Szablony dokumentów'], ['/raporty', 'Raporty'],
  ['/import', 'Import danych'], ['/kolejka', 'Kolejka wysyłki'], ['/ustawienia', 'Ustawienia'],
];

export async function runUi(o: UiOptions) {
  const C = o.checks;
  const shots: string[] = [];
  const dir = path.join(o.outDir, 'ekrany');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  let screens = 0;
  try {
    for (const user of o.users) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
      const page = await context.newPage();
      await page.clock.install({ time: parseIso(o.simNow) });
      const problems: string[] = [];
      let where = '';
      page.on('pageerror', (e) => problems.push(`${where}: błąd skryptu: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${where}: konsola: ${m.text().slice(0, 200)}`);
      });
      page.on('response', (r) => {
        if (r.status() >= 400 && r.url().includes('/api/')) problems.push(`${where}: ${r.request().method()} ${r.url().replace(o.baseUrl, '')} → ${r.status()}`);
      });
      const settle = async () => {
        await page.waitForLoadState('networkidle').catch(() => undefined);
        await page.clock.runFor(300).catch(() => undefined);
      };

      where = 'logowanie';
      await page.goto(o.baseUrl + '/');
      await page.fill('#login', user.login);
      await page.fill('#password', o.password);
      await page.click('button:has-text("Zaloguj")');
      const logged = await page.getByRole('heading', { name: 'Moje zadania na dziś' }).waitFor({ timeout: 10000 }).then(() => true, () => false);
      C.check('Interfejs', 'logowanie w przeglądarce prowadzi do ekranu „Moje zadania na dziś”', logged, user.login);
      if (!logged) {
        await context.close();
        continue;
      }

      try {
      for (const [url, title, counter] of SCREENS) {
        where = `${user.role} ${url}`;
        const before = problems.length;
        await page.goto(o.baseUrl + url);
        await settle();
        screens++;
        const body = await page.locator('body').innerText();
        const crashed = body.trim().length < 40;
        C.check('Interfejs', 'ekran otwiera się i ma treść', !crashed, where);
        C.check('Interfejs', 'ekran ładuje się bez błędów skryptu i nieudanych żądań', problems.length === before, problems.slice(before).join(' | '));
        if (counter && user.role === 'admin') {
          const m = /Rekordów:\s*(\d+)/.exec(body);
          C.eq('Interfejs', 'licznik rekordów na ekranie zgodny z księgą symulacji', m ? Number(m[1]) : null, (o.expected as any)[counter], title);
        }
        if (user.role === 'admin') {
          const f = path.join(dir, `${String(screens).padStart(2, '0')}-${url === '/' ? 'start' : url.slice(1).replace(/\//g, '-')}.png`);
          await page.screenshot({ path: f });
          shots.push(f);
        }
      }

      // kartoteka kontrahenta: wszystkie zakładki
      where = `${user.role} kartoteka kontrahenta`;
      const s = o.expected.sampleContractor;
      await page.goto(`${o.baseUrl}/kontrahenci/${s.id}`);
      await settle();
      const tabs = page.getByRole('tab');
      const n = await tabs.count();
      C.check('Interfejs', 'kartoteka kontrahenta ma komplet zakładek', n >= 12, `${n} zakładek`);
      const labels = await tabs.allInnerTexts();
      const count = (name: string) => {
        const l = labels.find((x) => x.startsWith(name));
        const m = l ? /(\d+)\s*$/.exec(l) : null;
        return m ? Number(m[1]) : null;
      };
      C.eq('Interfejs', 'zakładka „Korespondencja” kartoteki pokazuje liczbę zgodną z księgą', count('Korespondencja'), s.correspondence, s.name);
      C.eq('Interfejs', 'zakładka „Osoby” kartoteki pokazuje liczbę zgodną z księgą', count('Osoby'), s.contacts, s.name);
      for (let i = 0; i < n; i++) {
        const before = problems.length;
        where = `${user.role} kartoteka: zakładka ${labels[i]?.replace(/\s+/g, ' ')}`;
        await tabs.nth(i).click();
        await settle();
        screens++;
        C.check('Interfejs', 'zakładka kartoteki otwiera się bez błędów', problems.length === before, problems.slice(before).join(' | '));
      }
      if (user.role === 'admin') {
        const f = path.join(dir, 'kartoteka-kontrahenta.png');
        await page.screenshot({ path: f });
        shots.push(f);
      }
      if (o.expected.sampleProjectId) {
        where = `${user.role} kartoteka projektu`;
        const before = problems.length;
        await page.goto(`${o.baseUrl}/projekty/${o.expected.sampleProjectId}`);
        await settle();
        screens++;
        C.check('Interfejs', 'kartoteka projektu otwiera się bez błędów', problems.length === before, problems.slice(before).join(' | '));
      }

      // uniwersalny rejestr: grupowanie zmienia widok i nie gubi rekordów
      if (user.role === 'admin') {
        where = 'admin grupowanie rejestru kontrahentów';
        await page.goto(o.baseUrl + '/kontrahenci');
        await settle();
        const sel = page.locator('select', { hasText: 'grupuj według' }).first();
        if (await sel.count()) {
          // rejestr kontrahentów może mieć już zapamiętane grupowanie po mieście
          if (!/ilość:\s*\d+/.test(await page.locator('body').innerText())) {
            await sel.selectOption({ label: 'Miasto' }).catch(() => undefined);
            await settle();
          }
          // tabela renderuje tylko widoczne wiersze, więc do zliczenia grup zwijamy je wszystkie
          await page.getByText('Zwiń wszystko', { exact: true }).click();
          await settle();
          const text = await page.locator('body').innerText();
          const groups = [...text.matchAll(/ilość:\s*(\d+)/g)].map((m) => Number(m[1]));
          C.check('Interfejs', 'grupowanie rejestru po mieście: liczniki grup sumują się do liczby rekordów', groups.length > 1 && groups.reduce((a, b) => a + b, 0) === o.expected.contractorsActive, `grup ${groups.length}, suma ${groups.reduce((a, b) => a + b, 0)}, rekordów ${o.expected.contractorsActive}`);
          const f = path.join(dir, 'rejestr-grupowanie.png');
          await page.screenshot({ path: f });
          shots.push(f);
        } else C.check('Interfejs', 'rejestr ma panel grupowania', false, 'nie znaleziono listy „grupuj według”');
      }

      // przypomnienie: komunikat wyskakuje sam, bez odświeżania strony
      if (user.role === 'handlowiec') {
        where = 'przypomnienie na ekranie';
        await page.goto(o.baseUrl + '/kontrahenci');
        await settle();
        const dialog = page.getByRole('alertdialog', { name: 'Przypomnienie' });
        // potwierdź zaległe przypomnienia z symulacji, żeby sprawdzić pojawienie się nowego
        for (let i = 0; i < 30 && (await dialog.isVisible().catch(() => false)); i++) {
          const btn = dialog.getByRole('button', { name: /Potwierd|OK|Przyj/ }).first();
          if (!(await btn.count())) break;
          await btn.click();
          await settle();
        }
        const t = await o.createReminderTask(user.login);
        const earlier = await dialog.getByText('Zadanie z przypomnieniem (test interfejsu)').isVisible().catch(() => false);
        C.check('Interfejs', 'przypomnienie nie wyskakuje przed czasem', !earlier, '');
        o.setServerNow(addMin(t.remindAt, 1));
        await o.tick();
        await page.clock.runFor(35000);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        const shown = await dialog.getByText('Zadanie z przypomnieniem (test interfejsu)').waitFor({ timeout: 5000 }).then(() => true, () => false);
        C.check('Interfejs', 'przypomnienie o zadaniu samo wyskakuje na ekranie operatora (w ciągu ok. pół minuty)', shown, '');
        const f = path.join(dir, 'przypomnienie.png');
        await page.screenshot({ path: f });
        shots.push(f);
      }
      } catch (e: any) {
        C.check('Interfejs', 'etap przeglądarkowy przebiega bez przerwania', false, `${where}: ${String(e?.message ?? e).split('\n')[0]}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return { screens, screenshots: shots.map((f) => path.relative(o.outDir, f)) };
}
