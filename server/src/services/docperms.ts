// Uprawnienia do dokumentów i segregatorów (podgląd / edycja) per operator i per grupa (dział).
// Zasada: administrator i autor dokumentu mają edycję. Jeśli dokument ma własne wpisy uprawnień,
// decydują one; w przeciwnym razie wpisy segregatora; brak wpisów = segregator otwarty
// (wszyscy podgląd, kierownik edycja). Gdy wpisy istnieją, a użytkownik do nich nie pasuje, nie ma dostępu.
import type { Ctx } from '../context.js';
import type { User } from '../auth.js';
import { nowIso } from '../util.js';

export type Level = 'none' | 'view' | 'edit';
const rank: Record<Level, number> = { none: 0, view: 1, edit: 2 };

interface PermRow {
  subject_type: 'operator' | 'department' | 'all';
  subject_id: number;
  level: 'view' | 'edit';
}

function matchLevel(entries: PermRow[], u: User): Level {
  let best: Level = 'none';
  for (const e of entries) {
    const hit =
      e.subject_type === 'all' ||
      (e.subject_type === 'operator' && e.subject_id === u.id) ||
      (e.subject_type === 'department' && u.departments.includes(e.subject_id));
    if (hit && rank[e.level] > rank[best]) best = e.level;
  }
  return best;
}

export function permEntries(ctx: Ctx, targetType: 'document' | 'folder', id: number): PermRow[] {
  return ctx.db.all<PermRow>('SELECT subject_type, subject_id, level FROM document_permissions WHERE target_type = ? AND target_id = ?', targetType, id);
}

export function folderLevel(ctx: Ctx, u: User, folderId: number | null): Level {
  if (u.role === 'admin') return 'edit';
  if (!folderId) return u.role === 'kierownik' ? 'edit' : 'view';
  const e = permEntries(ctx, 'folder', folderId);
  if (!e.length) return u.role === 'kierownik' ? 'edit' : 'view';
  return matchLevel(e, u);
}

export function documentLevel(ctx: Ctx, u: User, doc: { id: number; author_id: number | null; folder_id: number | null }): Level {
  if (u.role === 'admin' || doc.author_id === u.id) return 'edit';
  const e = permEntries(ctx, 'document', doc.id);
  if (e.length) return matchLevel(e, u);
  return folderLevel(ctx, u, doc.folder_id);
}

/** Mapa poziomów dla wielu dokumentów naraz (rejestr). */
export function documentLevels(ctx: Ctx, u: User, docs: Array<{ id: number; author_id: number | null; folder_id: number | null }>): Map<number, Level> {
  const out = new Map<number, Level>();
  if (u.role === 'admin') {
    docs.forEach((d) => out.set(d.id, 'edit'));
    return out;
  }
  const all = ctx.db.all<any>('SELECT target_type, target_id, subject_type, subject_id, level FROM document_permissions');
  const byDoc = new Map<number, PermRow[]>();
  const byFolder = new Map<number, PermRow[]>();
  for (const p of all) {
    const m = p.target_type === 'document' ? byDoc : byFolder;
    if (!m.has(p.target_id)) m.set(p.target_id, []);
    m.get(p.target_id)!.push(p);
  }
  const def: Level = u.role === 'kierownik' ? 'edit' : 'view';
  for (const d of docs) {
    if (d.author_id === u.id) out.set(d.id, 'edit');
    else if (byDoc.has(d.id)) out.set(d.id, matchLevel(byDoc.get(d.id)!, u));
    else if (d.folder_id && byFolder.has(d.folder_id)) out.set(d.id, matchLevel(byFolder.get(d.folder_id)!, u));
    else out.set(d.id, def);
  }
  return out;
}

export function logDocument(ctx: Ctx, documentId: number, operatorId: number | null, action: string, version?: number | null, details?: string | null) {
  ctx.db.insert('document_log', {
    document_id: documentId,
    operator_id: operatorId,
    action,
    version: version ?? null,
    details: details ?? null,
    at: nowIso(),
  });
}
