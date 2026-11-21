// Źródło importu: plik XLSX/CSV z mapowaniem kolumn (np. eksport z Excela lub z programu fakturującego).
// Plik jest zamieniany na znormalizowane rekordy, a zapis wykonuje warstwa importCore.ts,
// wspólna dla wszystkich źródeł danych.
import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import type { Ctx } from '../context.js';
import { bad, nowIso, parseCsv, parseDatePl, parseNumberPl, str } from '../util.js';
import {
  type ContactRecord,
  type ContractorRecord,
  type ContractorRef,
  type ImportOptions,
  type ProductRecord,
  type SaleRecord,
  type UpsertResult,
  upsertContact,
  upsertContractor,
  upsertProduct,
  upsertSale,
} from './importCore.js';

export const DEFAULT_FILE_SOURCE = 'plik XLSX/CSV';

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
}

const contractorFields: ImportField[] = [
  { key: 'name', label: 'Pełna nazwa', required: true, aliases: ['nazwa', 'nazwa pełna', 'firma', 'kontrahent', 'nazwa firmy'] },
  { key: 'short_name', label: 'Skrót nazwy', aliases: ['skrót', 'nazwa skrócona', 'symbol', 'skrot'] },
  { key: 'nip', label: 'NIP', aliases: ['nip'] },
  { key: 'regon', label: 'REGON', aliases: ['regon'] },
  { key: 'krs', label: 'KRS' },
  { key: 'tax_office', label: 'Urząd skarbowy', aliases: ['us', 'urząd skarbowy'] },
  { key: 'street', label: 'Ulica i numer', aliases: ['ulica', 'adres'] },
  { key: 'postal_code', label: 'Kod pocztowy', aliases: ['kod', 'kod pocztowy'] },
  { key: 'city', label: 'Miasto', aliases: ['miejscowość', 'miasto'] },
  { key: 'voivodeship', label: 'Województwo', aliases: ['województwo', 'woj'] },
  { key: 'country', label: 'Kraj' },
  { key: 'phone', label: 'Telefon', aliases: ['telefon', 'tel', 'telefon 1'] },
  { key: 'phone2', label: 'Telefon 2', aliases: ['telefon 2', 'tel2', 'gsm'] },
  { key: 'email', label: 'E-mail', aliases: ['email', 'e-mail', 'mail'] },
  { key: 'www', label: 'WWW', aliases: ['www', 'strona'] },
  { key: 'type', label: 'Typ (nazwa ze słownika)', aliases: ['typ'] },
  { key: 'status', label: 'Status (nazwa ze słownika)', aliases: ['status'] },
  { key: 'group', label: 'Grupa', aliases: ['grupa', 'branża'] },
  { key: 'subgroup', label: 'Podgrupa', aliases: ['podgrupa'] },
  { key: 'price_group', label: 'Grupa cenowa', aliases: ['grupa cenowa'] },
  { key: 'source', label: 'Źródło kontaktu', aliases: ['źródło', 'źródło kontaktu'] },
  { key: 'owner', label: 'Prowadzący (login lub imię i nazwisko)', aliases: ['prowadzący', 'opiekun', 'handlowiec'] },
  { key: 'credit_limit', label: 'Limit kredytu', aliases: ['limit', 'limit kredytu'] },
  { key: 'contract_no', label: 'Nr umowy', aliases: ['nr umowy', 'umowa'] },
  { key: 'is_key', label: 'Kluczowy (tak/nie)', aliases: ['kluczowy'] },
  { key: 'notes', label: 'Uwagi', aliases: ['uwagi', 'notatki'] },
  { key: 'external_id', label: 'Identyfikator w systemie źródłowym', aliases: ['id', 'kod kontrahenta', 'identyfikator', 'id zewnętrzne'] },
];
const contractorRef: ImportField[] = [
  { key: 'contractor_external_id', label: 'Kontrahent: identyfikator z programu źródłowego', aliases: ['id kontrahenta', 'kod kontrahenta'] },
  { key: 'contractor_nip', label: 'Kontrahent: NIP', aliases: ['nip', 'nip kontrahenta'] },
  { key: 'contractor_name', label: 'Kontrahent: nazwa', aliases: ['kontrahent', 'firma', 'nazwa kontrahenta'] },
];
export const IMPORT_KINDS: Record<string, { label: string; fields: ImportField[] }> = {
  contractors: { label: 'Kontrahenci', fields: contractorFields },
  contacts: {
    label: 'Osoby kontaktowe',
    fields: [
      ...contractorRef,
      { key: 'external_id', label: 'Identyfikator osoby w systemie źródłowym', aliases: ['id osoby'] },
      { key: 'first_name', label: 'Imię', aliases: ['imię', 'imie'] },
      { key: 'last_name', label: 'Nazwisko', required: true, aliases: ['nazwisko'] },
      { key: 'position', label: 'Stanowisko', aliases: ['stanowisko', 'funkcja'] },
      { key: 'phone', label: 'Telefon', aliases: ['telefon', 'tel'] },
      { key: 'mobile', label: 'Telefon komórkowy', aliases: ['komórka', 'gsm', 'telefon komórkowy'] },
      { key: 'email', label: 'E-mail', aliases: ['email', 'e-mail'] },
      { key: 'notes', label: 'Uwagi', aliases: ['uwagi'] },
    ],
  },
  products: {
    label: 'Kartoteka towarowa',
    fields: [
      { key: 'sku', label: 'Indeks', aliases: ['indeks', 'symbol', 'kod'] },
      { key: 'name', label: 'Nazwa', required: true, aliases: ['nazwa', 'nazwa towaru'] },
      { key: 'unit', label: 'Jednostka', aliases: ['jm', 'j.m.', 'jednostka'] },
      { key: 'net_price', label: 'Cena netto', aliases: ['cena netto', 'cena'] },
      { key: 'vat_rate', label: 'Stawka VAT (%)', aliases: ['vat', 'stawka vat'] },
      { key: 'ean', label: 'EAN', aliases: ['ean', 'kod kreskowy'] },
      { key: 'product_group', label: 'Grupa towarowa', aliases: ['grupa', 'grupa towarowa'] },
      { key: 'external_id', label: 'Identyfikator w systemie źródłowym', aliases: ['id', 'id zewnętrzne'] },
    ],
  },
  sales: {
    label: 'Transakcje sprzedaży',
    fields: [
      { key: 'doc_number', label: 'Numer dokumentu', required: true, aliases: ['numer', 'nr dokumentu', 'numer dokumentu', 'faktura'] },
      { key: 'doc_date', label: 'Data dokumentu', required: true, aliases: ['data', 'data wystawienia', 'data dokumentu'] },
      ...contractorRef,
      { key: 'external_id', label: 'Identyfikator dokumentu w systemie źródłowym', aliases: ['id dokumentu'] },
      { key: 'operator', label: 'Handlowiec (login lub imię i nazwisko)', aliases: ['handlowiec', 'wystawił', 'sprzedawca'] },
      { key: 'item_name', label: 'Pozycja: nazwa towaru', aliases: ['towar', 'nazwa towaru', 'pozycja'] },
      { key: 'product_sku', label: 'Pozycja: indeks towaru', aliases: ['indeks', 'symbol'] },
      { key: 'qty', label: 'Pozycja: ilość', aliases: ['ilość', 'ilosc'] },
      { key: 'unit', label: 'Pozycja: jednostka', aliases: ['jm', 'j.m.'] },
      { key: 'net_price', label: 'Pozycja: cena netto', aliases: ['cena netto', 'cena'] },
      { key: 'vat_rate', label: 'Pozycja: stawka VAT (%)', aliases: ['vat', 'stawka vat'] },
      { key: 'net_total', label: 'Dokument: wartość netto (gdy brak pozycji)', aliases: ['netto', 'wartość netto'] },
      { key: 'gross_total', label: 'Dokument: wartość brutto (gdy brak pozycji)', aliases: ['brutto', 'wartość brutto'] },
    ],
  },
};

