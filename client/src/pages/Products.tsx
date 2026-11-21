import { useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { del, post, put } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable, type Column } from '../components/DataTable';
import { Check, Input, Modal, Notice } from '../components/ui';

const cols: Column<any>[] = [
  { key: 'sku', label: 'Indeks', width: 120 },
  { key: 'name', label: 'Nazwa', width: 280 },
  { key: 'unit', label: 'J.m.', width: 60, filter: 'select' },
  { key: 'net_price', label: 'Cena netto', type: 'money', width: 110 },
  { key: 'vat_rate', label: 'VAT %', type: 'number', width: 70, filter: 'select' },
  { key: 'gross', label: 'Cena brutto', type: 'money', width: 110, value: (r) => Math.round(r.net_price * (100 + r.vat_rate)) / 100 },
  { key: 'product_group', label: 'Grupa towarowa', width: 140, filter: 'select' },
  { key: 'ean', label: 'EAN', width: 120, hidden: true },
  { key: 'external_source', label: 'Źródło', width: 110, hidden: true, filter: 'select' },
  { key: 'active', label: 'Aktywny', type: 'bool', width: 70, filter: 'select' },
];

function ProductForm({ p, onClose, onSaved }: { p?: any; onClose: () => void; onSaved: () => void }) {
  const { toast, confirm } = useApp();
  const [v, setV] = useState<any>(p ?? { sku: '', name: '', unit: 'szt.', net_price: '', vat_rate: 23, ean: '', product_group: '', active: 1 });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    try {
      if (p) await put(`/api/products/${p.id}`, v);
      else await post('/api/products', v);
      toast('Zapisano towar.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal title={p ? 'Towar' : 'Nowy towar'} onClose={onClose} width={560} onSubmit={save} footer={<><div className="left">{p && <button type="button" className="btn danger" onClick={async () => { if (await confirm('Usunąć towar? Jeśli występuje w dokumentach, zostanie oznaczony jako nieaktywny.', { ok: 'Usuń', danger: true })) { await del(`/api/products/${p.id}`); onSaved(); } }}><Trash2 size={14} /> Usuń</button>}</div><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid one">
        <label className="lbl">Indeks</label><Input value={v.sku} onChange={set('sku')} />
        <label className="lbl req">Nazwa</label><Input value={v.name} onChange={set('name')} />
        <label className="lbl">Jednostka</label><Input value={v.unit} onChange={set('unit')} />
        <label className="lbl req">Cena netto [zł]</label><Input type="number" step="0.01" min={0} value={v.net_price} onChange={set('net_price')} />
        <label className="lbl req">Stawka VAT [%]</label><Input type="number" min={0} max={100} value={v.vat_rate} onChange={set('vat_rate')} />
        <label className="lbl">EAN</label><Input value={v.ean} onChange={set('ean')} />
        <label className="lbl">Grupa towarowa</label><Input value={v.product_group} onChange={set('product_group')} />
        <label className="lbl">Aktywny</label><Check checked={!!v.active} onChange={(c) => set('active')(c ? 1 : 0)}>dostępny w nowych dokumentach</Check>
      </div>
    </Modal>
  );
}

export function ProductsPage() {
  const nav = useNavigate();
  const list = useApi<any[]>('/api/products');
  const [form, setForm] = useState<any>(null);
  return (
    <div className="page">
      <div className="page-head"><h1>Kartoteka towarowa</h1></div>
      <DataTable id="products" title="Kartoteka towarowa" columns={cols} rows={list.data} loading={list.loading} error={list.error} onOpen={(r) => setForm(r)} defaultSort={[{ key: 'name', dir: 1 }]} toolbar={<><button className="btn primary" onClick={() => setForm({})}><Plus size={14} /> Nowy towar</button><button className="btn" onClick={() => nav('/import')}><Upload size={14} /> Import towarów</button></>} emptyText="Brak towarów w kartotece." />
      {form && <ProductForm p={form.id ? form : undefined} onClose={() => setForm(null)} onSaved={() => (setForm(null), list.reload())} />}
    </div>
  );
}
