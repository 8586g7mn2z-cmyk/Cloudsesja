import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { activeDict, useApp } from '../lib/store';

// ---------- Okno dialogowe ----------
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 640,
  onSubmit,
  headExtra,
  className,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  onSubmit?: () => void;
  headExtra?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]):not([readonly]), select:not([disabled]), textarea');
    el?.focus();
  }, []);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <form
        ref={ref}
        className={`modal ${className ?? ''}`}
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          {headExtra}
          <button type="button" className="x" onClick={onClose} title="Zamknij (Esc)">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </form>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: ReactNode; count?: number | null }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button type="button" role="tab" key={t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count != null && <span className="cnt">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const Icon = kind === 'ok' ? CheckCircle2 : kind === 'info' ? Info : AlertTriangle;
  return (
    <div className={`notice ${kind}`}>
      <Icon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className={`progress ${value >= 100 ? 'done' : ''}`} title={`${value}%`}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Lbl({ children, req, htmlFor }: { children: ReactNode; req?: boolean; htmlFor?: string }) {
  return (
    <label className={`lbl ${req ? 'req' : ''}`} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };
export function Input({ invalid, className, ...p }: InputProps) {
  return <input {...p} value={p.value ?? ''} className={`input ${invalid ? 'invalid' : ''} ${className ?? ''}`} />;
}
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} value={p.value ?? ''} className={`textarea ${p.className ?? ''}`} />;
}
export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
  empty = '—',
  className,
  id,
  disabled,
  invalid,
}: {
  value: any;
  onChange: (v: any) => void;
  options: { value: any; label: string }[];
  empty?: string | null;
  className?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <select id={id} disabled={disabled} className={`select ${invalid ? 'invalid' : ''} ${className ?? ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}>
      {empty !== null && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DictSelect({ dict, value, onChange, parentId, empty = '—', id }: { dict: string; value: any; onChange: (v: number | null) => void; parentId?: number | null; empty?: string; id?: string }) {
  const { dicts } = useApp();
  let items = activeDict(dicts, dict, value);
  if (parentId !== undefined) items = items.filter((i) => i.parent_id === parentId);
  return <Select id={id} value={value} onChange={onChange} empty={empty} options={items.map((i) => ({ value: i.id, label: i.name }))} />;
}

export function OperatorSelect({ value, onChange, empty = '—', id, onlyActive = true }: { value: any; onChange: (v: number | null) => void; empty?: string | null; id?: string; onlyActive?: boolean }) {
  const { operators } = useApp();
  return <Select id={id} value={value} onChange={onChange} empty={empty} options={operators.filter((o) => !onlyActive || o.active || o.id === value).map((o) => ({ value: o.id, label: o.name }))} />;
}

export function MultiOperator({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { operators } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const names = operators.filter((o) => value.includes(o.id)).map((o) => o.name);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="select" style={{ textAlign: 'left' }} onClick={() => setOpen(!open)}>
        <span className="ellipsis" style={{ display: 'block' }}>{names.length ? names.join(', ') : 'wybierz operatorów…'}</span>
      </button>
      {open && (
        <div className="popover" style={{ top: 30, left: 0, right: 0 }}>
          {operators
            .filter((o) => o.active)
            .map((o) => (
              <Check key={o.id} checked={value.includes(o.id)} onChange={(c) => onChange(c ? [...value, o.id] : value.filter((x) => x !== o.id))}>
                {o.name}
              </Check>
            ))}
        </div>
      )}
    </div>
  );
}

export function useOutside(ref: React.RefObject<HTMLElement | null>, fn: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fn();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, fn]);
}

export interface ComboItem {
  id: number;
  label: string;
  sub?: string;
  search?: string;
}
/** Pole wyboru z wyszukiwaniem (kontrahent, towar, projekt…). */
export function Combo({ items, value, onChange, placeholder = 'wpisz, aby wyszukać…', id, invalid, disabled }: { items: ComboItem[]; value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; id?: string; invalid?: boolean; disabled?: boolean }) {
  const sel = items.find((i) => i.id === value);
  const [q, setQ] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setQ(null));
  const list = useMemo(() => {
    if (q === null) return [];
    const s = q.toLowerCase().trim();
    const f = s ? items.filter((i) => (i.search ?? `${i.label} ${i.sub ?? ''}`).toLowerCase().includes(s)) : items;
    return f.slice(0, 50);
  }, [q, items]);
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        <input
          id={id}
          disabled={disabled}
          className={`input ${invalid ? 'invalid' : ''}`}
          placeholder={placeholder}
          value={q ?? sel?.label ?? ''}
          onFocus={() => setQ(q ?? '')}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
          }}
          onKeyDown={(e) => {
            if (q === null) return;
            if (e.key === 'ArrowDown') (e.preventDefault(), setHi(Math.min(list.length - 1, hi + 1)));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setHi(Math.max(0, hi - 1)));
            else if (e.key === 'Enter' && list[hi]) {
              e.preventDefault();
              onChange(list[hi].id);
              setQ(null);
            } else if (e.key === 'Escape' && q !== null) {
              e.stopPropagation();
              setQ(null);
            }
          }}
        />
        {value && !disabled ? (
          <button type="button" className="btn icon" title="Wyczyść" onClick={() => onChange(null)}>
            <X size={13} />
          </button>
        ) : null}
      </div>
      {q !== null && (
        <div className="popover" style={{ top: 30, left: 0, right: 0, padding: 0 }}>
          {list.length === 0 && <div className="muted" style={{ padding: 8 }}>Brak wyników</div>}
          {list.map((i, idx) => (
            <div
              key={i.id}
              style={{ padding: '4px 8px', cursor: 'pointer', background: idx === hi ? 'var(--bg-hover)' : undefined, borderBottom: '1px solid var(--line)' }}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(i.id);
                setQ(null);
              }}
            >
              <div>{i.label}</div>
              {i.sub && <div className="xs muted">{i.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContractorPicker({ value, onChange, id, invalid, exclude }: { value: number | null | undefined; onChange: (v: number | null) => void; id?: string; invalid?: boolean; exclude?: number }) {
  const { contractors } = useApp();
  const items = useMemo(
    () =>
      contractors
        .filter((c) => c.id !== exclude && (c.active || c.id === value))
        .map((c) => ({ id: c.id, label: c.name, sub: [c.short_name, c.city, c.nip ? `NIP ${c.nip}` : ''].filter(Boolean).join(' · '), search: `${c.name} ${c.short_name ?? ''} ${c.nip ?? ''} ${c.city ?? ''} ${c.phone ?? ''} ${c.email ?? ''}` })),
    [contractors, exclude, value],
  );
  return <Combo id={id} items={items} value={value} onChange={onChange} invalid={invalid} placeholder="wyszukaj kontrahenta (nazwa, NIP, miasto)…" />;
}

export function Pill({ kind, children, title }: { kind?: 'ok' | 'warn' | 'danger' | 'navy'; children: ReactNode; title?: string }) {
  return (
    <span className={`pill ${kind ?? ''}`} title={title}>
      {children}
    </span>
  );
}

export function StatusDot({ color }: { color?: string | null }) {
  return <span className="dot" style={{ background: color ?? 'var(--line-strong)' }} />;
}

export function Loading({ text = 'Wczytywanie…' }: { text?: string }) {
  return <div className="loading">{text}</div>;
}
export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="pad">
      <Notice kind="error">
        {error}{' '}
        {onRetry && (
          <button className="btn sm" type="button" onClick={onRetry}>
            Spróbuj ponownie
          </button>
        )}
      </Notice>
    </div>
  );
}

/** Ustawia stan formularza: f('pole')(wartość). */
export function useForm<T extends Record<string, any>>(initial: T) {
  const [v, setV] = useState<T>(initial);
  const set = (k: keyof T) => (val: any) => setV((p) => ({ ...p, [k]: val?.target ? (val.target.type === 'checkbox' ? val.target.checked : val.target.value) : val }));
  return { v, setV, set };
}
