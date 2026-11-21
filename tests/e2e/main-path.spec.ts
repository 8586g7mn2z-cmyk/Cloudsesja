import { expect, test } from '@playwright/test';

// Główna ścieżka: logowanie → kontrahent → osoba kontaktowa → korespondencja → zadanie → dokument → raport.
test('główna ścieżka pracy operatora', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // logowanie i wymuszona zmiana hasła startowego
  await page.goto('/');
  await page.fill('#login', 'admin');
  await page.fill('#password', 'zle-haslo');
  await page.click('button:has-text("Zaloguj")');
  await expect(page.getByText('Niepoprawny login lub hasło.')).toBeVisible();
  await page.fill('#password', 'Start1234');
  await page.click('button:has-text("Zaloguj")');
  await expect(page.getByText('Zmiana hasła startowego')).toBeVisible();
  await page.fill('#pw-cur', 'Start1234');
  await page.fill('#pw-new', 'Diagnos2026');
  await page.fill('#pw-new2', 'Diagnos2026');
  await page.click('button:has-text("Zmień hasło")');
  await expect(page.getByRole('heading', { name: 'Moje zadania na dziś' })).toBeVisible();

  // nowy kontrahent z walidacją NIP
  await page.getByRole('link', { name: 'Kontrahenci', exact: true }).click();
  await page.getByRole('button', { name: 'Nowy kontrahent' }).click();
  await page.fill('#c-name', 'Testowa Firma Handlowa Sp. z o.o.');
  await page.fill('#c-short', 'TESTOWA');
  await page.fill('#c-nip', '5261040827');
  await expect(page.getByText('Niepoprawny NIP (suma kontrolna).')).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Niepoprawny NIP (błędna suma kontrolna lub długość).')).toBeVisible();
  await page.fill('#c-nip', '526-104-08-28');
  await page.fill('#c-city', 'Kraków');
  await page.fill('#c-email', 'biuro@testowa.example');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('heading', { name: /Kartoteka: TESTOWA/ })).toBeVisible();

  // osoba kontaktowa
  await page.getByRole('tab', { name: /Osoby/ }).click();
  await page.getByRole('button', { name: 'Nowa osoba kontaktowa' }).click();
  await page.fill('#p-fn', 'Wojciech');
  await page.fill('#p-ln', 'Cieślik');
  await page.fill('#p-pos', 'Dyrektor handlowy');
  await page.fill('#p-ph', '12 379 31 54');
  await page.fill('#p-em', 'w.cieslik@testowa.example');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('cell', { name: /Wojciech Cieślik/ })).toBeVisible();

  // korespondencja: stoper, temat ze słownika, adresat, treść
  await page.getByRole('button', { name: 'Nowa korespondencja' }).first().click();
  const modal = page.locator('.modal');
  await expect(modal.locator('.stopwatch')).toHaveText(/00:00:0\d/);
  await modal.locator('.form-grid select').nth(2).selectOption({ label: 'Badanie zainteresowania' });
  await modal.locator('.form-grid select').nth(3).selectOption({ index: 1 });
  await page.getByRole('tab', { name: 'Treść' }).click();
  await page.getByLabel('Treść').fill('Klient zainteresowany analizatorem DIAG-200. Prosi o ofertę.');
  await page.waitForTimeout(1200);
  await expect(modal.locator('.stopwatch')).not.toHaveText('00:00:00');
  await modal.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(page.getByText('Zapisano korespondencję.')).toBeVisible();
  await page.getByRole('tab', { name: /Korespondencja/ }).click();
  await expect(page.locator('.dt-row').filter({ hasText: 'Badanie zainteresowania' })).toBeVisible();
  await expect(page.locator('.dt-row').filter({ hasText: /DIAGNOS\/1\/\d{8}/ })).toBeVisible();
  await expect(page.locator('.dt-row').filter({ hasText: 'Wojciech Cieślik' })).toBeVisible();

  // zadanie z postępem
  await page.getByRole('button', { name: 'Nowe zadanie' }).first().click();
  await page.fill('#t-title', 'Przygotować ofertę na DIAG-200');
  await page.fill('#t-prog', '30');
  await page.getByRole('button', { name: /Zapisz/ }).click();
  await expect(page.getByText('Dodano zadanie.')).toBeVisible();
  await page.getByRole('tab', { name: /Zadania/ }).click();
  await expect(page.locator('.dt-row').filter({ hasText: 'Przygotować ofertę na DIAG-200' })).toBeVisible();
  // zadanie „kontakt” utworzone automatycznie przez regułę dla nowego kontrahenta
  await expect(page.locator('.dt-row').filter({ hasText: 'Kontakt z nowym kontrahentem: TESTOWA' })).toBeVisible();

  // dokument w rejestrze przypisany do kontrahenta
  await page.getByRole('link', { name: 'Rejestr dokumentów' }).click();
  await page.getByRole('button', { name: 'Nowy dokument' }).click();
  await page.getByLabel('Plik dokumentu').setInputFiles({ name: 'oferta-testowa.txt', mimeType: 'text/plain', buffer: Buffer.from('Oferta testowa — treść') });
  await page.locator('.modal .form-grid select').first().selectOption({ label: 'Oferty' });
  await page.getByPlaceholder('wyszukaj kontrahenta (nazwa, NIP, miasto)…').fill('TESTOWA');
  await page.getByPlaceholder('wyszukaj kontrahenta (nazwa, NIP, miasto)…').press('Enter');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Dodano dokument do rejestru.')).toBeVisible();
  const docRow = page.locator('.dt-row').filter({ hasText: 'oferta-testowa' });
  await expect(docRow).toBeVisible();
  await expect(docRow).toContainText(/DIAGNOS\/D\/1\//);
  await docRow.click();
  await expect(page.locator('.side-panel').getByText('Twoje prawo')).toBeVisible();

  // dokument widoczny w kartotece kontrahenta (załączniki wg źródła)
  await page.getByPlaceholder('Szukaj kontrahenta: nazwa, NIP, telefon, e-mail, osoba…').fill('5261040828');
  await page.locator('.search-results div').first().click();
  await page.getByRole('tab', { name: /Załączniki/ }).click();
  await expect(page.getByText('Z rejestru dokumentów (1)')).toBeVisible();

  // raport aktywności operatora
  await page.getByRole('link', { name: 'Raporty' }).click();
  await page.getByRole('tab', { name: 'Aktywność operatora' }).click();
  await page.getByRole('button', { name: 'Generuj raport' }).click();
  await expect(page.getByRole('heading', { name: 'Raport aktywności dla operatora: Administrator' })).toBeVisible();
  const row = page.locator('table.grid tbody tr').filter({ hasText: 'Telefon' });
  await expect(row.locator('td').nth(1)).toHaveText('1');
  await expect(page.locator('svg.chart')).toBeVisible();
  const pdf = await page.request.get(`/api/reports/activity/pdf?from=2020-01-01&to=2099-12-31`);
  expect(pdf.headers()['content-type']).toBe('application/pdf');

  // uniwersalny rejestr: grupowanie po mieście z licznikiem
  await page.getByRole('link', { name: 'Kontrahenci', exact: true }).click();
  await expect(page.locator('.dt-grow').filter({ hasText: 'KRAKÓW' })).toContainText('ilość: 1');

  expect(errors).toEqual([]);
});

