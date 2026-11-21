// Zapis wyników symulacji: raport.md (dla człowieka) i raport.json (dla narzędzi).
import fs from 'node:fs';
import path from 'node:path';
import type { Checks } from './lib.js';

export interface UiResult {
  screens: number;
  screenshots: string[];
}

export function writeReport(outDir: string, C: Checks, stats: Record<string, any>, log: string[], ui: UiResult | null): string {
  const areas = new Map<string, { pass: number; fail: number; items: typeof C.failed }>();
  for (const s of C.stats.values()) {
    const a = areas.get(s.area) ?? { pass: 0, fail: 0, items: [] };
    a.pass += s.pass;
    a.fail += s.fail;
    a.items.push(s);
    areas.set(s.area, a);
  }
  const L: string[] = [];
  const ok = C.totalFail === 0;
  L.push('# Symulacja pracy firmy w DIAGNOS CRM');
  L.push('');
  L.push(ok ? `**Wynik: bez zastrzeżeń.** Wszystkie ${C.totalPass} sprawdzeń zgodne z niezależną księgą symulacji.` : `**Wynik: ${C.totalFail} niezgodności** (w ${C.failed.length} rodzajach sprawdzeń) na ${C.totalPass + C.totalFail} sprawdzeń.`);
  L.push('');
  L.push(`Okres: ${stats.days} dni od ${stats.start} do ${stats.lastDate} (czas firmy), ziarno losowości ${stats.seed}, czas wykonania ${stats.durationSec} s, żądań do API: ${stats.requests}.`);
  L.push('');
  L.push('## Co się wydarzyło w symulowanej firmie');
  L.push('');
  L.push('| Wielkość | Liczba |');
  L.push('|---|---:|');
  const rows: [string, any][] = [
    ['Operatorzy', stats.operators], ['Kontrahenci', stats.contractors], ['Osoby kontaktowe', stats.contacts], ['Pozycje korespondencji', stats.correspondence],
    ['Zadania (w tym cykliczne i automatyczne)', stats.tasks], ['Przypomnienia, które zadziałały', stats.reminders], ['Zamówienia', stats.orders],
    ['Dokumenty sprzedaży', stats.sales], ['Sprzedaż netto [zł]', stats.salesNet], ['Projekty', stats.projects], ['Dokumenty w rejestrze', stats.documents],
    ['Wiadomości wewnętrzne', stats.internalMessages], ['E-maile odebrane przez testowy serwer poczty', stats.emails], ['SMS-y odebrane przez testową bramkę', stats.sms],
  ];
  for (const [k, v] of rows) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('Najważniejsze zdarzenia:');
  L.push('');
  for (const l of log) L.push(`- ${l}`);
  L.push('');
  L.push('## Wyniki sprawdzeń wg obszaru');
  L.push('');
  L.push('| Obszar | Sprawdzeń | Niezgodności |');
  L.push('|---|---:|---:|');
  for (const [name, a] of [...areas.entries()].sort()) L.push(`| ${name} | ${a.pass + a.fail} | ${a.fail} |`);
  L.push('');
  if (!ok) {
    L.push('## Niezgodności');
    L.push('');
    for (const f of C.failed) {
      L.push(`### ${f.area}: ${f.name}`);
      L.push('');
      L.push(`Niezgodnych: ${f.fail} z ${f.fail + f.pass}. Przykłady:`);
      L.push('');
      for (const d of f.details) L.push(`- ${d}`);
      L.push('');
    }
  }
  L.push('## Pełna lista sprawdzeń');
  L.push('');
  for (const [name, a] of [...areas.entries()].sort()) {
    L.push(`**${name}**`);
    L.push('');
    for (const s of a.items) L.push(`- ${s.fail ? '✗' : '✓'} ${s.name} (${s.pass}/${s.pass + s.fail})`);
    L.push('');
  }
  if (ui) {
    L.push('## Etap w przeglądarce');
    L.push('');
    L.push(`Przejrzano ${ui.screens} ekranów na danych z symulacji; zrzuty: ${ui.screenshots.length} plików w katalogu \`ekrany/\`.`);
    L.push('');
  }
  const file = path.join(outDir, 'raport.md');
  fs.writeFileSync(file, L.join('\n'));
  fs.writeFileSync(path.join(outDir, 'raport.json'), JSON.stringify({ ok, stats, checks: [...C.stats.values()], log, ui }, null, 2));
  return file;
}
