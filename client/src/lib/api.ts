export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function handle(r: Response) {
  const ct = r.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await r.json().catch(() => null) : null;
  if (!r.ok) {
    if (r.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(r.status, data?.error ?? `Błąd serwera (${r.status}).`, data);
  }
  return data;
}

export async function api<T = any>(url: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'Brak połączenia z serwerem. Sprawdź sieć i spróbuj ponownie.');
  }
  return handle(r);
}
export const get = <T = any>(url: string) => api<T>(url);
export const post = <T = any>(url: string, body: any = {}) => api<T>(url, { method: 'POST', body });
export const put = <T = any>(url: string, body: any = {}) => api<T>(url, { method: 'PUT', body });
export const patch = <T = any>(url: string, body: any = {}) => api<T>(url, { method: 'PATCH', body });
export const del = <T = any>(url: string) => api<T>(url, { method: 'DELETE' });

export async function upload<T = any>(url: string, files: File[] | FileList, fields: Record<string, any> = {}): Promise<T> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v));
  for (const f of Array.from(files)) fd.append('file', f, f.name);
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Brak połączenia z serwerem.');
  }
  return handle(r);
}

/** Pobiera plik (POST lub GET) i zapisuje go w przeglądarce. */
export async function download(url: string, body?: any, fallbackName = 'plik') {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (!r.ok) {
    const d = await r.json().catch(() => null);
    throw new ApiError(r.status, d?.error ?? 'Nie udało się pobrać pliku.');
  }
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  saveBlob(blob, name);
}
export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
export function qs(params: Record<string, any>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v === true ? '1' : String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