// Regresje z audytu interfejsu: potwierdzenie usunięcia nad formularzem, brak duplikatów po dwukliku „Zapisz",
// formularz nie znika po kliknięciu w tło, samouczek.
test('okna dialogowe, podwójny zapis i samouczek', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.fill('#login', 'admin');
  await page.fill('#password', 'Diagnos2026');
  await page.click('button:has-text("Zaloguj")');
  await expect(page.getByRole('heading', { name: 'Moje zadania na dziś' })).toBeVisible();

  // samouczek: zaproszenie przy pierwszym wejściu, przejście kilku kroków, zamknięcie klawiszem Esc
  const tour = page.getByRole('dialog', { name: 'Samouczek' });
  await expect(page.locator('.tour-invite')).toBeVisible();
  await page.getByRole('button', { name: 'Uruchom samouczek' }).click();
  await expect(tour.getByText(/Krok 1 z \d+/)).toBeVisible();
  for (let i = 0; i < 7; i++) await tour.getByRole('button', { name: 'Dalej' }).click();
  await expect(tour.getByRole('heading', { name: 'Panel grupowania' })).toBeVisible();
  await expect(page).toHaveURL(/\/projekty$/);
  await expect(page.locator('.tour-hole')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tour).toHaveCount(0);

  // dwuklik „Zapisz" wysyła formularz tylko raz
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/projects')) posts++;
  });
  await page.getByRole('link', { name: 'Zapytania i przetargi' }).click();
  await page.getByRole('button', { name: 'Nowy przetarg' }).click();
  const modal = page.locator('.modal');
  await modal.locator('#case-name').fill('Projekt po dwukliku');
  // kliknięcie w tło nie zamyka formularza i nie gubi danych
  await page.mouse.click(5, 400);
  await expect(modal.locator('#case-name')).toHaveValue('Projekt po dwukliku');
  await modal.getByRole('button', { name: 'Zapisz' }).dblclick();
  await page.waitForLoadState('networkidle');
  expect(posts).toBe(1);

  // kartoteka sprawy: dokumentacja i historia
  await expect(page.getByRole('heading', { name: 'Przetarg: Projekt po dwukliku' })).toBeVisible();
  await page.getByRole('button', { name: 'Dokument', exact: true }).click();
  await page.getByLabel('Plik dokumentu').setInputFiles({ name: 'swz.txt', mimeType: 'text/plain', buffer: Buffer.from('Specyfikacja warunków zamówienia') });
  await page.locator('.modal').getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('cell', { name: 'swz', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Historia' }).click();
  await expect(page.locator('.timeline')).toContainText('Założono sprawę');
  await expect(page.locator('.timeline')).toContainText('Dodano dokument: swz');

  // usunięcie z okna formularza: pytanie o potwierdzenie jest nad formularzem i daje się kliknąć
  await page.goto('/zadania');
  // przypomnienie o zadaniu z pierwszego testu może w tej chwili wyskoczyć — operator je potwierdza
  await page.waitForLoadState('networkidle');
  const reminder = page.locator('.reminder-modal button:has-text("Potwierdzam")');
  for (let i = 0; i < 5 && (await reminder.count()); i++) {
    await reminder.first().click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(300);
  }
  await page.locator('.dt-row').filter({ hasText: 'Przygotować ofertę na DIAG-200' }).dblclick();
  await page.locator('.modal').getByRole('button', { name: 'Usuń' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Potwierdzenie' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Usuń' }).click();
  await expect(page.locator('.dt-row').filter({ hasText: 'Przygotować ofertę na DIAG-200' })).toHaveCount(0);

  // słowniki: dodanie podgrupy
  await page.goto('/ustawienia');
  await page.getByRole('tab', { name: 'Słowniki' }).click();
  await page.getByText('Grupy i podgrupy kontrahentów').first().click();
  await page.locator('select', { hasText: 'grupa nadrzędna…' }).selectOption({ label: 'Handel' });
  await page.fill('#sub-name', 'Dystrybucja');
  await page.getByRole('button', { name: 'Dodaj podgrupę' }).click();
  await expect(page.getByText('Dystrybucja')).toBeVisible();

  expect(errors).toEqual([]);
});
