import { useEffect, useState } from 'react';
import { Plus, Trash2, FileStack } from 'lucide-react';
import { del, get, post, put } from '../lib/api';
import { today } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable } from '../components/DataTable';
import { ContractorPicker, DictSelect, Input, Loading, Modal, Notice, OperatorSelect, Textarea, Combo } from '../components/ui';
import { emptyItem, ItemsEditor } from '../components/ItemsEditor';
import { orderColumns } from './columns';
import { GenerateDialog } from './Templates';

export function OrderForm({ id, defaults, onClose, onSaved }: { id?: number | null; defaults?: { contractor_id?: number }; onClose: () => void; onSaved: () => void }) {
  const { user, toast, confirm, isManager } = useApp();
  const [v, setV] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  const projects = useApi<any[]>('/api/projects');
  useEffect(() => {
    if (id) get(`/api/orders/${id}`).then(setV).catch((e) => setError(e.message));
    else setV({ contractor_id: defaults?.contractor_id ?? null, order_date: today(), delivery_date: '', status_id: null, operator_id: user!.id, project_id: null, notes: '', items: [emptyItem()] });
  }, [id]);
  if (!v) return <Modal title="Zamówienie" onClose={onClose}>{error ? <Notice kind="error">{error}</Notice> : <Loading />}</Modal>;
  const set = (k: string) => (e: any) => setV((p: any) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    setError(null);
    try {
      if (id) await put(`/api/orders/${id}`, v);
      else await post('/api/orders', v);
      toast('Zapisano zamówienie.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal
      title={id ? `Zamówienie ${v.number}` : 'Nowe zamówienie'}
      onClose={onClose}
      width={1000}
      onSubmit={save}
      footer={
        <>
          <div className="left">
            {id && isManager && <button type="button" className="btn danger" onClick={async () => { if (await confirm('Usunąć zamówienie?', { ok: 'Usuń', danger: true })) { await del(`/api/orders/${id}`); onSaved(); } }}><Trash2 size={14} /> Usuń</button>}
            {id && <button type="button" className="btn" onClick={() => setGen(true)}><FileStack size={14} /> Dokument z szablonu</button>}
          </div>
          <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          <button className="btn primary">Zapisz</button>
        </>
      }
    >
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid">
        <label className="lbl req">Kontrahent</label>
        <div className="span3"><ContractorPicker value={v.contractor_id} onChange={set('contractor_id')} /></div>
        <label className="lbl req">Data zamówienia</label>
        <Input type="date" value={v.order_date} onChange={set('order_date')} />
        <label className="lbl">Termin dostawy</label>
        <Input type="date" value={v.delivery_date ?? ''} onChange={set('delivery_date')} />
        <label className="lbl">Status</label>
        <DictSelect dict="order_status" value={v.status_id} onChange={set('status_id')} />
        <label className="lbl">Handlowiec</label>
        <OperatorSelect value={v.operator_id} onChange={set('operator_id')} />
        <label className="lbl">Projekt</label>
        <Combo items={(projects.data ?? []).map((p) => ({ id: p.id, label: p.name, sub: p.number }))} value={v.project_id} onChange={set('project_id')} />
        <label className="lbl">Uwagi</label>
        <Textarea rows={1} value={v.notes ?? ''} onChange={set('notes')} />
      </div>
      <div className="section-title">Pozycje</div>
      <ItemsEditor items={v.items} onChange={set('items')} />
      {gen && id && <GenerateDialog contractorId={v.contractor_id} orderId={id} onClose={() => setGen(false)} onDone={() => setGen(false)} />}
    </Modal>
  );
}

export function OrdersPage() {
  const list = useApi<any[]>('/api/orders');
  const [form, setForm] = useState<{ id?: number } | null>(null);
  return (
    <div className="page">
      <div className="page-head"><h1>Zamówienia</h1></div>
      <DataTable id="orders" title="Zamówienia" columns={orderColumns} rows={list.data} loading={list.loading} error={list.error} onReload={list.reload} onOpen={(r) => setForm({ id: r.id })} defaultSort={[{ key: 'order_date', dir: -1 }]} toolbar={<button className="btn primary" onClick={() => setForm({})}><Plus size={14} /> Nowe zamówienie</button>} emptyText="Brak zamówień." />
      {form && <OrderForm id={form.id} onClose={() => setForm(null)} onSaved={() => (setForm(null), list.reload())} />}
    </div>
  );
}
