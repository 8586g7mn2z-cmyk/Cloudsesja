import { useEffect, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { del, get, post, put } from '../lib/api';
import { today } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable } from '../components/DataTable';
import { ContractorPicker, Input, Loading, Modal, Notice, OperatorSelect, Textarea } from '../components/ui';
import { emptyItem, ItemsEditor } from '../components/ItemsEditor';
import { saleColumns } from './columns';

export function SaleForm({ id, defaults, onClose, onSaved }: { id?: number | null; defaults?: { contractor_id?: number }; onClose: () => void; onSaved: () => void }) {
  const { user, toast, confirm, isManager } = useApp();
  const [v, setV] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (id) get(`/api/sales/${id}`).then((s) => setV({ ...s, items: s.items.length ? s.items : [] })).catch((e) => setError(e.message));
    else setV({ doc_number: '', doc_date: today(), contractor_id: defaults?.contractor_id ?? null, operator_id: user!.id, notes: '', items: [emptyItem()], net_total: '', gross_total: '' });
  }, [id]);
  if (!v) return <Modal title="Sprzedaż" onClose={onClose}>{error ? <Notice kind="error">{error}</Notice> : <Loading />}</Modal>;
  const set = (k: string) => (e: any) => setV((p: any) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    setError(null);
    try {
      if (id) await put(`/api/sales/${id}`, v);
      else await post('/api/sales', v);
      toast('Zapisano transakcję sprzedaży.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal
      title={id ? `Sprzedaż ${v.doc_number}` : 'Nowa transakcja sprzedaży'}
      onClose={onClose}
      width={1000}
      onSubmit={save}
      footer={
        <>
          <div className="left">{id && isManager && <button type="button" className="btn danger" onClick={async () => { if (await confirm('Usunąć transakcję?', { ok: 'Usuń', danger: true })) { await del(`/api/sales/${id}`); onSaved(); } }}><Trash2 size={14} /> Usuń</button>}</div>
          <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          <button className="btn primary">Zapisz</button>
        </>
      }
    >
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      {v.source === 'import' && <div className="mb8"><Notice kind="info">Transakcja zaimportowana z pliku ({v.external_source ?? 'import'}). Ponowny import tego dokumentu nadpisze zmiany.</Notice></div>}
      <div className="form-grid">
        <label className="lbl req">Numer dokumentu</label>
        <Input value={v.doc_number} onChange={set('doc_number')} placeholder="np. FV/123/2026" />
        <label className="lbl req">Data</label>
        <Input type="date" value={v.doc_date} onChange={set('doc_date')} />
        <label className="lbl req">Kontrahent</label>
        <div className="span3"><ContractorPicker value={v.contractor_id} onChange={set('contractor_id')} /></div>
        <label className="lbl">Handlowiec</label>
        <OperatorSelect value={v.operator_id} onChange={set('operator_id')} />
        <label className="lbl">Uwagi</label>
        <Textarea rows={1} value={v.notes ?? ''} onChange={set('notes')} />
      </div>
      <div className="section-title">Pozycje</div>
      <ItemsEditor items={v.items} onChange={set('items')} />
      {v.items.length === 0 && (
        <div className="form-grid mt8">
          <label className="lbl">Wartość netto</label>
          <Input type="number" step="0.01" value={v.net_total} onChange={set('net_total')} />
          <label className="lbl">Wartość brutto</label>
          <Input type="number" step="0.01" value={v.gross_total} onChange={set('gross_total')} />
        </div>
      )}
    </Modal>
  );
}

export function SalesPage() {
  const nav = useNavigate();
  const list = useApi<any[]>('/api/sales');
  const [form, setForm] = useState<{ id?: number } | null>(null);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Sprzedaż</h1>
        <span className="small muted">Transakcje wprowadzone ręcznie lub zaimportowane z programu fakturującego; źródło danych raportu skuteczności handlowców.</span>
      </div>
      <DataTable
        id="sales"
        title="Sprzedaż"
        columns={saleColumns}
        rows={list.data}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        onOpen={(r) => setForm({ id: r.id })}
        defaultSort={[{ key: 'doc_date', dir: -1 }]}
        toolbar={
          <>
            <button className="btn primary" onClick={() => setForm({})}><Plus size={14} /> Nowa transakcja</button>
            <button className="btn" onClick={() => nav('/import')}><Upload size={14} /> Import transakcji</button>
          </>
        }
        emptyText="Brak transakcji sprzedaży."
      />
      {form && <SaleForm id={form.id} onClose={() => setForm(null)} onSaved={() => (setForm(null), list.reload())} />}
    </div>
  );
}
