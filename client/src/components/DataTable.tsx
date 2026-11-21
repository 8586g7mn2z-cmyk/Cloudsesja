// Uniwersalny rejestr: filtrowanie, sortowanie, wybór kolumn, grupowanie wielopoziomowe
// z licznikami i sumami, wirtualizacja wierszy, eksport CSV/XLSX i wydruk.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, Download, FileSpreadsheet, Filter, Printer, Search, X, Layers } from 'lucide-react';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, fmtDuration, fmtMinutes } from '../lib/format';
import { download, saveBlob } from '../lib/api';
import { useLocalState } from '../lib/hooks';
import { useApp } from '../lib/store';
import { useOutside, Loading, ErrorBox } from './ui';

export type ColType = 'text' | 'number' | 'int' | 'money' | 'date' | 'datetime' | 'bool' | 'percent' | 'duration' | 'minutes';

export interface Column<T = any> {
  key: string;
  label: string;
  type?: ColType;
  width?: number;
  value?: (row: T) => any;
  render?: (row: T) => ReactNode;
  sum?: boolean;
  hidden?: boolean;
  filter?: 'text' | 'select' | 'none';
  align?: 'left' | 'right' | 'center';
  /** Etykieta wartości w nagłówku grupy. */
  groupText?: (v: any) => string;
}

export interface DataTableProps<T> {
  id: string;
  title: string;
  columns: Column<T>[];
  rows: T[] | null;
  rowKey?: (r: T) => number | string;
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
  onOpen?: (r: T) => void;
  onSelect?: (r: T | null) => void;
  selectedKey?: number | string | null;
  toolbar?: ReactNode;
  filters?: ReactNode;
  defaultGroup?: string[];
  defaultSort?: { key: string; dir: 1 | -1 }[];
  searchText?: (r: T) => string;
  rowClass?: (r: T) => string;
  emptyText?: string;
  compact?: boolean;
  /** Wywoływane po każdej zmianie wyniku filtrowania (np. do wysyłki seryjnej). */
  onFiltered?: (rows: T[]) => void;
}

const NUMERIC: ColType[] = ['number', 'int', 'money', 'percent', 'duration', 'minutes'];
const isNumeric = (t?: ColType) => NUMERIC.includes(t ?? 'text');

export function rawValue<T>(c: Column<T>, r: T): any {
  return c.value ? c.value(r) : (r as any)[c.key];
}
export function fmtValue(type: ColType | undefined, v: any): string {
  if (v === null || v === undefined || v === '') return '';
  switch (type) {
    case 'money':
      return fmtMoney(v);
    case 'number':
      return fmtNumber(v);
    case 'int':
      return String(v);
    case 'percent':
      return `${fmtNumber(v, 1)}%`;
    case 'date':
      return fmtDate(String(v));
    case 'datetime':
      return fmtDateTime(String(v));
    case 'bool':
      return v ? 'tak' : 'nie';
    case 'duration':
      return fmtDuration(v);
    case 'minutes':
      return fmtMinutes(v);
    default:
      return String(v);
  }
}
function cmp(a: any, b: any): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'pl', { numeric: true, sensitivity: 'base' });
}
/** Filtr kolumny: tekst zawiera; dla liczb także >, <, >=, <=, =. */
function matchFilter(type: ColType | undefined, raw: any, text: string, f: string): boolean {
  const q = f.trim().toLowerCase();
  if (!q) return true;
  if (isNumeric(type)) {
    const m = /^(>=|<=|>|<|=)\s*(-?[\d\s.,]+)$/.exec(q);
    if (m) {
      const n = Number(m[2].replace(/\s/g, '').replace(',', '.'));
      const v = Number(raw);
      if (raw === null || raw === undefined || raw === '' || isNaN(v)) return false;
      return m[1] === '>' ? v > n : m[1] === '<' ? v < n : m[1] === '>=' ? v >= n : m[1] === '<=' ? v <= n : v === n;
    }
  }
  if (q === '(puste)') return text === '';
  return text.toLowerCase().includes(q);
}

type DisplayRow<T> =
  | { kind: 'group'; key: string; level: number; label: string; colLabel: string; count: number; sums: Record<string, number> }
  | { kind: 'row'; row: T; level: number };

interface Persist {
  hidden: string[];
  shown: string[];
  widths: Record<string, number>;
  groupBy: string[];
  sort: { key: string; dir: 1 | -1 }[];
  showFilters: boolean;
}

