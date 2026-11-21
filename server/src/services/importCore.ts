// Warstwa importu niezależna od źródła danych.
// Przyjmuje znormalizowane rekordy (kontrahent, osoba kontaktowa, towar, transakcja sprzedaży)
// i zapisuje je w bazie, aktualizując istniejące rekordy po identyfikatorze zewnętrznym
// (para: nazwa źródła + id w systemie źródłowym), a dla kontrahentów zapasowo po NIP-ie.
// Źródłem jest dziś plik XLSX/CSV (importer.ts); kolejne źródła (np. enova365)
// mają tylko zbudować takie rekordy i wywołać funkcje z tego modułu.
import type { Ctx } from '../context.js';
import { isValidEmail, isValidNip, isValidRegon, normalizeNip, nowIso, round2 } from '../util.js';
import { fireEvent } from './tasks.js';

export interface ExternalRef {
  /** Nazwa systemu źródłowego, np. „plik XLSX”, „enova365”. */
  source: string;
  /** Identyfikator rekordu w systemie źródłowym (opcjonalny). */
  external_id?: string | null;
}

/** Wskazanie kontrahenta w rekordach zależnych (osoba, transakcja). */
export interface ContractorRef {
  external_id?: string | null;
  nip?: string | null;
  name?: string | null;
}

/** Pola, które w rekordzie nie występują (undefined), nie są zmieniane przy aktualizacji. */
export interface ContractorRecord extends ExternalRef {
  name: string;
  short_name?: string | null;
  nip?: string | null;
  regon?: string | null;
  krs?: string | null;
  tax_office?: string | null;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  voivodeship?: string | null;
  country?: string | null;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  www?: string | null;
  contract_no?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
  is_key?: boolean;
  /** Wartości słownikowe podawane nazwą. */
  type?: string | null;
  status?: string | null;
  group?: string | null;
  subgroup?: string | null;
  price_group?: string | null;
  source_of_contact?: string | null;
  /** Operator prowadzący: login lub imię i nazwisko. */
  owner?: string | null;
  custom?: Record<string, any>;
}

