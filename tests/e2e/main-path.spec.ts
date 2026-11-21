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
