import { ConfirmDialog } from '../components/ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { get } from './api';

export interface User {
  id: number;
  login: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'kierownik' | 'handlowiec';
  manager_id: number | null;
  must_change_password: number;
  departments: number[];
}
export interface DictItem {
  id: number;
  dict: string;
  name: string;
  code: string | null;
  parent_id: number | null;
  color: string | null;
  sort: number;
  active: number;
  system: number;
}
export interface Operator {
  id: number;
  login: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  manager_id: number | null;
  active: number;
  departments: number[];
}
export interface ContractorLite {
  id: number;
  name: string;
  short_name: string | null;
  nip: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  owner_id: number | null;
  active: number;
}

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error' | 'warn' | 'info';
}

interface Ctx {
  user: User | null;
  setUser: (u: User | null) => void;
  dicts: Record<string, DictItem[]>;
  dictLabels: Record<string, string>;
  operators: Operator[];
  contractors: ContractorLite[];
  status: { smtp_configured: boolean; sms_configured: boolean; sms_provider: string };
  reloadDicts: () => Promise<void>;
  reloadOperators: () => Promise<void>;
  reloadContractors: () => Promise<void>;
  reloadStatus: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind']) => void;
  confirm: (text: string, opts?: { ok?: string; danger?: boolean }) => Promise<boolean>;
  dictName: (id: number | null | undefined) => string;
  opName: (id: number | null | undefined) => string;
  isManager: boolean;
  isAdmin: boolean;
}

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [dicts, setDicts] = useState<Record<string, DictItem[]>>({});
  const [dictLabels, setDictLabels] = useState<Record<string, string>>({});
  const [operators, setOperators] = useState<Operator[]>([]);
  const [contractors, setContractors] = useState<ContractorLite[]>([]);
  const [status, setStatus] = useState({ smtp_configured: false, sms_configured: false, sms_provider: 'none' });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{ text: string; ok: string; danger: boolean; resolve: (v: boolean) => void } | null>(null);
  const tid = useRef(0);

  const reloadDicts = useCallback(async () => {
    const d = await get('/api/dicts');
    setDicts(d.items);
    setDictLabels(d.labels);
  }, []);
  const reloadOperators = useCallback(async () => setOperators(await get('/api/operators')), []);
  const reloadContractors = useCallback(async () => setContractors(await get('/api/contractors/lookup')), []);
  const reloadStatus = useCallback(async () => setStatus(await get('/api/settings/status')), []);

  useEffect(() => {
    if (!user || user.must_change_password) return;
    Promise.all([reloadDicts(), reloadOperators(), reloadContractors(), reloadStatus()]).catch(() => undefined);
  }, [user?.id, user?.must_change_password]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  const confirm = useCallback(
    (text: string, opts: { ok?: string; danger?: boolean } = {}) =>
      new Promise<boolean>((resolve) => setConfirmState({ text, ok: opts.ok ?? 'Tak', danger: !!opts.danger, resolve })),
    [],
  );

  const dictIndex = useMemo(() => {
    const m = new Map<number, string>();
    Object.values(dicts).forEach((l) => l.forEach((i) => m.set(i.id, i.name)));
    return m;
  }, [dicts]);
  const opIndex = useMemo(() => new Map(operators.map((o) => [o.id, o.name])), [operators]);

  const value: Ctx = {
    user,
    setUser,
    dicts,
    dictLabels,
    operators,
    contractors,
    status,
    reloadDicts,
    reloadOperators,
    reloadContractors,
    reloadStatus,
    toast,
    confirm,
    dictName: (id) => (id ? dictIndex.get(id) ?? '' : ''),
    opName: (id) => (id ? opIndex.get(id) ?? '' : ''),
    isManager: user?.role === 'admin' || user?.role === 'kierownik',
    isAdmin: user?.role === 'admin',
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
      {confirmState && <ConfirmDialog text={confirmState.text} ok={confirmState.ok} danger={confirmState.danger} onAnswer={(v) => (confirmState.resolve(v), setConfirmState(null))} />}
    </AppCtx.Provider>
  );
}

export function activeDict(dicts: Record<string, DictItem[]>, dict: string, keepId?: number | null) {
  return (dicts[dict] ?? []).filter((i) => i.active || i.id === keepId);
}
