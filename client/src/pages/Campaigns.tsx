import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Eye, Send, FolderOpen, Trash2 } from 'lucide-react';
import { get, post } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable, type Column } from '../components/DataTable';
import { DictSelect, Input, Loading, Modal, Notice, Select, Tabs, Textarea } from '../components/ui';
import { DocumentPicker } from '../components/Attachments';

const FIELDS = ['{{firma}}', '{{firma_pelna}}', '{{osoba}}', '{{imie}}', '{{nazwisko}}', '{{stanowisko}}', '{{miasto}}', '{{nip}}', '{{operator}}', '{{data}}'];

function NewCampaign({ initial, onClose, onSent }: { initial?: { contractor_ids: number[]; desc: string } | null; onClose: () => void; onSent: (id: number) => void }) {
  const { toast, status, dicts } = useApp();
  const [v, setV] = useState<any>({
    name: '',
    subject: '',
    body: 'Szanowni Państwo,\n\n\n\nZ poważaniem\n{{operator}}',
    target_type: initial ? 'ids' : 'group',
    group_id: null,
    recipient_mode: 'primary',
    topic_id: null,
  });
  const [docs, setDocs] = useState<any[]>([]);
  const [picker, setPicker] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setV((p: any) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const target = () => (v.target_type === 'group' ? { type: 'group', group_id: v.group_id } : { type: 'ids', contractor_ids: initial?.contractor_ids ?? [] });
  const doPreview = async () => {
    setError(null);
    if (v.target_type === 'group' && !v.group_id) return setError('Wybierz grupę odbiorców.');
    try {
      setPreview(await post('/api/campaigns/preview', { subject: v.subject, body: v.body, target: target(), recipient_mode: v.recipient_mode }));
    } catch (e: any) {
      setError(e.message);
    }
  };
  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await post('/api/campaigns', { ...v, target: target(), target_desc: initial?.desc, document_ids: docs.map((d) => d.id) });
      toast(status.smtp_configured ? 'Wysyłka przekazana do kolejki.' : 'Wysyłka zapisana. Wiadomości czekają na konfigurację serwera SMTP.', status.smtp_configured ? 'ok' : 'warn');
      onSent(r.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Nowa korespondencja seryjna"
      onClose={onClose}
      width={900}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          <button type="button" className="btn" onClick={doPreview}><Eye size={14} /> Podgląd odbiorców i treści</button>
          <button type="button" className="btn primary" disabled={!preview || busy || !preview.with_email} onClick={send} title={!preview ? 'Najpierw wykonaj podgląd' : ''}>
            <Send size={14} /> Wyślij do {preview?.with_email ?? '…'} odbiorców
          </button>
        </>
      }
    >
      {!status.smtp_configured && <div className="mb8"><Notice kind="warn">Serwer SMTP nie jest skonfigurowany. Wiadomości zostaną zapisane w kolejce ze statusem „oczekuje na konfigurację” i nie zostaną wysłane, dopóki administrator nie uzupełni ustawień poczty.</Notice></div>}
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid">
        <label className="lbl req">Nazwa wysyłki</label>
        <div className="span3"><Input value={v.name} onChange={set('name')} placeholder="np. Zaproszenie na targi — marzec" /></div>
        <label className="lbl req">Odbiorcy</label>
        <Select value={v.target_type} onChange={(t) => (setV((p: any) => ({ ...p, target_type: t })), setPreview(null))} empty={null} options={[{ value: 'group', label: 'grupa kontrahentów' }, ...(initial ? [{ value: 'ids', label: initial.desc }] : [])]} />
        {v.target_type === 'group' ? (
          <>
            <label className="lbl">Grupa</label>
            <DictSelect dict="contractor_group" value={v.group_id} onChange={(g) => (setV((p: any) => ({ ...p, group_id: g })), setPreview(null))} />
          </>
        ) : (
          <><span /><span className="small muted">{initial?.contractor_ids.length} kontrahentów z rejestru</span></>
        )}
        <label className="lbl">Adresy</label>
        <Select value={v.recipient_mode} onChange={(m) => (setV((p: any) => ({ ...p, recipient_mode: m })), setPreview(null))} empty={null} options={[{ value: 'primary', label: 'główna osoba kontaktowa (lub e-mail firmy)' }, { value: 'contacts', label: 'wszystkie osoby kontaktowe z e-mailem' }, { value: 'contractor', label: 'e-mail firmy z kartoteki' }]} />
        <label className="lbl">Temat ze słownika</label>
        <DictSelect dict="corr_topic" value={v.topic_id} onChange={set('topic_id')} />
        <label className="lbl req">Temat wiadomości</label>
        <div className="span3"><Input value={v.subject} onChange={set('subject')} /></div>
        <label className="lbl req">Treść</label>
        <div className="span3"><Textarea rows={10} value={v.body} onChange={set('body')} /></div>
        <label className="lbl">Pola</label>
        <div className="span3 row wrap gap4">
          {FIELDS.map((f) => (
            <button type="button" key={f} className="btn sm" onClick={() => setV((p: any) => ({ ...p, body: p.body + f }))}>{f}</button>
          ))}
        </div>
        <label className="lbl">Załączniki</label>
        <div className="span3">
          <div className="row wrap">
            {docs.map((d, i) => (
              <span key={d.id} className="chip">{d.name}<button type="button" onClick={() => setDocs(docs.filter((_, j) => j !== i))}><Trash2 size={11} /></button></span>
            ))}
            <button type="button" className="btn sm" onClick={() => setPicker(true)}><FolderOpen size={13} /> Dodaj z rejestru dokumentów</button>
          </div>
        </div>
      </div>
      {preview && (
        <div className="mt12">
          <Notice kind={preview.without_email.length ? 'warn' : 'info'}>
            Odbiorców: {preview.total}; z adresem e-mail: <b>{preview.with_email}</b>
            {preview.without_email.length > 0 && <>; bez adresu (zostaną pominięci): {preview.without_email.slice(0, 10).join(', ')}{preview.without_email.length > 10 ? '…' : ''}</>}
          </Notice>
          {preview.samples.map((s: any, i: number) => (
            <div key={i} className="fieldset mt8">
              <div className="small muted">Do: {s.email}</div>
              <div><b>{s.subject}</b></div>
              <div style={{ whiteSpace: 'pre-wrap' }} className="small mt8">{s.body}</div>
            </div>
          ))}
        </div>
      )}
      {picker && <DocumentPicker onClose={() => setPicker(false)} onPick={(d) => (setDocs([...docs, d]), setPicker(false))} />}
    </Modal>
  );
}

function CampaignDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast } = useApp();
  const d = useApi<any>(`/api/campaigns/${id}`, [id]);
  useEffect(() => {
    const h = setInterval(d.reload, 5000);
    return () => clearInterval(h);
  }, [id]);
  if (!d.data) return <Modal title="Wysyłka" onClose={onClose}><Loading /></Modal>;
  const c = d.data;
  return (
    <Modal title={`Wysyłka: ${c.name}`} onClose={onClose} width={900} footer={<><button type="button" className="btn" onClick={async () => { await post('/api/outbox/process').catch((e) => toast(e.message, 'error')); d.reload(); }}>Przetwórz kolejkę teraz</button><button type="button" className="btn" onClick={onClose}>Zamknij</button></>}>
      <dl className="kv">
        <dt>Temat</dt><dd>{c.subject}</dd>
        <dt>Odbiorcy</dt><dd>{c.target_desc}</dd>
        <dt>Utworzył</dt><dd>{c.author}, {fmtDateTime(c.created_at)}</dd>
        <dt>Załączniki</dt><dd>{c.attachments.map((a: any) => a.filename).join(', ') || '—'}</dd>
      </dl>
      <table className="grid mt12">
        <thead><tr><th>Kontrahent</th><th>Osoba</th><th>E-mail</th><th>Status</th><th>Wysłano</th><th>Nr korespondencji</th><th>Błąd</th></tr></thead>
        <tbody>
          {c.recipients.map((r: any) => (
            <tr key={r.id}>
              <td>{r.contractor_name}</td><td>{r.contact_name}</td><td>{r.email}</td>
              <td><span className={`pill ${r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'danger' : r.status === 'skipped' ? '' : 'warn'}`}>{r.status_label}</span></td>
              <td className="nowrap">{fmtDateTime(r.sent_at)}</td><td className="nowrap">{r.corr_number}</td><td className="small">{r.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

const cols: Column<any>[] = [
  { key: 'created_at', label: 'Data', type: 'datetime', width: 125 },
  { key: 'name', label: 'Nazwa wysyłki', width: 220 },
  { key: 'subject', label: 'Temat', width: 220 },
  { key: 'target_desc', label: 'Odbiorcy', width: 200 },
  { key: 'author', label: 'Utworzył', width: 130, filter: 'select' },
  { key: 'total', label: 'Adresatów', type: 'int', width: 80, sum: true },
  { key: 'sent', label: 'Wysłano', type: 'int', width: 70, sum: true },
  { key: 'awaiting', label: 'Oczekuje', type: 'int', width: 70, sum: true },
  { key: 'failed', label: 'Błędy', type: 'int', width: 60, sum: true },
  { key: 'skipped', label: 'Pominięto', type: 'int', width: 75 },
];

export function CampaignsPage() {
  const loc = useLocation() as any;
  const initial = loc.state?.contractor_ids ? { contractor_ids: loc.state.contractor_ids, desc: loc.state.desc } : null;
  const list = useApi<any[]>('/api/campaigns');
  const [form, setForm] = useState(!!initial);
  const [detail, setDetail] = useState<number | null>(null);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Korespondencja seryjna</h1>
        <span className="small muted">Jedna wiadomość e-mail do grupy kontrahentów lub wyniku filtra rejestru; u każdego odbiorcy powstaje wpis korespondencji.</span>
      </div>
      <DataTable
        id="campaigns"
        title="Korespondencja seryjna"
        columns={cols}
        rows={list.data}
        loading={list.loading}
        error={list.error}
        onOpen={(r) => setDetail(r.id)}
        defaultSort={[{ key: 'created_at', dir: -1 }]}
        toolbar={<button className="btn primary" onClick={() => setForm(true)}><Plus size={14} /> Nowa wysyłka</button>}
        emptyText="Brak wysyłek seryjnych."
      />
      {form && <NewCampaign initial={initial} onClose={() => setForm(false)} onSent={(id) => (setForm(false), list.reload(), setDetail(id), window.history.replaceState({}, ''))} />}
      {detail && <CampaignDetail id={detail} onClose={() => (setDetail(null), list.reload())} />}
    </div>
  );
}
export { get, Tabs };
