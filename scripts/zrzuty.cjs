// Zrzuty ekranów gotowej aplikacji do docs/zrzuty (wymaga uruchomionego serwera z danymi przykładowymi).
// Użycie: BASE=http://localhost:3100 ADMIN_PW=... DEMO_PW=... node scripts/zrzuty.cjs
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const BASE = process.env.BASE || 'http://localhost:3100';
const OUT = path.resolve(__dirname, '../docs/zrzuty');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(`${p.url()} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${p.url()} console: ${m.text()}`));
  const shot = async (name) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('zrzut', name);
  };
  const go = async (url) => {
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
  };
  const closeModal = async () => {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  };

  // logowanie
  await go('/');
  await shot('00-logowanie');
  await p.fill('#login', 'jkowalska');
  await p.fill('#password', process.env.DEMO_PW);
  await p.click('button:has-text("Zaloguj")');
  await p.waitForSelector('text=Moje zadania na dziś');
  // przypomnienia mogą zasłonić ekran — potwierdź
  for (let i = 0; i < 5 && (await p.locator('.reminder-modal').count()); i++) {
    await shot('01b-przypomnienie');
    await p.locator('.reminder-modal button:has-text("Potwierdzam")').first().click();
    await p.waitForTimeout(300);
  }
  await shot('01-moje-zadania-na-dzis');

  await go('/kontrahenci');
  await p.locator('.dt-row').nth(1).click();
  await shot('02-rejestr-kontrahentow');
  // grupowanie wielopoziomowe: miasto + status
  await p.selectOption('select[aria-label="Grupuj według"]', { label: 'Status' });
  await shot('03-rejestr-grupowanie-miasto-status');
  await p.locator('.chip button[title="Usuń grupowanie"]').first().click();
  await p.locator('.chip button[title="Usuń grupowanie"]').first().click();

  await p.locator('.dt-row').first().dblclick();
  await p.waitForSelector('text=Kartoteka:');
  await shot('04-kartoteka-szczegoly');
  for (const [tab, name] of [['Osoby', '05-kartoteka-osoby'], ['Korespondencja', '06-kartoteka-korespondencja'], ['Zadania', '07-kartoteka-zadania'], ['Sprzedaż', '08-kartoteka-sprzedaz'], ['Załączniki', '09-kartoteka-zalaczniki'], ['Lokalizacja', '10-kartoteka-lokalizacja']]) {
    await p.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    await shot(name);
  }
  await p.getByRole('button', { name: 'Nowa korespondencja' }).first().click();
  await p.waitForTimeout(1500);
  await shot('11-formularz-korespondencji');
  await closeModal();
  await p.getByRole('button', { name: 'Nowe zadanie' }).first().click();
  await shot('12-formularz-zadania');
  await closeModal();

  await go('/korespondencja');
  await p.locator('.dt-row').first().click();
  await shot('13-rejestr-korespondencji');
  await go('/korespondencja-seryjna');
  await p.getByRole('button', { name: 'Nowa wysyłka' }).click();
  await p.locator('.modal input').first().fill('Zaproszenie na szkolenie');
  await p.locator('.modal .form-grid select').nth(1).selectOption({ index: 1 });
  await p.locator('.modal .form-grid input').nth(1).fill('Zaproszenie dla {{firma}}');
  await p.getByRole('button', { name: /Podgląd odbiorców/ }).click();
  await shot('14-korespondencja-seryjna-podglad');
  await closeModal();
  await go('/wiadomosci');
  await p.getByRole('tab', { name: /Wysłane/ }).click();
  await p.locator('.dt-row').first().click();
  await shot('15-korespondencja-wewnetrzna');

  await go('/kalendarz');
  await shot('16-kalendarz-tydzien');
  await go('/zadania');
  await shot('17-rejestr-zadan');
  await go('/zadania-cykliczne');
  await shot('18-zadania-cykliczne');

  await go('/projekty');
  await shot('19-projekty');
  await p.locator('.dt-row').first().dblclick();
  await shot('20-kartoteka-projektu');
  await go('/zamowienia');
  await p.locator('.dt-row').first().dblclick();
  await shot('21-zamowienie');
  await closeModal();
  await go('/sprzedaz');
  await p.selectOption('select[aria-label="Grupuj według"]', { label: 'Handlowiec' });
  await shot('22-sprzedaz-grupowanie-handlowiec');
  await go('/towary');
  await shot('23-kartoteka-towarowa');

  await go('/dokumenty');
  await p.locator('.dt-row').first().click();
  await shot('24-rejestr-dokumentow');
  await p.getByRole('tab', { name: /Rejestr zmian/ }).click();
  await shot('25-dokument-rejestr-zmian');
  await go('/szablony');
  await p.getByRole('button', { name: 'Generuj dokument' }).click();
  await shot('26-generowanie-z-szablonu');
  await closeModal();

  await go('/raporty');
  for (const [tab, name] of [['Brak aktywności', '27-raport-brak-aktywnosci'], ['Skuteczność handlowców', '28-raport-skutecznosc-handlowcow'], ['Statystyka zadań', '29-raport-statystyka-zadan'], ['Aktywność operatora', '30-raport-aktywnosc-operatora'], ['Czas pracy', '31-raport-czas-pracy']]) {
    await p.getByRole('tab', { name: tab }).click();
    await p.getByRole('button', { name: 'Generuj raport' }).click();
    await p.waitForTimeout(500);
    await shot(name);
  }
  await p.getByRole('tab', { name: 'Raporty automatyczne' }).click();
  await shot('32-raporty-automatyczne');
  await go('/import');
  await shot('33-import');
  await go('/kolejka');
  await shot('34-kolejka-wysylki');

  // administrator
  await p.getByRole('button', { name: 'Wyloguj' }).click();
  await p.fill('#login', 'admin');
  await p.fill('#password', process.env.ADMIN_PW);
  await p.click('button:has-text("Zaloguj")');
  await p.waitForSelector('text=Zmiana hasła startowego');
  await shot('35-wymuszona-zmiana-hasla');
  await p.fill('#pw-cur', process.env.ADMIN_PW);
  await p.fill('#pw-new', 'Administrator2026');
  await p.fill('#pw-new2', 'Administrator2026');
  await p.click('button:has-text("Zmień hasło")');
  await p.waitForSelector('text=Moje zadania na dziś');
  await go('/ustawienia');
  for (const [tab, name] of [['Operatorzy', '36-ustawienia-operatorzy'], ['Słowniki', '37-ustawienia-slowniki'], ['Pola dodatkowe', '38-ustawienia-pola-dodatkowe'], ['Reguły zadań', '39-ustawienia-reguly'], ['Poczta SMTP', '40-ustawienia-smtp'], ['Bramka SMS', '41-ustawienia-sms'], ['Dane firmy', '42-ustawienia-dane-firmy']]) {
    await p.getByRole('tab', { name: tab }).click();
    await shot(name);
  }
  console.log(errors.length ? 'BŁĘDY:\n' + errors.join('\n') : 'brak błędów w konsoli');
  await b.close();
})();
