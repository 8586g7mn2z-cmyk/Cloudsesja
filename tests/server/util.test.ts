import { describe, expect, it } from 'vitest';
import { isValidNip, isValidRegon, parseCsv, renderTemplate, parseNumberPl, parseDatePl } from '../../server/src/util.js';
import { makeNip, makeRegon } from '../../server/src/seed.js';
import { setup } from './helpers.js';

describe('walidacja NIP i REGON', () => {
  it('akceptuje poprawne NIP-y (także z kreskami) i odrzuca błędną sumę kontrolną', () => {
    expect(isValidNip('526-104-08-28')).toBe(true);
    expect(isValidNip('5261040828')).toBe(true);
    expect(isValidNip('5261040827')).toBe(false);
    expect(isValidNip('123')).toBe(false);
    expect(isValidNip('')).toBe(false);
  });
  it('REGON 9- i 14-cyfrowy', () => {
    expect(isValidRegon('012100784')).toBe(true);
    expect(isValidRegon('012100785')).toBe(false);
    expect(isValidRegon('12345678512347')).toBe(true);
    expect(isValidRegon('12345678512348')).toBe(false);
  });
  it('generator danych przykładowych tworzy poprawne numery', () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidNip(makeNip())).toBe(true);
      expect(isValidRegon(makeRegon())).toBe(true);
    }
  });
});

describe('narzędzia', () => {
  it('podstawia pola w szablonie, braki jako pusty tekst', () => {
    expect(renderTemplate('Dzień dobry {{osoba}}, firma {{kontrahent.nazwa}}{{brak}}.', { osoba: 'Jan', kontrahent: { nazwa: 'ACME' } })).toBe('Dzień dobry Jan, firma ACME.');
  });
  it('parsuje CSV ze średnikiem, cudzysłowami i polskimi znakami', () => {
    const rows = parseCsv('﻿Nazwa;Miasto;Uwagi\n"Firma ""Łąka""";Łódź;"wiersz1\nwiersz2"\n\nB;Kraków;\n');
    expect(rows).toEqual([
      ['Nazwa', 'Miasto', 'Uwagi'],
      ['Firma "Łąka"', 'Łódź', 'wiersz1\nwiersz2'],
      ['B', 'Kraków', ''],
    ]);
  });
  it('liczby i daty w formacie polskim', () => {
    expect(parseNumberPl('1 234,56 zł')).toBe(1234.56);
    expect(parseNumberPl('12.5')).toBe(12.5);
    expect(parseDatePl('05.03.2026')).toBe('2026-03-05');
    expect(parseDatePl('2026-03-05')).toBe('2026-03-05');
    expect(parseDatePl('xx')).toBe(null);
  });
});

describe('numeracja', () => {
  it('korespondencja dostaje kolejne numery DIAGNOS/n/RRRRMMDD', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      const kind = env.ctx.db.get<any>("SELECT id FROM dict_items WHERE dict='corr_kind' AND code='phone'").id;
      const a = await admin('POST', '/api/correspondence', { kind_id: kind, direction: 'out', event_at: '2026-04-17T09:27', topic_text: 'Test', duration_sec: 39 });
      const b = await admin('POST', '/api/correspondence', { kind_id: kind, direction: 'in', event_at: '2026-04-18T10:00', topic_text: 'Test 2' });
      expect(a.json.number).toBe('DIAGNOS/1/20260417');
      expect(b.json.number).toBe('DIAGNOS/2/20260418');
      const d = await admin('GET', `/api/correspondence/${a.json.id}`);
      expect(d.json.duration_sec).toBe(39);
    } finally {
      await env.close();
    }
  });
});
