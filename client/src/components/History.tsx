// Historia sprawy lub kontrahenta: chronologiczna lista korespondencji, zadań, dokumentów i zmian.
import { useState } from 'react';
import { MessagesSquare, ListChecks, FileText, Paperclip, StickyNote, FolderKanban, Building2 } from 'lucide-react';
import { fmtDate, fmtTime } from '../lib/format';
import { useApi } from '../lib/hooks';
import { ErrorBox, Loading } from './ui';

interface Ev {
  at: string;
  type: string;
  title: string;
  details?: string | null;
  who?: string | null;
  ref?: { kind: 'correspondence' | 'task' | 'document' | 'project'; id: number };
}

const ICONS: Record<string, any> = { korespondencja: MessagesSquare, zadanie: ListChecks, dokument: FileText, załącznik: Paperclip, notatka: StickyNote, sprawa: FolderKanban, kontrahent: Building2 };
const LABELS: Record<string, string> = { sprawa: 'Sprawy i zmiany', korespondencja: 'Korespondencja', zadanie: 'Zadania', dokument: 'Dokumenty', załącznik: 'Załączniki', notatka: 'Notatki', kontrahent: 'Kartoteka' };

export function History({ projectId, contractorId, onOpen, reloadKey }: { projectId?: number; contractorId?: number; onOpen?: (ref: NonNullable<Ev['ref']>) => void; reloadKey?: any }) {
  const h = useApi<Ev[]>(`/api/history?${projectId ? `project_id=${projectId}` : `contractor_id=${contractorId}`}`, [projectId, contractorId, reloadKey]);
  const [off, setOff] = useState<Set<string>>(new Set());
  if (h.error) return <ErrorBox error={h.error} onRetry={h.reload} />;
  if (!h.data) return <Loading />;
  const types = [...new Set(h.data.map((e) => e.type))];
  const rows = h.data.filter((e) => !off.has(e.type));
  let lastDay = '';
  return (
    <div className="page-scroll history">
      <div className="row mb8" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="small muted">Pokaż:</span>
        {types.map((t) => (
          <button key={t} type="button" className={`btn sm ${off.has(t) ? '' : 'active'}`} onClick={() => setOff((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })}>
            {LABELS[t] ?? t} <span className="muted">{h.data!.filter((e) => e.type === t).length}</span>
          </button>
        ))}
        <span className="grow" />
        <span className="small muted">Zdarzeń: {rows.length}</span>
      </div>
      {!rows.length && <p className="muted">Brak zdarzeń w historii.</p>}
      <ol className="timeline">
        {rows.map((e, i) => {
          const day = e.at.slice(0, 10);
          const head = day !== lastDay;
          lastDay = day;
          const Icon = ICONS[e.type] ?? FileText;
          return (
            <li key={i}>
              {head && <div className="tl-day">{fmtDate(day)}</div>}
              <div className="tl-item">
                <span className="tl-time">{fmtTime(e.at)}</span>
                <span className={`tl-ico ${e.type}`}><Icon size={13} /></span>
                <div className="tl-body">
                  {e.ref && onOpen ? <a href="#" onClick={(x) => (x.preventDefault(), onOpen(e.ref!))}>{e.title}</a> : <span className="tl-title">{e.title}</span>}
                  {e.details && <div className="small muted tl-details">{e.details}</div>}
                </div>
                <span className="small muted tl-who">{e.who}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
