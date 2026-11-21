import { useState } from 'react';
import { Plus, CheckCheck, Trash2 } from 'lucide-react';
import { del, post } from '../lib/api';
import { fmtDateTime, toIsoDateTime } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable, type Column } from '../components/DataTable';
import { Check, Input, Modal, MultiOperator, Notice, Tabs, Textarea } from '../components/ui';

function NewMessage({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const { toast } = useApp();
  const [v, setV] = useState<any>({ recipient_ids: [], all: false, subject: '', body: '', later: false, deliver_at: toIsoDateTime(new Date(Date.now() + 3600_000)) });
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    try {
      const r = await post('/api/internal', { ...v, deliver_at: v.later ? v.deliver_at : null });
      toast(r.scheduled ? `Wiadomość zaplanowana na ${fmtDateTime(v.deliver_at)}.` : 'Wiadomość wysłana.');
      onSent();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal title="Nowa wiadomość wewnętrzna" onClose={onClose} width={640} onSubmit={send} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary">{v.later ? 'Zaplanuj' : 'Wyślij'}</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid one">
        <label className="lbl req">Do</label>
        <div className="col gap4">
          <Check checked={v.all} onChange={(c) => setV({ ...v, all: c })}>wszyscy operatorzy</Check>
          {!v.all && <MultiOperator value={v.recipient_ids} onChange={(ids) => setV({ ...v, recipient_ids: ids })} />}
        </div>
        <label className="lbl req" htmlFor="im-s">Temat</label>
        <Input id="im-s" value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />
        <label className="lbl" htmlFor="im-b">Treść</label>
        <Textarea id="im-b" rows={6} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
        <label className="lbl">Termin doręczenia</label>
        <div className="row">
          <Check checked={v.later} onChange={(c) => setV({ ...v, later: c })}>doręcz później:</Check>
          <Input type="datetime-local" disabled={!v.later} value={v.deliver_at} onChange={(e) => setV({ ...v, deliver_at: e.target.value })} style={{ width: 200 }} />
        </div>
      </div>
      <p className="small muted mt8">Adresat zobaczy wiadomość dopiero w wyznaczonym terminie — w skrzynce odebranych i jako powiadomienie.</p>
    </Modal>
  );
}

const inCols: Column<any>[] = [
  { key: 'read', label: '', width: 26, filter: 'none', value: (r) => (r.read_at ? '' : '●'), render: (r) => (r.read_at ? null : <span style={{ color: 'var(--accent)' }}>●</span>) },
  { key: 'deliver_at', label: 'Doręczono', type: 'datetime', width: 125 },
  { key: 'sender', label: 'Od', width: 150, filter: 'select' },
  { key: 'subject', label: 'Temat', width: 300 },
  { key: 'read_at', label: 'Przeczytano', type: 'datetime', width: 125 },
];
const outCols: Column<any>[] = [
  { key: 'created_at', label: 'Utworzono', type: 'datetime', width: 125 },
  { key: 'deliver_at', label: 'Termin doręczenia', type: 'datetime', width: 130 },
  { key: 'state', label: 'Stan', width: 100, filter: 'select' },
  { key: 'recipients', label: 'Adresaci', width: 240 },
  { key: 'subject', label: 'Temat', width: 260 },
  { key: 'read', label: 'Przeczytało', width: 90, value: (r) => `${r.read_count}/${r.recipients_count}` },
];

export function InternalPage() {
  const { toast, confirm } = useApp();
  const [tab, setTab] = useState('in');
  const inbox = useApi<any[]>('/api/internal/inbox');
  const sent = useApi<any[]>('/api/internal/sent');
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState(false);
  const open = async (m: any) => {
    setSel(m);
    if (tab === 'in' && !m.read_at) {
      await post(`/api/internal/${m.id}/read`).catch(() => undefined);
      inbox.reload();
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <h1>Korespondencja wewnętrzna</h1>
      </div>
      <Tabs active={tab} onChange={(t) => (setTab(t), setSel(null))} tabs={[{ key: 'in', label: 'Odebrane', count: inbox.data?.filter((m) => !m.read_at).length || null }, { key: 'out', label: 'Wysłane i zaplanowane' }]} />
      <div className="split">
        <div className="left">
          <DataTable
            id={`internal-${tab}`}
            title={tab === 'in' ? 'Wiadomości odebrane' : 'Wiadomości wysłane'}
            columns={tab === 'in' ? inCols : outCols}
            rows={tab === 'in' ? inbox.data : sent.data}
            loading={tab === 'in' ? inbox.loading : sent.loading}
            selectedKey={sel?.id}
            onSelect={open}
            onOpen={open}
            rowClass={(r) => (tab === 'in' && !r.read_at ? '' : '')}
            searchText={(r) => r.body ?? ''}
            toolbar={
              <>
                <button className="btn primary" onClick={() => setForm(true)}><Plus size={14} /> Nowa wiadomość</button>
                {tab === 'in' && <button className="btn" onClick={async () => { await post('/api/internal/read-all'); inbox.reload(); }}><CheckCheck size={14} /> Oznacz wszystkie jako przeczytane</button>}
              </>
            }
            emptyText={tab === 'in' ? 'Brak wiadomości.' : 'Nie wysłano jeszcze wiadomości.'}
          />
        </div>
        {sel && (
          <aside className="side-panel" style={{ width: 400 }}>
            <div className="sp-head">{sel.subject}</div>
            <div className="sp-body">
              <dl className="kv">
                {tab === 'in' ? (<><dt>Od</dt><dd>{sel.sender}</dd></>) : (<><dt>Do</dt><dd>{sel.recipients}</dd></>)}
                <dt>Doręczenie</dt><dd>{fmtDateTime(sel.deliver_at)}</dd>
                {sel.task_title && (<><dt>Zadanie</dt><dd>{sel.task_title}</dd></>)}
              </dl>
              <div style={{ whiteSpace: 'pre-wrap' }} className="mt12">{sel.body}</div>
              {tab === 'out' && sel.state === 'zaplanowana' && (
                <button className="btn sm danger mt12" onClick={async () => {
                  if (!(await confirm('Wycofać zaplanowaną wiadomość?', { ok: 'Wycofaj', danger: true }))) return;
                  try { await del(`/api/internal/${sel.id}`); setSel(null); sent.reload(); } catch (e: any) { toast(e.message, 'error'); }
                }}><Trash2 size={13} /> Wycofaj</button>
              )}
            </div>
          </aside>
        )}
      </div>
      {form && <NewMessage onClose={() => setForm(false)} onSent={() => (setForm(false), sent.reload(), inbox.reload())} />}
    </div>
  );
}