export interface ContactRecord extends ExternalRef {
  contractor: ContractorRef;
  first_name?: string | null;
  last_name: string;
  position?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface ProductRecord extends ExternalRef {
  name: string;
  sku?: string | null;
  unit?: string | null;
  net_price?: number | null;
  vat_rate?: number | null;
  ean?: string | null;
  product_group?: string | null;
}

export interface SaleItemRecord {
  name?: string | null;
  product_sku?: string | null;
  qty: number;
  unit?: string | null;
  net_price?: number | null;
  vat_rate?: number | null;
}

export interface SaleRecord extends ExternalRef {
  doc_number: string;
  doc_date: string; // RRRR-MM-DD
  contractor: ContractorRef;
  operator?: string | null;
  items: SaleItemRecord[];
  net_total?: number | null;
  gross_total?: number | null;
}

export type UpsertResult = { status: 'dodano' | 'zaktualizowano' } | { status: 'odrzucono'; reason: string };

export interface ImportOptions {
  /** Tworzyć brakujące pozycje słowników (typ, status, grupa…). Domyślnie tak. */
  createDicts?: boolean;
  actorId: number;
}

const reject = (reason: string): UpsertResult => ({ status: 'odrzucono', reason });

function dictId(ctx: Ctx, dict: string, name: string, create: boolean, parentId?: number | null): number | 'missing' {
  const r = ctx.db.get<{ id: number }>(
    `SELECT id FROM dict_items WHERE dict = ? AND lower(name) = lower(?)${parentId ? ' AND parent_id = ?' : ''}`,
    dict,
    name,
    ...(parentId ? [parentId] : []),
  );
  if (r) return r.id;
  if (!create) return 'missing';
  const max = ctx.db.get<{ m: number }>('SELECT COALESCE(MAX(sort), 0) AS m FROM dict_items WHERE dict = ?', dict)!.m;
  return ctx.db.insert('dict_items', { dict, name, parent_id: parentId ?? null, sort: max + 1 });
}

export function findOperator(ctx: Ctx, v: string): number | null {
  return ctx.db.get<{ id: number }>('SELECT id FROM operators WHERE lower(login) = lower(?) OR lower(name) = lower(?)', v, v)?.id ?? null;
}

function findByExternal(ctx: Ctx, table: string, ref: ExternalRef): number | null {
  if (!ref.external_id) return null;
  return ctx.db.get<{ id: number }>(`SELECT id FROM ${table} WHERE external_source = ? AND external_id = ?`, ref.source, ref.external_id)?.id ?? null;
}

/** Odnajduje kontrahenta: identyfikator zewnętrzny (w tym samym źródle) → NIP → nazwa. */
export function findContractor(ctx: Ctx, source: string, ref: ContractorRef): number | null {
  if (ref.external_id) {
    const id = findByExternal(ctx, 'contractors', { source, external_id: ref.external_id });
    if (id) return id;
  }
  const nip = normalizeNip(ref.nip);
  if (nip) {
    const r = ctx.db.get<{ id: number }>('SELECT id FROM contractors WHERE nip = ?', nip);
    if (r) return r.id;
  }
  if (ref.name) {
    const r = ctx.db.get<{ id: number }>('SELECT id FROM contractors WHERE lower(name) = lower(?) OR lower(short_name) = lower(?)', ref.name, ref.name);
    if (r) return r.id;
  }
  return null;
}

const DIRECT_FIELDS = ['name', 'short_name', 'krs', 'tax_office', 'street', 'postal_code', 'city', 'voivodeship', 'country', 'phone', 'phone2', 'www', 'contract_no', 'notes', 'credit_limit'] as const;

export function upsertContractor(ctx: Ctx, rec: ContractorRecord, opt: ImportOptions): UpsertResult {
  if (!rec.name?.trim()) return reject('Brak nazwy kontrahenta.');
  const nip = rec.nip ? normalizeNip(rec.nip) : '';
  if (rec.nip && !isValidNip(nip)) return reject(`Niepoprawny NIP: ${rec.nip}`);
  if (rec.regon && !isValidRegon(rec.regon)) return reject(`Niepoprawny REGON: ${rec.regon}`);
  if (rec.email && !isValidEmail(rec.email)) return reject(`Niepoprawny adres e-mail: ${rec.email}`);
  const data: Record<string, any> = {};
  for (const k of DIRECT_FIELDS) if (rec[k] !== undefined) data[k] = rec[k];
  if (rec.nip !== undefined) data.nip = nip || null;
  if (rec.regon !== undefined) data.regon = rec.regon ? rec.regon.replace(/\D/g, '') : null;
  if (rec.email !== undefined) data.email = rec.email;
  if (rec.is_key !== undefined) data.is_key = rec.is_key ? 1 : 0;
  if (data.voivodeship) data.voivodeship = String(data.voivodeship).toLowerCase();
  const create = opt.createDicts !== false;
  const dicts: Array<[keyof ContractorRecord, string, string]> = [
    ['type', 'contractor_type', 'type_id'],
    ['status', 'contractor_status', 'status_id'],
    ['group', 'contractor_group', 'group_id'],
    ['price_group', 'price_group', 'price_group_id'],
    ['source_of_contact', 'contact_source', 'source_id'],
  ];
  for (const [k, dict, col] of dicts) {
    const v = rec[k] as string | null | undefined;
    if (v === undefined) continue;
    if (!v) {
      data[col] = null;
      continue;
    }
    const id = dictId(ctx, dict, v, create);
    if (id === 'missing') return reject(`Wartość „${v}” nie występuje w słowniku.`);
    data[col] = id;
  }
  if (rec.subgroup !== undefined) {
    if (rec.subgroup) {
      if (!data.group_id) return reject('Podgrupa wymaga podania grupy.');
      const id = dictId(ctx, 'contractor_subgroup', rec.subgroup, create, data.group_id);
      if (id === 'missing') return reject(`Podgrupa „${rec.subgroup}” nie występuje w słowniku.`);
      data.subgroup_id = id;
    } else data.subgroup_id = null;
  }
  if (rec.owner !== undefined) {
    if (rec.owner) {
      const id = findOperator(ctx, rec.owner);
      if (!id) return reject(`Nie znaleziono operatora „${rec.owner}”.`);
      data.owner_id = id;
    } else data.owner_id = null;
  }
  // Klucz: id zewnętrzne w danym źródle; zapasowo NIP; bez obu — nazwa.
  let existing = findByExternal(ctx, 'contractors', rec);
  if (!existing && nip) existing = ctx.db.get<{ id: number }>('SELECT id FROM contractors WHERE nip = ?', nip)?.id ?? null;
  if (!existing && !nip && !rec.external_id) existing = ctx.db.get<{ id: number }>('SELECT id FROM contractors WHERE lower(name) = lower(?)', rec.name)?.id ?? null;
  const ext = { external_source: rec.source, external_id: rec.external_id ?? undefined };
  if (existing) {
    if (rec.custom && Object.keys(rec.custom).length) {
      const prev = JSON.parse(ctx.db.get<any>('SELECT custom FROM contractors WHERE id = ?', existing)?.custom || '{}');
      data.custom = JSON.stringify({ ...prev, ...rec.custom });
    }
    if (rec.external_id) Object.assign(data, ext);
    ctx.db.update('contractors', existing, { ...data, updated_at: nowIso(), updated_by: opt.actorId });
    return { status: 'zaktualizowano' };
  }
  const id = ctx.db.insert('contractors', {
    ...data,
    ...ext,
    external_source: rec.source,
    custom: rec.custom && Object.keys(rec.custom).length ? JSON.stringify(rec.custom) : null,
    country: data.country ?? 'Polska',
    created_at: nowIso(),
    created_by: opt.actorId,
  });
  fireEvent(ctx, 'contractor.created', { contractor_id: id, actor_id: opt.actorId });
  return { status: 'dodano' };
}

export function upsertContact(ctx: Ctx, rec: ContactRecord, _opt: ImportOptions): UpsertResult {
  if (!rec.last_name?.trim()) return reject('Brak nazwiska.');
  const cid = findContractor(ctx, rec.source, rec.contractor);
  if (!cid) return reject('Nie znaleziono kontrahenta w bazie (zaimportuj najpierw kontrahentów).');
  if (rec.email && !isValidEmail(rec.email)) return reject(`Niepoprawny adres e-mail: ${rec.email}`);
  const data: Record<string, any> = { contractor_id: cid, last_name: rec.last_name.trim() };
  for (const k of ['first_name', 'position', 'phone', 'mobile', 'email', 'notes'] as const) if (rec[k] !== undefined) data[k] = rec[k];
  let ex = findByExternal(ctx, 'contacts', rec);
  if (!ex && !rec.external_id)
    ex =
      ctx.db.get<{ id: number }>(
        `SELECT id FROM contacts WHERE contractor_id = ? AND ((email IS NOT NULL AND lower(email) = lower(?)) OR (lower(last_name) = lower(?) AND lower(COALESCE(first_name,'')) = lower(?)))`,
        cid,
        rec.email ?? '',
        rec.last_name,
        rec.first_name ?? '',
      )?.id ?? null;
  if (ex) {
    ctx.db.update('contacts', ex, data);
    return { status: 'zaktualizowano' };
  }
  ctx.db.insert('contacts', { ...data, external_source: rec.source, external_id: rec.external_id ?? null, created_at: nowIso() });
  return { status: 'dodano' };
}

export function upsertProduct(ctx: Ctx, rec: ProductRecord, _opt: ImportOptions): UpsertResult {
  if (!rec.name?.trim()) return reject('Brak nazwy towaru.');
  if (rec.net_price != null && (!Number.isFinite(rec.net_price) || rec.net_price < 0)) return reject('Niepoprawna cena netto.');
  if (rec.vat_rate != null && (!Number.isFinite(rec.vat_rate) || rec.vat_rate < 0 || rec.vat_rate > 100)) return reject('Niepoprawna stawka VAT.');
  const data: Record<string, any> = {};
  for (const k of ['name', 'sku', 'unit', 'net_price', 'vat_rate', 'ean', 'product_group'] as const) if (rec[k] !== undefined && rec[k] !== null) data[k] = rec[k];
  let ex = findByExternal(ctx, 'products', rec);
  if (!ex && rec.sku) ex = ctx.db.get<{ id: number }>('SELECT id FROM products WHERE sku = ?', rec.sku)?.id ?? null;
  if (ex) {
    if (rec.external_id) Object.assign(data, { external_source: rec.source, external_id: rec.external_id });
    ctx.db.update('products', ex, data);
    return { status: 'zaktualizowano' };
  }
  ctx.db.insert('products', { unit: 'szt.', ...data, external_source: rec.source, external_id: rec.external_id ?? null, created_at: nowIso() });
  return { status: 'dodano' };
}

export function upsertSale(ctx: Ctx, rec: SaleRecord, opt: ImportOptions): UpsertResult {
  if (!rec.doc_number?.trim()) return reject('Brak numeru dokumentu.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.doc_date ?? '')) return reject('Niepoprawna data dokumentu.');
  const cid = findContractor(ctx, rec.source, rec.contractor);
  if (!cid) return reject('Nie znaleziono kontrahenta w bazie.');
  let op: number | null = null;
  if (rec.operator) {
    op = findOperator(ctx, rec.operator);
    if (!op) return reject(`Nie znaleziono handlowca „${rec.operator}”.`);
  }
  const items: any[] = [];
  for (const it of rec.items) {
    const prod = it.product_sku ? ctx.db.get<any>('SELECT id, name, unit, net_price, vat_rate FROM products WHERE sku = ?', it.product_sku) : null;
    const np = it.net_price ?? prod?.net_price;
    const vat = it.vat_rate ?? prod?.vat_rate ?? 23;
    if (!Number.isFinite(it.qty) || np == null || !Number.isFinite(np)) return reject('Niepoprawna ilość lub cena pozycji.');
    const name = it.name || prod?.name;
    if (!name) return reject(`Nie znaleziono towaru o indeksie ${it.product_sku}.`);
    const net = round2(it.qty * np);
    items.push({ product_id: prod?.id ?? null, name, qty: it.qty, unit: it.unit || prod?.unit || 'szt.', net_price: np, vat_rate: vat, net_value: net, gross_value: round2(net * (1 + vat / 100)) });
  }
  const net = items.length ? round2(items.reduce((s, i) => s + i.net_value, 0)) : rec.net_total ?? null;
  if (net == null) return reject('Brak pozycji i wartości netto dokumentu.');
  const gross = items.length ? round2(items.reduce((s, i) => s + i.gross_value, 0)) : rec.gross_total ?? round2(net * 1.23);
  let ex = findByExternal(ctx, 'sales', rec);
  if (!ex) ex = ctx.db.get<{ id: number }>('SELECT id FROM sales WHERE doc_number = ? AND contractor_id = ?', rec.doc_number, cid)?.id ?? null;
  const data = {
    doc_number: rec.doc_number,
    doc_date: rec.doc_date,
    contractor_id: cid,
    operator_id: op,
    net_total: net,
    gross_total: gross,
    source: 'import',
    external_source: rec.source,
    external_id: rec.external_id ?? null,
  };
  let saleId: number;
  if (ex) {
    saleId = ex;
    ctx.db.update('sales', saleId, data);
    ctx.db.run('DELETE FROM sale_items WHERE sale_id = ?', saleId);
  } else saleId = ctx.db.insert('sales', { ...data, created_at: nowIso(), created_by: opt.actorId });
  items.forEach((it, idx) => ctx.db.insert('sale_items', { ...it, sale_id: saleId, sort: idx }));
  return { status: ex ? 'zaktualizowano' : 'dodano' };
}