export async function readTable(buf: Buffer, fileName: string): Promise<string[][]> {
  if (/\.csv$|\.txt$/i.test(fileName)) {
    let text = buf.toString('utf8');
    if (text.includes('�')) text = new TextDecoder('windows-1250').decode(buf);
    return parseCsv(text);
  }
  if (!/\.xlsx$/i.test(fileName)) throw bad('Obsługiwane formaty: XLSX i CSV.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  if (!ws) throw bad('Plik nie zawiera arkusza.');
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v: any = row.getCell(c).value;
      let s = '';
      if (v == null) s = '';
      else if (v instanceof Date) s = v.toISOString().slice(0, 10);
      else if (typeof v === 'object' && 'text' in v) s = String(v.text);
      else if (typeof v === 'object' && 'result' in v) s = String(v.result ?? '');
      else if (typeof v === 'object' && 'richText' in v) s = v.richText.map((t: any) => t.text).join('');
      else s = String(v);
      vals.push(s);
    }
    rows.push(vals);
  });
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const pending = new Map<string, { kind: string; fileName: string; headers: string[]; rows: string[][]; at: number }>();

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();

export function customFieldsAsImport(ctx: Ctx): ImportField[] {
  return ctx.db
    .all<any>("SELECT code, label FROM custom_fields WHERE entity = 'contractor' AND active = 1 ORDER BY sort")
    .map((f) => ({ key: `custom:${f.code}`, label: `Pole dodatkowe: ${f.label}`, aliases: [f.label] }));
}

