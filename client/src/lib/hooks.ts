import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from './api';

export function useApi<T = any>(url: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await get<T>(url);
      if (n === seq.current) setData(d);
    } catch (e: any) {
      if (n === seq.current) setError(e.message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [url, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, reload: load, setData };
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      if (!s) return initial;
      const parsed = JSON.parse(s);
      return typeof initial === 'object' && initial !== null && !Array.isArray(initial) ? { ...(initial as any), ...parsed } : parsed;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (nv: T | ((p: T) => T)) => {
      setV((prev) => {
        const next = typeof nv === 'function' ? (nv as any)(prev) : nv;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* pamięć przeglądarki niedostępna */
        }
        return next;
      });
    },
    [key],
  );
  return [v, set];
}
