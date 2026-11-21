import { useState } from 'react';
import { Plus } from 'lucide-react';
import { qs } from '../lib/api';
import { addDays, fmtDateTime, today } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable } from '../components/DataTable';
import { Input, OperatorSelect } from '../components/ui';
import { correspondenceColumns } from './columns';
import { CorrespondenceForm } from './CorrespondenceForm';

export function CorrespondencePage() {
  const { dicts } = useApp();
  const [from, setFrom] = useState(addDays(today(), -90));
  const [to, setTo] = useState('');
  const [op, setOp] = useState<number | null>(null);
  const list = useApi<any[]>(`/api/correspondence${qs({ from, to, operator_id: op })}`, [from, to, op]);
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState<{ id?: number; kind?: string } | null>(null);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Rejestr korespondencji</h1>
      </div>
      <div className="split">
        <div className="left">
          <DataTable
            id="correspondence"
            title="Korespondencja"
            columns={correspondenceColumns}
            rows={list.data}
            loading={list.loading}
            error={list.error}
            onReload={list.reload}
            selectedKey={sel?.id}
            onSelect={setSel}
            onOpen={(r) => setForm({ id: r.id })}
            defaultSort={[{ key: 'event_at', dir: -1 }]}
            searchText={(r) => r.body ?? ''}
            toolbar={
              <>
                <button className="btn primary" onClick={() => setForm({ kind: 'phone' })}>
                  <Plus size={14} /> Nowa korespondencja
                </button>
                {(dicts.corr_kind ?? []).filter((k) => k.code && k.code !== 'phone' && k.active).map((k) => (
                  <button key={k.id} className="btn" onClick={() => setForm({ kind: k.code! })}>
                    {k.name}
                  </button>
                ))}
              </>
            }
            filters={
              <>
                <span className="fl">
                  Data od <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
                </span>
                <span className="fl">
                  do <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
                </span>
                <span className="fl" style={{ width: 240 }}>
                  Operator <OperatorSelect value={op} onChange={setOp} empty="(wszyscy)" />
                </span>
              </>
            }
          />
        </div>
        {sel && (
          <aside className="side-panel">
            <div className="sp-head">{sel.subject || '(bez tematu)'}</div>
            <div className="sp-body">
              <dl className="kv">
                <dt>Osoba</dt>
                <dd>{sel.contact_name}</dd>
                <dt>Operator</dt>
                <dd>{sel.operator_name}</dd>
                <dt>Kontrahent</dt>
                <dd>{sel.contractor_name}</dd>
                <dt>Data</dt>
                <dd>{fmtDateTime(sel.event_at)}</dd>
                <dt>Numer</dt>
                <dd>{sel.number}</dd>
              </dl>
              <div className="section-title">Treść</div>
              <div style={{ whiteSpace: 'pre-wrap' }} className="small">{sel.body || <span className="muted">brak treści</span>}</div>
              <button className="btn sm mt12" onClick={() => setForm({ id: sel.id })}>
                Otwórz
              </button>
            </div>
          </aside>
        )}
      </div>
      {form && <CorrespondenceForm id={form.id} defaults={{ kind_code: form.kind }} onClose={() => setForm(null)} onSaved={() => (setForm(null), list.reload())} />}
    </div>
  );
}