export function fieldsFor(ctx: Ctx, kind: string): ImportField[] {
  const k = IMPORT_KINDS[kind];
  if (!k) throw bad('Nieznany rodzaj importu.');
  return kind === 'contractors' ? [...k.fields, ...customFieldsAsImport(ctx)] : k.fields;
}

export async function prepareImport(ctx: Ctx, kind: string, fileName: string, buf: Buffer) {
  const fields = fieldsFor(ctx, kind);
  const table = await readTable(buf, fileName);
  if (table.length < 2) throw bad('Plik nie zawiera danych (wymagany wiersz nagłówka i co najmniej jeden wiersz danych).');
  const headers = table[0].map((h) => h.trim());
  const rows = table.slice(1);
  const token = crypto.randomUUID();
  for (const [k, v] of pending) if (Date.now() - v.at > 3600_000) pending.delete(k);
  pending.set(token, { kind, fileName, headers, rows, at: Date.now() });
  const mapping: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of fields) {
    const cands = [f.label, f.key, ...(f.aliases ?? [])].map(norm);
    const idx = headers.findIndex((h, i) => !used.has(i) && cands.includes(norm(h)));
    if (idx >= 0) {
      mapping[f.key] = idx;
      used.add(idx);
    }
  }
  return { token, kind, file_name: fileName, headers, sample: rows.slice(0, 15), total: rows.length, fields, mapping };
}

interface RowResult {
  row: number;
  status: 'dodano' | 'zaktualizowano' | 'odrzucono';
  reason?: string;
  label?: string;
}

export interface FileImportOptions {
  create_dicts?: boolean;
  /** Nazwa źródła zapisywana przy rekordach (external_source). */
  source?: string;
}

export function runImport(ctx: Ctx, token: string, mapping: Record<string, number | null>, userId: number, dryRun: boolean, options: FileImportOptions = {}) {
  const p = pending.get(token);
  if (!p) throw bad('Sesja importu wygasła. Wgraj plik ponownie.');
  const fields = fieldsFor(ctx, p.kind);
  for (const f of fields) if (f.required && (mapping[f.key] == null || mapping[f.key]! < 0)) throw bad(`Wskaż kolumnę dla pola „${f.label}”.`);
  if ((p.kind === 'contacts' || p.kind === 'sales') && !['contractor_external_id', 'contractor_nip', 'contractor_name'].some((k) => mapping[k] != null && mapping[k]! >= 0))
    throw bad('Wskaż kolumnę identyfikującą kontrahenta (NIP, nazwa lub identyfikator).');
  const source = str(options.source) ?? DEFAULT_FILE_SOURCE;
  const opt: ImportOptions = { createDicts: options.create_dicts !== false, actorId: userId };
  const results: RowResult[] = [];
  const run = () => {
    for (const { rows, label, build, upsert } of fileRecords(ctx, p.kind, p.rows, mapping, source)) {
      let r: UpsertResult;
      try {
        const rec = build();
        r = typeof rec === 'string' ? { status: 'odrzucono', reason: rec } : upsert(ctx, rec, opt);
      } catch (e: any) {
        r = { status: 'odrzucono', reason: String(e?.message ?? e) };
      }
      for (const n of rows) results.push({ row: n, label, status: r.status, reason: r.status === 'odrzucono' ? r.reason : undefined });
    }
  };
  if (dryRun) {
    try {
      ctx.db.tx(() => {
        run();
        throw new DryRun();
      });
    } catch (e) {
      if (!(e instanceof DryRun)) throw e;
    }
  } else ctx.db.tx(run);
  results.sort((a, b) => a.row - b.row);
  const summary = {
    added: results.filter((r) => r.status === 'dodano').length,
    updated: results.filter((r) => r.status === 'zaktualizowano').length,
    rejected: results.filter((r) => r.status === 'odrzucono').length,
  };
  let log_id: number | null = null;
  if (!dryRun) {
    log_id = ctx.db.insert('import_logs', {
      kind: p.kind,
      file_name: p.fileName,
      ...summary,
      details: JSON.stringify(results.filter((r) => r.status === 'odrzucono').slice(0, 2000)),
      created_by: userId,
      created_at: nowIso(),
    });
    pending.delete(token);
  }
  return { ...summary, dry_run: dryRun, log_id, source, results: results.slice(0, 5000) };
}
class DryRun extends Error {}

