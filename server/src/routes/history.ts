// Historia sprawy (zapytania / przetargu) i kontrahenta: jedna chronologiczna lista wszystkiego, co się wydarzyło.
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { getSetting, setSetting } from '../context.js';
import { requireRole, requireUser } from '../auth.js';
import { bad, toInt } from '../util.js';
import { documentLevels } from '../services/docperms.js';

export interface HistoryEvent {
  at: string;
  type: 'sprawa' | 'korespondencja' | 'zadanie' | 'dokument' | 'załącznik' | 'notatka' | 'kontrahent';
  title: string;
  details?: string | null;
  who?: string | null;
  ref?: { kind: 'correspondence' | 'task' | 'document' | 'project'; id: number };
}

export const defaultModules = { sales: true, mailing: true, templates: true, task_tools: true, internal: true };
export type Modules = typeof defaultModules;
export const MODULE_LABELS: Record<keyof Modules, string> = {
  sales: 'Sprzedaż, zamówienia i kartoteka towarowa',
  mailing: 'Korespondencja seryjna i kolejka wysyłki',
  templates: 'Szablony dokumentów (oferta, zamówienie, pro forma)',
  task_tools: 'Rejestr zadań i zadania cykliczne',
  internal: 'Korespondencja wewnętrzna',
};