const ROW_H = 26;

export function DataTable<T>(p: DataTableProps<T>) {
  const { toast } = useApp();
  const rowKey = p.rowKey ?? ((r: any) => r.id);
  const [st, setSt] = useLocalState<Persist>(`dt:${p.id}`, {
    hidden: [],
    shown: [],
    widths: {},
    groupBy: p.defaultGroup ?? [],
    sort: p.defaultSort ?? [],
    showFilters: true,
  });
  const [quick, setQuick] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [colsOpen, setColsOpen] = useState<DOMRect | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  useOutside(colsRef, () => setColsOpen(null));

  const allCols = p.columns;
  const visible = useMemo(
    () => allCols.filter((c) => (c.hidden ? st.shown.includes(c.key) : !st.hidden.includes(c.key))),
    [allCols, st.hidden, st.shown],
  );
  const width = (c: Column<T>) => st.widths[c.key] ?? c.width ?? (isNumeric(c.type) ? 100 : 150);
  const groupBy = st.groupBy.filter((k) => allCols.some((c) => c.key === k));
  const colByKey = useMemo(() => new Map(allCols.map((c) => [c.key, c])), [allCols]);

  // Wartości sformatowane (do filtrów i wyszukiwania) liczone raz na wiersz.
  const prepared = useMemo(() => {
    const rows = p.rows ?? [];
    return rows.map((r) => {
      const texts: Record<string, string> = {};
      for (const c of allCols) texts[c.key] = fmtValue(c.type, rawValue(c, r));
      return { r, texts, search: (Object.values(texts).join(' ') + ' ' + (p.searchText?.(r) ?? '')).toLowerCase() };
    });
  }, [p.rows, allCols, p.searchText]);

  const filtered = useMemo(() => {
    const q = quick.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    const active = Object.entries(colFilters).filter(([, v]) => v.trim());
    return prepared.filter((x) => {
      if (terms.length && !terms.every((t) => x.search.includes(t))) return false;
      for (const [k, f] of active) {
        const c = colByKey.get(k);
        if (!c) continue;
        if (c.filter === 'select') {
          if (x.texts[k] !== f) return false;
        } else if (!matchFilter(c.type, rawValue(c, x.r), x.texts[k], f)) return false;
      }
      return true;
    });
  }, [prepared, quick, colFilters, colByKey]);

  const sorted = useMemo(() => {
    const keys = [...groupBy.map((k) => ({ key: k, dir: (st.sort.find((s) => s.key === k)?.dir ?? 1) as 1 | -1 })), ...st.sort.filter((s) => !groupBy.includes(s.key))];
    if (!keys.length) return filtered;
    const cols = keys.map((k) => ({ c: colByKey.get(k.key)!, dir: k.dir })).filter((x) => x.c);
    return [...filtered].sort((a, b) => {
      for (const { c, dir } of cols) {
        const d = cmp(rawValue(c, a.r), rawValue(c, b.r));
        if (d) return d * dir;
      }
      return 0;
    });
  }, [filtered, st.sort, groupBy, colByKey]);

  const sumCols = visible.filter((c) => c.sum);
  useEffect(() => {
    p.onFiltered?.(sorted.map((x) => x.r));
  }, [sorted]);

  const display = useMemo<DisplayRow<T>[]>(() => {
    if (!groupBy.length) return sorted.map((x) => ({ kind: 'row', row: x.r, level: 0 }));
    const out: DisplayRow<T>[] = [];
    const build = (items: typeof sorted, level: number, prefix: string) => {
      const c = colByKey.get(groupBy[level])!;
      const groups = new Map<string, typeof sorted>();
      for (const it of items) {
        const t = it.texts[c.key];
        const g = groups.get(t);
        if (g) g.push(it);
        else groups.set(t, [it]);
      }
      for (const [t, list] of groups) {
        const key = `${prefix}|${c.key}=${t}`;
        const sums: Record<string, number> = {};
        for (const sc of sumCols) sums[sc.key] = list.reduce((s, x) => s + (Number(rawValue(sc, x.r)) || 0), 0);
        out.push({ kind: 'group', key, level, label: c.groupText ? c.groupText(rawValue(c, list[0].r)) : t || '(brak)', colLabel: c.label, count: list.length, sums });
        if (collapsed.has(key)) continue;
        if (level + 1 < groupBy.length) build(list, level + 1, key);
        else for (const x of list) out.push({ kind: 'row', row: x.r, level: level + 1 });
      }
    };
    build(sorted, 0, '');
    return out;
  }, [sorted, groupBy, collapsed, colByKey, sumCols]);

  const totalW = visible.reduce((s, c) => s + width(c), 0) + groupBy.length * 18;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 10);
  const end = Math.min(display.length, Math.ceil((scrollTop + viewH) / ROW_H) + 10);

  const selIndex = display.findIndex((d) => d.kind === 'row' && rowKey(d.row) === p.selectedKey);
  const moveSel = (delta: number) => {
    let i = selIndex;
    for (let n = 0; n < display.length; n++) {
      i += delta;
      if (i < 0 || i >= display.length) return;
      const d = display[i];
      if (d.kind === 'row') {
        p.onSelect?.(d.row);
        const el = scrollRef.current;
        if (el) {
          const top = i * ROW_H;
          const headH = st.showFilters ? 56 : 28;
          if (top < el.scrollTop) el.scrollTop = top;
          else if (top + ROW_H > el.scrollTop + el.clientHeight - headH - 26) el.scrollTop = top + ROW_H - el.clientHeight + headH + 26;
        }
        return;
      }
    }
  };

  const toggleSort = (key: string, add: boolean) => {
    setSt((s) => {
      const cur = s.sort.find((x) => x.key === key);
      let next = add ? [...s.sort] : s.sort.filter((x) => x.key === key);
      if (!cur) next = [...next.filter((x) => x.key !== key), { key, dir: 1 }];
      else if (cur.dir === 1) next = next.map((x) => (x.key === key ? { ...x, dir: -1 as const } : x));
      else next = next.filter((x) => x.key !== key);
      return { ...s, sort: next };
    });
  };
  const addGroup = (key: string) => setSt((s) => ({ ...s, groupBy: s.groupBy.includes(key) ? s.groupBy : [...s.groupBy, key] }));
  const removeGroup = (key: string) => setSt((s) => ({ ...s, groupBy: s.groupBy.filter((k) => k !== key) }));
  const moveGroup = (key: string, d: number) =>
    setSt((s) => {
      const g = [...s.groupBy];
      const i = g.indexOf(key);
      const j = i + d;
      if (i < 0 || j < 0 || j >= g.length) return s;
      [g[i], g[j]] = [g[j], g[i]];
      return { ...s, groupBy: g };
    });
  const toggleCol = (c: Column<T>, show: boolean) =>
    setSt((s) =>
      c.hidden
        ? { ...s, shown: show ? [...s.shown, c.key] : s.shown.filter((k) => k !== c.key) }
        : { ...s, hidden: show ? s.hidden.filter((k) => k !== c.key) : [...s.hidden, c.key] },
    );

  const startResize = (e: React.MouseEvent, c: Column<T>) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = width(c);
    const mv = (ev: MouseEvent) => setSt((s) => ({ ...s, widths: { ...s.widths, [c.key]: Math.max(40, w0 + ev.clientX - x0) } }));
    const up = () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };

  const allGroupKeys = useCallback(() => {
    const keys: string[] = [];
    const walk = (items: typeof sorted, level: number, prefix: string) => {
      const c = colByKey.get(groupBy[level])!;
      const groups = new Map<string, typeof sorted>();
      for (const it of items) (groups.get(it.texts[c.key]) ?? groups.set(it.texts[c.key], []).get(it.texts[c.key])!).push(it);
      for (const [t, list] of groups) {
        const key = `${prefix}|${c.key}=${t}`;
        keys.push(key);
        if (level + 1 < groupBy.length) walk(list, level + 1, key);
      }
    };
    if (groupBy.length) walk(sorted, 0, '');
    return keys;
  }, [sorted, groupBy, colByKey]);

  // ---------- eksport ----------
  const exportCols = visible;
  const exportRows = () => sorted.map((x) => exportCols.map((c) => (isNumeric(c.type) ? (rawValue(c, x.r) === '' || rawValue(c, x.r) == null ? null : Number(rawValue(c, x.r))) : x.texts[c.key])));
  const exportCsv = () => {
    const esc = (v: any) => {
      let s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      // tekst wyglądający jak formuła (np. „=HYPERLINK(…)”) nie może wykonać się w arkuszu; numery telefonów zostają bez zmian
      if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s) && !/^[+\-]?[\d\s().,-]+$/.test(s)) s = `'${s}`;
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [exportCols.map((c) => esc(c.label)).join(';'), ...exportRows().map((r) => r.map(esc).join(';'))];
    saveBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${p.title}.csv`);
  };
  const exportXlsx = async () => {
    try {
      await download('/api/export/xlsx', { title: p.title, columns: exportCols.map((c) => ({ label: c.label, type: c.type })), rows: exportRows() }, `${p.title}.xlsx`);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return toast('Przeglądarka zablokowała okno wydruku.', 'warn');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const head = exportCols.map((c) => `<th style="text-align:${isNumeric(c.type) ? 'right' : 'left'}">${esc(c.label)}</th>`).join('');
    const prepMap = new Map(sorted.map((x) => [x.r, x.texts]));
    const body = (groupBy.length ? display : sorted.map((x) => ({ kind: 'row', row: x.r, level: 0 }) as DisplayRow<T>))
      .map((d) =>
        d.kind === 'group'
          ? `<tr class="g"><td colspan="${exportCols.length}" style="padding-left:${6 + d.level * 14}px">${esc(d.colLabel)}: <b>${esc(d.label)}</b> — ilość: ${d.count}${sumCols.map((c) => `; ${esc(c.label)}: ${esc(fmtValue(c.type, d.sums[c.key]))}`).join('')}</td></tr>`
          : `<tr>${exportCols.map((c) => `<td style="text-align:${isNumeric(c.type) ? 'right' : 'left'}">${esc(prepMap.get(d.row)?.[c.key] ?? '')}</td>`).join('')}</tr>`,
      )
      .join('');
    const foot = sumCols.length ? `<tr class="f">${exportCols.map((c) => `<td style="text-align:right">${c.sum ? esc(fmtValue(c.type, sorted.reduce((s, x) => s + (Number(rawValue(c, x.r)) || 0), 0))) : ''}</td>`).join('')}</tr>` : '';
    w.document.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(p.title)}</title><style>
      body{font-family:Arial,sans-serif;font-size:10px;margin:16px;color:#111}h1{font-size:14px;margin:0 0 2px;color:#1b2f5b}
      .m{color:#666;margin-bottom:8px}table{border-collapse:collapse;width:100%}th{background:#e9edf4;border-bottom:1px solid #999;padding:3px 4px}
      td{border-bottom:1px solid #ddd;padding:2px 4px}tr.g td{background:#f1f3f7;font-weight:normal}tr.f td{font-weight:bold;border-top:1px solid #666}
      @page{size:landscape;margin:12mm}</style></head><body><h1>${esc(p.title)}</h1>
      <div class="m">DIAGNOS · rekordów: ${sorted.length}${groupBy.length ? ' · grupowanie: ' + groupBy.map((k) => esc(colByKey.get(k)?.label ?? k)).join(' → ') : ''} · wydruk ${new Date().toLocaleString('pl-PL')}</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const distinct = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of visible) if (c.filter === 'select') m[c.key] = [...new Set(prepared.map((x) => x.texts[c.key]))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pl'));
    return m;
  }, [visible, prepared]);

  useEffect(() => {
    if (scrollRef.current && scrollTop > display.length * ROW_H) scrollRef.current.scrollTop = 0;
  }, [display.length]);

  const activeFilters = Object.values(colFilters).filter((v) => v.trim()).length + (quick ? 1 : 0);
  const indent = groupBy.length * 18;

  return (
    <div className="dt">
      <div className="dt-toolbar">
        {p.toolbar}
        <div className="grow" />
        <div style={{ position: 'relative' }} className="quick">
          <Search size={13} style={{ position: 'absolute', left: 7, top: 8, color: 'var(--text-3)' }} />
          <input className="input" style={{ paddingLeft: 24 }} placeholder="Szukaj w rejestrze…" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Szukaj w rejestrze" />
        </div>
        {activeFilters > 0 && (
          <button
            className="btn sm"
            type="button"
            onClick={() => {
              setQuick('');
              setColFilters({});
            }}
            title="Wyczyść filtry"
          >
            <X size={13} /> Wyczyść filtry ({activeFilters})
          </button>
        )}
        <button type="button" className={`btn icon ${st.showFilters ? 'active' : ''}`} title="Wiersz filtrów pod nagłówkiem" onClick={() => setSt((s) => ({ ...s, showFilters: !s.showFilters }))}>
          <Filter size={14} />
        </button>
        <div ref={colsRef} style={{ position: 'relative' }}>
          <button type="button" className="btn icon" title="Widoczne kolumny" onClick={(e) => setColsOpen(colsOpen ? null : e.currentTarget.getBoundingClientRect())}>
            <Columns3 size={14} />
          </button>
          {colsOpen && (
            <div className="popover" style={{ position: 'fixed', top: colsOpen.bottom + 4, right: Math.max(8, window.innerWidth - colsOpen.right) }}>
              <div className="xs muted" style={{ padding: '2px 4px 6px' }}>
                Widoczne kolumny
              </div>
              {allCols.map((c) => (
                <label key={c.key} className="check">
                  <input type="checkbox" checked={visible.includes(c)} onChange={(e) => toggleCol(c, e.target.checked)} />
                  {c.label}
                </label>
              ))}
              <button type="button" className="btn sm mt8" onClick={() => setSt((s) => ({ ...s, hidden: [], shown: [], widths: {} }))}>
                Przywróć układ domyślny
              </button>
            </div>
          )}
        </div>
        <button type="button" className="btn icon" title="Eksport do XLSX" onClick={exportXlsx}>
          <FileSpreadsheet size={14} />
        </button>
        <button type="button" className="btn icon" title="Eksport do CSV" onClick={exportCsv}>
          <Download size={14} />
        </button>
        <button type="button" className="btn icon" title="Wydruk" onClick={print}>
          <Printer size={14} />
        </button>
      </div>
      {p.filters && <div className="dt-filters">{p.filters}</div>}
      <div
        className={`dt-group-panel ${dropActive ? 'drop' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/dt-col')) {
            e.preventDefault();
            setDropActive(true);
          }
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          const k = e.dataTransfer.getData('text/dt-col');
          setDropActive(false);
          if (k) addGroup(k);
        }}
      >
        <Layers size={13} />
        {groupBy.length === 0 && <span>Przeciągnij tu nagłówek kolumny, aby pogrupować dane, lub wybierz:</span>}
        {groupBy.map((k, i) => (
          <span className="chip" key={k}>
            {i > 0 && <span className="muted">→ </span>}
            {colByKey.get(k)?.label}
            {i > 0 && (
              <button type="button" title="Wyżej" onClick={() => moveGroup(k, -1)}>
                <ArrowUp size={11} />
              </button>
            )}
            <button type="button" title="Usuń grupowanie" onClick={() => removeGroup(k)}>
              <X size={12} />
            </button>
          </span>
        ))}
        <select className="select" style={{ width: 170, height: 22, fontSize: 12 }} value="" onChange={(e) => e.target.value && addGroup(e.target.value)} aria-label="Grupuj według">
          <option value="">+ grupuj według…</option>
          {allCols
            .filter((c) => !groupBy.includes(c.key))
            .map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
        </select>
        {groupBy.length > 0 && (
          <>
            <button type="button" className="btn sm ghost" onClick={() => setCollapsed(new Set())}>
              Rozwiń wszystko
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setCollapsed(new Set(allGroupKeys()))}>
              Zwiń wszystko
            </button>
          </>
        )}
      </div>
      {p.error ? (
        <ErrorBox error={p.error} onRetry={p.onReload} />
      ) : (
        <div
          className="dt-scroll"
          ref={scrollRef}
          tabIndex={0}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
            if (e.key === 'ArrowDown') (e.preventDefault(), moveSel(1));
            else if (e.key === 'ArrowUp') (e.preventDefault(), moveSel(-1));
            else if (e.key === 'Enter' && selIndex >= 0) {
              const d = display[selIndex];
              if (d.kind === 'row') p.onOpen?.(d.row);
            }
          }}
        >
          <div style={{ width: Math.max(totalW, 100), minWidth: '100%' }}>
            <div className="dt-head">
              <div className="dt-hrow">
                {indent > 0 && <div className="dt-hcell" style={{ width: indent }} />}
                {visible.map((c) => {
                  const s = st.sort.findIndex((x) => x.key === c.key);
                  const dir = s >= 0 ? st.sort[s].dir : 0;
                  return (
                    <div
                      key={c.key}
                      className={`dt-hcell ${isNumeric(c.type) ? 'right' : ''}`}
                      style={{ width: width(c) }}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/dt-col', c.key)}
                      onClick={(e) => toggleSort(c.key, e.shiftKey)}
                      title={`${c.label} — kliknij, aby sortować (Shift: sortowanie wielopoziomowe); przeciągnij do panelu grupowania`}
                    >
                      <span className="lbl">{c.label}</span>
                      {dir === 1 && <ArrowUp size={11} />}
                      {dir === -1 && <ArrowDown size={11} />}
                      {dir !== 0 && st.sort.length > 1 && <span className="sortn">{s + 1}</span>}
                      <span className="rs" onMouseDown={(e) => startResize(e, c)} onClick={(e) => e.stopPropagation()} />
                    </div>
                  );
                })}
              </div>
              {st.showFilters && (
                <div className="dt-frow">
                  {indent > 0 && <div className="dt-fcell" style={{ width: indent }} />}
                  {visible.map((c) => (
                    <div key={c.key} className={`dt-fcell ${colFilters[c.key] ? 'active' : ''}`} style={{ width: width(c) }}>
                      {c.filter === 'none' ? null : c.filter === 'select' ? (
                        <select value={colFilters[c.key] ?? ''} onChange={(e) => setColFilters((f) => ({ ...f, [c.key]: e.target.value }))} aria-label={`Filtr: ${c.label}`}>
                          <option value="">(wszystkie)</option>
                          {(distinct[c.key] ?? []).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={colFilters[c.key] ?? ''}
                          placeholder={isNumeric(c.type) ? '>, <, =' : ''}
                          onChange={(e) => setColFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                          aria-label={`Filtr: ${c.label}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {p.loading && !p.rows ? (
              <Loading />
            ) : display.length === 0 ? (
              <div className="empty">{(p.rows?.length ?? 0) === 0 ? p.emptyText ?? 'Brak rekordów.' : 'Żaden rekord nie spełnia warunków filtra.'}</div>
            ) : (
              <div className="dt-body" style={{ height: display.length * ROW_H }}>
                {display.slice(start, end).map((d, i) => {
                  const top = (start + i) * ROW_H;
                  if (d.kind === 'group') {
                    const isColl = collapsed.has(d.key);
                    return (
                      <div
                        key={d.key}
                        className="dt-grow"
                        style={{ top, width: Math.max(totalW, scrollRef.current?.clientWidth ?? 0) }}
                        onClick={() =>
                          setCollapsed((s) => {
                            const n = new Set(s);
                            if (n.has(d.key)) n.delete(d.key);
                            else n.add(d.key);
                            return n;
                          })
                        }
                      >
                        <div className="gl" style={{ paddingLeft: 4 + d.level * 18 }}>
                          {isColl ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          <span className="muted">{d.colLabel}:</span> <b>{d.label}</b> <span className="muted">ilość: {d.count}</span>
                          {sumCols.map((c) => (
                            <span key={c.key} className="muted">
                              · {c.label}: <b style={{ color: 'var(--text)' }}>{fmtValue(c.type, d.sums[c.key])}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  const k = rowKey(d.row);
                  return (
                    <div
                      key={k}
                      className={`dt-row ${k === p.selectedKey ? 'sel' : ''} ${p.rowClass?.(d.row) ?? ''}`}
                      style={{ top, width: totalW }}
                      onClick={() => p.onSelect?.(d.row)}
                      onDoubleClick={() => p.onOpen?.(d.row)}
                    >
                      {indent > 0 && <div className="dt-cell" style={{ width: indent }} />}
                      {visible.map((c) => {
                        const v = rawValue(c, d.row);
                        return (
                          <div key={c.key} className={`dt-cell ${isNumeric(c.type) || c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : ''}`} style={{ width: width(c) }}>
                            {c.render ? c.render(d.row) : <span className="v" title={fmtValue(c.type, v)}>{fmtValue(c.type, v)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
            {sumCols.length > 0 && display.length > 0 && (
              <div className="dt-foot">
                {indent > 0 && <div className="dt-cell" style={{ width: indent }} />}
                {visible.map((c) => (
                  <div key={c.key} className="dt-cell right" style={{ width: width(c) }}>
                    {c.sum ? fmtValue(c.type, sorted.reduce((s, x) => s + (Number(rawValue(c, x.r)) || 0), 0)) : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="dt-status">
        <span>
          Rekordów: <b>{sorted.length}</b>
          {sorted.length !== (p.rows?.length ?? 0) && <> / {p.rows?.length ?? 0}</>}
        </span>
        {p.loading && p.rows && <span>odświeżanie…</span>}
        {groupBy.length > 0 && <span>Grupowanie: {groupBy.map((k) => colByKey.get(k)?.label).join(' → ')}</span>}
      </div>
    </div>
  );
}
