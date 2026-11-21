import { useState } from 'react';
import { Plus, Eye, FileOutput, Trash2 } from 'lucide-react';
import { del, post, put } from '../lib/api';
import { addDays, today } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { ContractorPicker, DictSelect, Input, Loading, Modal, Notice, Select, Textarea } from '../components/ui';
import { emptyItem, ItemsEditor } from '../components/ItemsEditor';

export function GenerateDialog({ contractorId, orderId, onClose, onDone }: { contractorId?: number | null; orderId?: number; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const tpls = useApi<any>('/api/doc-templates');
  const folders = useApi<any[]>('/api/doc-folders');
  const [v, setV] = useState<any>({ template_id: null, contractor_id: contractorId ?? null, order_id: orderId ?? null, valid_to: addDays(today(), 30), folder_id: null, items: [emptyItem()] });
  const orders = useApi<any[]>(v.contractor_id ? `/api/orders?contractor_id=${v.contractor_id}` : null, [v.contractor_id]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x }));
  const body = () => ({ ...v, items: v.order_id ? undefined : v.items });
  const preview = async () => {
    setError(null);
    if (!v.template_id || !v.contractor_id) return setError('Wybierz szablon i kontrahenta.');
    try {
      const r = await fetch(`/api/doc-templates/${v.template_id}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()) });
      if (!r.ok) throw new Error((await r.json()).error);
      window.open(URL.createObjectURL(await r.blob()), '_blank');
    } catch (e: any) {
      setError(e.message);
    }
  };
  const generate = async () => {
    setError(null);
    if (!v.template_id || !v.contractor_id) return setError('Wybierz szablon i kontrahenta.');
    setBusy(true);
    try {
      const r = await post(`/api/doc-templates/${v.template_id}/generate`, body());
      toast(`Wygenerowano dokument ${r.number}; zapisano w rejestrze i w kartotece kontrahenta.`);
      window.open(`/api/documents/${r.id}/file?inline=1`, '_blank');
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const list = tpls.data?.templates?.filter((t: any) => t.active) ?? [];
  return (
    <Modal title="Dokument z szablonu" onClose={onClose} width={1000} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button type="button" className="btn" onClick={preview}><Eye size={14} /> Podgląd PDF</button><button type="button" className="btn primary" disabled={busy} onClick={generate}><FileOutput size={14} /> Generuj i zapisz</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid">
        <label className="lbl req">Szablon</label>
        <Select value={v.template_id} onChange={(t) => setV((p: any) => ({ ...p, template_id: t, folder_id: list.find((x: any) => x.id === t)?.folder_id ?? null }))} options={list.map((t: any) => ({ value: t.id, label: t.name }))} />
        <label className="lbl">Segregator</label>
        <Select value={v.folder_id} onChange={set('folder_id')} options={(folders.data ?? []).filter((f) => f.can_add).map((f) => ({ value: f.id, label: f.name }))} />
        <label className="lbl req">Kontrahent</label>
        <ContractorPicker value={v.contractor_id} onChange={(c) => setV((p: any) => ({ ...p, contractor_id: c, order_id: null }))} />
        <label className="lbl">Zamówienie</label>
        <Select value={v.order_id} onChange={set('order_id')} empty="(pozycje wprowadzone poniżej)" options={(orders.data ?? []).map((o) => ({ value: o.id, label: `${o.number} z ${String(o.order_date).split('-').reverse().join('.')}` }))} />
        <label className="lbl">Ważny do</label>
        <Input type="date" value={v.valid_to} onChange={(e) => set('valid_to')(e.target.value)} />
      </div>
      {!v.order_id && (
        <>
          <div className="section-title">Pozycje dokumentu</div>
          <ItemsEditor items={v.items} onChange={set('items')} />
        </>
      )}
      {tpls.loading && <Loading />}
    </Modal>
  );
}

function TemplateForm({ t, fields, folders, onClose, onSaved }: { t?: any; fields: Record<string, string>; folders: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast, confirm } = useApp();
  const [v, setV] = useState<any>(t ?? { name: '', kind: 'oferta', title: '{{kontrahent.skrot}} — {{numer}}', body: '# Tytuł dokumentu\n\n{{pozycje}}\n', folder_id: null, type_id: null, active: 1 });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x?.target ? x.target.value : x }));
  const save = async () => {
    try {
      if (t) await put(`/api/doc-templates/${t.id}`, v);
      else await post('/api/doc-templates', v);
      toast('Zapisano szablon.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal title={t ? `Szablon: ${t.name}` : 'Nowy szablon'} onClose={onClose} width={1000} onSubmit={save} footer={<><div className="left">{t && <button type="button" className="btn danger" onClick={async () => { if (await confirm('Usunąć szablon?', { ok: 'Usuń', danger: true })) { await del(`/api/doc-templates/${t.id}`); onSaved(); } }}><Trash2 size={14} /> Usuń</button>}</div><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="grow">
          <div className="form-grid">
            <label className="lbl req">Nazwa</label>
            <Input value={v.name} onChange={set('name')} />
            <label className="lbl">Rodzaj</label>
            <Select value={v.kind} onChange={set('kind')} empty={null} options={[{ value: 'oferta', label: 'oferta' }, { value: 'zamowienie', label: 'zamówienie' }, { value: 'proforma', label: 'faktura pro forma' }, { value: 'inny', label: 'inny' }]} />
            <label className="lbl req">Tytuł dokumentu</label>
            <div className="span3"><Input value={v.title} onChange={set('title')} /></div>
            <label className="lbl">Segregator</label>
            <Select value={v.folder_id} onChange={set('folder_id')} options={folders.map((f) => ({ value: f.id, label: f.name }))} />
            <label className="lbl">Typ</label>
            <DictSelect dict="doc_type" value={v.type_id} onChange={set('type_id')} />
          </div>
          <div className="section-title">Treść (wiersz zaczynający się od „# ” to nagłówek)</div>
          <Textarea rows={18} value={v.body} onChange={set('body')} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </div>
        <div style={{ width: 300 }}>
          <div className="section-title" style={{ marginTop: 0 }}>Pola podstawiane</div>
          <table className="grid">
            <tbody>
              {Object.entries(fields).map(([k, d]) => (
                <tr key={k} style={{ cursor: 'pointer' }} onClick={() => setV((p: any) => ({ ...p, body: p.body + k }))} title="Kliknij, aby wstawić">
                  <td className="small nowrap" style={{ fontFamily: 'monospace' }}>{k}</td>
                  <td className="xs muted">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="xs muted mt8">Nagłówek z nazwą, adresem i logo firmy oraz stopka są wspólne dla wszystkich szablonów (Ustawienia → Dane firmy).</p>
        </div>
      </div>
    </Modal>
  );
}

export function TemplatesPage() {
  const { isManager } = useApp();
  const d = useApi<any>('/api/doc-templates');
  const folders = useApi<any[]>('/api/doc-folders');
  const [form, setForm] = useState<any>(null);
  const [gen, setGen] = useState(false);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Szablony dokumentów</h1>
        <button className="btn primary" onClick={() => setGen(true)}><FileOutput size={14} /> Generuj dokument</button>
        {isManager && <button className="btn" onClick={() => setForm({})}><Plus size={14} /> Nowy szablon</button>}
      </div>
      <div className="page-scroll">
        {d.loading ? <Loading /> : (
          <table className="grid" style={{ maxWidth: 1000 }}>
            <thead><tr><th>Nazwa</th><th>Rodzaj</th><th>Tytuł dokumentu</th><th>Segregator docelowy</th><th>Aktywny</th><th /></tr></thead>
            <tbody>
              {(d.data?.templates ?? []).map((t: any) => (
                <tr key={t.id}><td>{t.name}</td><td>{({ oferta: 'oferta', zamowienie: 'zamówienie', proforma: 'faktura pro forma', inny: 'inny' } as Record<string, string>)[t.kind] ?? t.kind}</td><td className="small">{t.title}</td><td>{t.folder_name}</td><td>{t.active ? 'tak' : 'nie'}</td>
                  <td>{isManager && <button className="btn sm" onClick={() => setForm(t)}>Edytuj</button>}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {form && <TemplateForm t={form.id ? form : undefined} fields={d.data?.fields ?? {}} folders={folders.data ?? []} onClose={() => setForm(null)} onSaved={() => (setForm(null), d.reload())} />}
      {gen && <GenerateDialog onClose={() => setGen(false)} onDone={() => setGen(false)} />}
    </div>
  );
}