export async function historyRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/api/history', async (req) => {
    const u = requireUser(req);
    const q = req.query as any;
    const projectId = toInt(q.project_id);
    const contractorId = toInt(q.contractor_id);
    if (!projectId && !contractorId) throw bad('Wskaż sprawę lub kontrahenta.');
    const col = projectId ? 'project_id' : 'contractor_id';
    const id = (projectId ?? contractorId)!;
    const ev: HistoryEvent[] = [];
    const details = (v: string | null) => {
      if (!v) return null;
      try {
        const d = JSON.parse(v);
        return typeof d === 'string' ? d : Array.isArray(d) ? null : null;
      } catch {
        return v;
      }
    };

    // zmiany samej sprawy / kartoteki
    for (const a of db.all<any>(`SELECT a.*, o.name AS who FROM audit_log a LEFT JOIN operators o ON o.id = a.operator_id WHERE a.entity = ? AND a.entity_id = ?`, projectId ? 'project' : 'contractor', id)) {
      const d = details(a.details);
      if (a.action === 'zmiana danych' || (a.action === 'zmiana' && !d)) continue; // drobne poprawki danych nie zaśmiecają historii
      ev.push({ at: a.at, type: projectId ? 'sprawa' : 'kontrahent', title: a.action === 'dodanie' ? (projectId ? 'Założono sprawę' : 'Dodano kontrahenta') : d ? `Zmiana: ${d}` : a.action, who: a.who });
    }
    // sprawy kontrahenta
    if (contractorId)
      for (const p of db.all<any>('SELECT p.id, p.number, p.name, p.kind, p.created_at, o.name AS who FROM projects p LEFT JOIN operators o ON o.id = p.created_by WHERE p.contractor_id = ?', id))
        ev.push({ at: p.created_at, type: 'sprawa', title: `${p.kind === 'przetarg' ? 'Przetarg' : p.kind === 'zapytanie' ? 'Zapytanie ofertowe' : 'Projekt'} ${p.number}: ${p.name}`, who: p.who, ref: { kind: 'project', id: p.id } });
    // korespondencja
    for (const k of db.all<any>(
      `SELECT k.id, k.event_at, k.direction, k.number, k.topic_text, k.body, kd.name AS kind, t.name AS topic, o.name AS who,
              TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS contact
       FROM correspondence k JOIN dict_items kd ON kd.id = k.kind_id LEFT JOIN dict_items t ON t.id = k.topic_id
       LEFT JOIN operators o ON o.id = k.operator_id LEFT JOIN contacts p ON p.id = k.contact_id WHERE k.${col} = ?`,
      id,
    ))
      ev.push({
        at: k.event_at,
        type: 'korespondencja',
        title: `${k.kind} ${k.direction === 'in' ? 'przychodząca' : 'wychodząca'}: ${k.topic_text || k.topic || ''}`.trim(),
        details: [k.contact ? `rozmówca: ${k.contact}` : null, k.body ? String(k.body).slice(0, 240) : null].filter(Boolean).join(' · ') || null,
        who: k.who,
        ref: { kind: 'correspondence', id: k.id },
      });
    // zadania: utworzenie i wykonanie
    for (const t of db.all<any>(
      `SELECT t.id, t.title, t.start_at, t.created_at, t.done_at, o.name AS who, c.name AS creator FROM tasks t
       LEFT JOIN operators o ON o.id = t.operator_id LEFT JOIN operators c ON c.id = t.created_by WHERE t.${col} = ?`,
      id,
    )) {
      ev.push({ at: t.created_at, type: 'zadanie', title: `Zaplanowano zadanie: ${t.title}`, details: `termin ${t.start_at.slice(8, 10)}.${t.start_at.slice(5, 7)}.${t.start_at.slice(0, 4)} ${t.start_at.slice(11, 16)}, wykonawca: ${t.who ?? '—'}`, who: t.creator, ref: { kind: 'task', id: t.id } });
      if (t.done_at) ev.push({ at: t.done_at, type: 'zadanie', title: `Wykonano zadanie: ${t.title}`, who: t.who, ref: { kind: 'task', id: t.id } });
    }
    // dokumenty: dodanie i kolejne wersje (tylko te, do których użytkownik ma dostęp)
    const docs = db.all<any>(`SELECT id, author_id, folder_id, number, name FROM documents WHERE ${col} = ?`, id);
    const lv = documentLevels(ctx, u, docs);
    for (const d of docs.filter((x) => lv.get(x.id) !== 'none'))
      for (const l of db.all<any>("SELECT l.*, o.name AS who FROM document_log l LEFT JOIN operators o ON o.id = l.operator_id WHERE l.document_id = ? AND l.action IN ('dodanie', 'nowa wersja')", d.id))
        ev.push({ at: l.at, type: 'dokument', title: `${l.action === 'dodanie' ? 'Dodano dokument' : `Nowa wersja (${l.version}) dokumentu`}: ${d.name}`, details: [d.number, l.details].filter(Boolean).join(' · '), who: l.who, ref: { kind: 'document', id: d.id } });
    // załączniki dodane wprost
    for (const a of db.all<any>(
      `SELECT a.created_at, f.original_name, o.name AS who FROM attachments a JOIN files f ON f.id = a.file_id LEFT JOIN operators o ON o.id = a.created_by
       WHERE a.owner_type = ? AND a.owner_id = ?`,
      projectId ? 'project' : 'contractor',
      id,
    ))
      ev.push({ at: a.created_at, type: 'załącznik', title: `Dodano załącznik: ${a.original_name}`, who: a.who });
    // notatki w kartotece kontrahenta
    if (contractorId)
      for (const n of db.all<any>('SELECT n.*, o.name AS who FROM notes n LEFT JOIN operators o ON o.id = n.author_id WHERE n.contractor_id = ?', id))
        ev.push({ at: n.created_at, type: 'notatka', title: 'Notatka', details: String(n.body ?? '').slice(0, 240), who: n.who });

    return ev.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 1000);
  });

  // ---------- Moduły (uproszczenie panelu: wyłączone moduły znikają z menu i kartotek, dane zostają) ----------
  app.get('/api/settings/modules', async (req) => {
    requireUser(req);
    return { modules: getSetting(ctx, 'modules', defaultModules), labels: MODULE_LABELS };
  });
  app.put('/api/settings/modules', async (req) => {
    requireRole(req, 'admin');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const next = { ...getSetting(ctx, 'modules', defaultModules) };
    for (const k of Object.keys(defaultModules) as (keyof Modules)[]) if (b[k] !== undefined) next[k] = !!b[k];
    setSetting(ctx, 'modules', next);
    return { modules: next };
  });
}