interface PendingRecord {
  rows: number[];
  label: string;
  /** Zwraca rekord albo tekst błędu parsowania. */
  build: () => any;
  upsert: (ctx: Ctx, rec: any, opt: ImportOptions) => UpsertResult;
}

const YES = /^(tak|t|1|x|yes|prawda)$/i;

/** Zamienia wiersze pliku na znormalizowane rekordy dla warstwy importCore. */
export function fileRecords(ctx: Ctx, kind: string, rows: string[][], mapping: Record<string, number | null>, source: string): PendingRecord[] {
  const get = (row: string[], key: string): string | undefined => {
    const i = mapping[key];
    return i == null || i < 0 ? undefined : (row[i] ?? '').trim();
  };
  const opt = (row: string[], key: string) => {
    const v = get(row, key);
    return v === undefined ? undefined : str(v);
  };
  const num = (row: string[], key: string, label: string): number | null | undefined | Error => {
    const v = get(row, key);
    if (v === undefined) return undefined;
    if (v === '') return null;
    const n = parseNumberPl(v.replace('%', ''));
    return n == null ? new Error(`Niepoprawna wartość pola „${label}”: ${v}`) : n;
  };
  const ref = (row: string[]): ContractorRef => ({ external_id: opt(row, 'contractor_external_id'), nip: opt(row, 'contractor_nip'), name: opt(row, 'contractor_name') });
  const out: PendingRecord[] = [];
  if (kind === 'contractors') {
    const customDefs = ctx.db.all<any>("SELECT code, label, type FROM custom_fields WHERE entity = 'contractor' AND active = 1");
    const seenNip = new Map<string, number>();
    rows.forEach((row, i) => {
      const n = i + 2;
      out.push({
        rows: [n],
        label: get(row, 'name') ?? '',
        upsert: upsertContractor,
        build: (): ContractorRecord | string => {
          const nip = (get(row, 'nip') ?? '').replace(/\D/g, '');
          if (nip && seenNip.has(nip)) return `NIP ${nip} występuje w pliku wielokrotnie (wiersz ${seenNip.get(nip)}).`;
          if (nip) seenNip.set(nip, n);
          const lim = num(row, 'credit_limit', 'Limit kredytu');
          if (lim instanceof Error) return lim.message;
          const custom: Record<string, any> = {};
          for (const f of customDefs) {
            const v = get(row, `custom:${f.code}`);
            if (v === undefined || v === '') continue;
            if (f.type === 'number') {
              const x = parseNumberPl(v);
              if (x == null) return `Pole „${f.label}”: oczekiwano liczby, jest „${v}”.`;
              custom[f.code] = x;
            } else if (f.type === 'date') {
              const d = parseDatePl(v);
              if (!d) return `Pole „${f.label}”: niepoprawna data „${v}”.`;
              custom[f.code] = d;
            } else if (f.type === 'bool') custom[f.code] = YES.test(v);
            else custom[f.code] = v;
          }
          const isKey = get(row, 'is_key');
          return {
            source,
            external_id: opt(row, 'external_id'),
            name: get(row, 'name') ?? '',
            short_name: opt(row, 'short_name'),
            nip: opt(row, 'nip'),
            regon: opt(row, 'regon'),
            krs: opt(row, 'krs'),
            tax_office: opt(row, 'tax_office'),
            street: opt(row, 'street'),
            postal_code: opt(row, 'postal_code'),
            city: opt(row, 'city'),
            voivodeship: opt(row, 'voivodeship'),
            country: opt(row, 'country'),
            phone: opt(row, 'phone'),
            phone2: opt(row, 'phone2'),
            email: opt(row, 'email'),
            www: opt(row, 'www'),
            contract_no: opt(row, 'contract_no'),
            notes: opt(row, 'notes'),
            credit_limit: lim,
            is_key: isKey === undefined ? undefined : YES.test(isKey),
            type: opt(row, 'type'),
            status: opt(row, 'status'),
            group: opt(row, 'group'),
            subgroup: opt(row, 'subgroup'),
            price_group: opt(row, 'price_group'),
            source_of_contact: opt(row, 'source'),
            owner: opt(row, 'owner'),
            custom,
          };
        },
      });
    });
  } else if (kind === 'contacts') {
    rows.forEach((row, i) =>
      out.push({
        rows: [i + 2],
        label: [get(row, 'first_name'), get(row, 'last_name')].filter(Boolean).join(' '),
        upsert: upsertContact,
        build: (): ContactRecord => ({
          source,
          external_id: opt(row, 'external_id'),
          contractor: ref(row),
          first_name: opt(row, 'first_name'),
          last_name: get(row, 'last_name') ?? '',
          position: opt(row, 'position'),
          phone: opt(row, 'phone'),
          mobile: opt(row, 'mobile'),
          email: opt(row, 'email'),
          notes: opt(row, 'notes'),
        }),
      }),
    );
  } else if (kind === 'products') {
    rows.forEach((row, i) =>
      out.push({
        rows: [i + 2],
        label: get(row, 'name') ?? '',
        upsert: upsertProduct,
        build: (): ProductRecord | string => {
          const price = num(row, 'net_price', 'Cena netto');
          if (price instanceof Error) return price.message;
          const vatRaw = get(row, 'vat_rate');
          const vat = vatRaw && /^(zw|np|oo)/i.test(vatRaw) ? 0 : num(row, 'vat_rate', 'Stawka VAT');
          if (vat instanceof Error) return vat.message;
          return {
            source,
            external_id: opt(row, 'external_id'),
            name: get(row, 'name') ?? '',
            sku: opt(row, 'sku'),
            unit: opt(row, 'unit'),
            net_price: price,
            vat_rate: vat,
            ean: opt(row, 'ean'),
            product_group: opt(row, 'product_group'),
          };
        },
      }),
    );
  } else if (kind === 'sales') {
    // Wiersze z tym samym numerem dokumentu to pozycje jednej transakcji.
    const docs = new Map<string, { n: number; row: string[] }[]>();
    rows.forEach((row, i) => {
      const key = get(row, 'doc_number') || `__brak_${i}`;
      if (!docs.has(key)) docs.set(key, []);
      docs.get(key)!.push({ n: i + 2, row });
    });
    for (const [numKey, list] of docs) {
      const first = list[0].row;
      out.push({
        rows: list.map((l) => l.n),
        label: numKey.startsWith('__brak_') ? '' : numKey,
        upsert: upsertSale,
        build: (): SaleRecord | string => {
          if (numKey.startsWith('__brak_')) return 'Brak numeru dokumentu.';
          const date = parseDatePl(get(first, 'doc_date'));
          if (!date) return `Niepoprawna data dokumentu: ${get(first, 'doc_date') ?? ''}`;
          const items: SaleRecord["items"] = [];
          for (const { n, row } of list) {
            const name = opt(row, 'item_name');
            const sku = opt(row, 'product_sku');
            if (!name && !sku) continue;
            const qty = num(row, 'qty', 'Ilość');
            const price = num(row, 'net_price', 'Cena netto');
            const vat = num(row, 'vat_rate', 'Stawka VAT');
            for (const v of [qty, price, vat]) if (v instanceof Error) return `Wiersz ${n}: ${v.message}`;
            items.push({ name, product_sku: sku, qty: (qty as number | null) ?? 1, unit: opt(row, 'unit'), net_price: price as number | null, vat_rate: vat as number | null });
          }
          const net = num(first, 'net_total', 'Wartość netto');
          const gross = num(first, 'gross_total', 'Wartość brutto');
          if (net instanceof Error) return net.message;
          if (gross instanceof Error) return gross.message;
          return {
            source,
            external_id: opt(first, 'external_id'),
            doc_number: numKey,
            doc_date: date,
            contractor: ref(first),
            operator: opt(first, 'operator'),
            items,
            net_total: net,
            gross_total: gross,
          };
        },
      });
    }
  }
  return out;
}
