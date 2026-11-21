import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, MessageSquarePlus, CalendarPlus, Mails, Upload } from 'lucide-react';
import { post } from '../lib/api';
import { fmtDate, fmtDateTime, fmtMoney, fmtNip, today, addDays } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable, type Column } from '../components/DataTable';
import { Check, Modal, Notice, Select, StatusDot } from '../components/ui';
import { ContractorFields, emptyContractor } from './ContractorFields';
import { CorrespondenceForm } from './CorrespondenceForm';
import { TaskForm } from './TaskForm';

export function contractorColumns(customFields: any[]): Column<any>[] {
  return [
    { key: 'short_name', label: 'Skrót', width: 130 },
    { key: 'name', label: 'Pełna nazwa', width: 260 },
    { key: 'status_name', label: 'Status', width: 110, filter: 'select', render: (r) => (r.status_name ? <span className="ellipsis"><StatusDot color={r.status_color} />{r.status_name}</span> : null) },
    { key: 'type_name', label: 'Typ', width: 110, filter: 'select' },
    { key: 'group_name', label: 'Grupa', width: 110, filter: 'select' },
    { key: 'subgroup_name', label: 'Podgrupa', width: 110, filter: 'select' },
    { key: 'phone', label: 'Telefon', width: 110 },
    { key: 'email', label: 'E-mail', width: 170 },
    { key: 'postal_code', label: 'Kod', width: 64 },
    { key: 'city', label: 'Miasto', width: 120, filter: 'select', groupText: (v) => (v ? String(v).toUpperCase() : '(brak)') },
    { key: 'street', label: 'Adres', width: 170 },
    { key: 'voivodeship', label: 'Województwo', width: 120, filter: 'select' },
    { key: 'nip', label: 'NIP', width: 110, value: (r) => (r.nip ? fmtNip(r.nip) : '') },
    { key: 'contacts_text', label: 'Osoby kontaktowe', width: 180 },
    { key: 'owner_name', label: 'Prowadzący', width: 130, filter: 'select' },
    { key: 'source_name', label: 'Źródło kontaktu', width: 120, filter: 'select' },
    { key: 'price_group_name', label: 'Grupa cenowa', width: 100, filter: 'select', hidden: true },
    { key: 'contract_no', label: 'Nr umowy', width: 100, hidden: true },
    { key: 'is_key', label: 'Kluczowy', type: 'bool', width: 70, filter: 'select' },
    { key: 'last_contact', label: 'Ostatni kontakt', type: 'date', width: 105 },
    { key: 'credit_limit', label: 'Limit kredytu', type: 'money', width: 110, hidden: true, sum: true },
    { key: 'groups_text', label: 'Grupy (członkostwo)', width: 150, hidden: true },
    { key: 'notes', label: 'Uwagi', width: 200, hidden: true },
    { key: 'regon', label: 'REGON', width: 100, hidden: true },
    { key: 'created_at', label: 'Data dodania', type: 'date', width: 100, hidden: true },
    { key: 'active', label: 'Aktywny', type: 'bool', width: 70, hidden: true, filter: 'select' },
    ...customFields
      .filter((f) => f.active)
      .map(
        (f): Column<any> => ({
          key: `cf_${f.code}`,
          label: f.label,
          hidden: true,
          type: f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'bool' ? 'bool' : 'text',
          filter: f.type === 'select' || f.type === 'bool' ? 'select' : 'text',
          value: (r) => r.custom?.[f.code] ?? '',
          width: 120,
        }),
      ),
  ];
}

export function NewContractorDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: number) => void }) {
  const { user, toast, reloadContractors } = useApp();
  const [v, setV] = useState<any>(emptyContractor(user!.id));
  const [error, setError] = useState<string | null>(null);
  const [dupConfirm, setDupConfirm] = useState(false);
  const save = async () => {
    setError(null);
    if (!v.name.trim()) return setError('Podaj pełną nazwę kontrahenta.');
    try {
      const r = await post('/api/contractors', { ...v, confirm_duplicate: dupConfirm });
      toast('Dodano kontrahenta.');
      reloadContractors();
      onSaved(r.id);
    } catch (e: any) {
      if (e.status === 409) {
        setDupConfirm(true);
        setError(`${e.message} Kliknij „Zapisz” ponownie, aby mimo to dodać kontrahenta.`);
      } else setError(e.message);
    }
  };
  return (
    <Modal
      title="Nowy kontrahent"
      onClose={onClose}
      width={900}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button className="btn primary">Zapisz</button>
        </>
      }
    >
      {error && <div className="mb8"><Notice kind={dupConfirm ? 'warn' : 'error'}>{error}</Notice></div>}
      <ContractorFields v={v} setV={setV} />
    </Modal>
  );
}

function Preview({ c, onCorr, onTask }: { c: any; onCorr: () => void; onTask: () => void }) {
  const nav = useNavigate();
  const contacts = useApi<any[]>(`/api/contacts?contractor_id=${c.id}`, [c.id]);
  return (
    <aside className="side-panel">
      <div className="sp-head">{c.short_name || c.name}</div>
      <div className="sp-body">
        <div className="row wrap mb8">
          <button className="btn sm primary" onClick={() => nav(`/kontrahenci/${c.id}`)}>
            <FolderOpen size={13} /> Kartoteka
          </button>
          <button className="btn sm" onClick={onCorr}>
            <MessageSquarePlus size={13} /> Korespondencja
          </button>
          <button className="btn sm" onClick={onTask}>
            <CalendarPlus size={13} /> Zadanie
          </button>
        </div>
        <dl className="kv">
          <dt>Pełna nazwa</dt>
          <dd>{c.name}</dd>
          <dt>Adres</dt>
          <dd>
            {c.street}
            {c.street && <br />}
            {c.postal_code} {c.city}
          </dd>
          <dt>Telefon</dt>
          <dd>{[c.phone, c.phone2].filter(Boolean).join(', ')}</dd>
          <dt>E-mail</dt>
          <dd>{c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}</dd>
          <dt>NIP</dt>
          <dd>{fmtNip(c.nip)}</dd>
          <dt>Status</dt>
          <dd>{c.status_name}</dd>
          <dt>Prowadzący</dt>
          <dd>{c.owner_name}</dd>
          <dt>Ostatni kontakt</dt>
          <dd>{c.last_contact ? fmtDateTime(c.last_contact) : 'brak'}</dd>
          {c.credit_limit != null && (
            <>
              <dt>Limit kredytu</dt>
              <dd>{fmtMoney(c.credit_limit)}</dd>
            </>
          )}
        </dl>
        {c.notes && <p className="small mt8" style={{ whiteSpace: 'pre-wrap' }}>{c.notes}</p>}
        <div className="section-title">Osoby kontaktowe</div>
        <table className="grid">
          <tbody>
            {(contacts.data ?? []).filter((p) => p.active).map((p) => (
              <tr key={p.id}>
                <td>
                  <div>{`${p.first_name ?? ''} ${p.last_name}`.trim()}</div>
                  <div className="xs muted">{p.position}</div>
                </td>
                <td className="small">
                  {p.phone || p.mobile}
                  <div>{p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}</div>
                </td>
              </tr>
            ))}
            {!contacts.loading && !(contacts.data ?? []).length && (
              <tr>
                <td className="muted">Brak osób kontaktowych.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </aside>
  );
}

export function ContractorsPage() {
  const nav = useNavigate();
  const [showInactive, setShowInactive] = useState(false);
  const [onlyKey, setOnlyKey] = useState(false);
  const [noContact, setNoContact] = useState<number | null>(null);
  const list = useApi<any[]>(`/api/contractors${showInactive ? '?all=1' : ''}`, [showInactive]);
  const fields = useApi<any[]>('/api/custom-fields');
  const [sel, setSel] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [corr, setCorr] = useState<number | null>(null);
  const [task, setTask] = useState<number | null>(null);
  const filtered = useRef<any[]>([]);
  const cols = useMemo(() => contractorColumns(fields.data ?? []), [fields.data]);
  const rows = useMemo(() => {
    let r = list.data ?? [];
    if (onlyKey) r = r.filter((x) => x.is_key);
    if (noContact) {
      const lim = addDays(today(), -noContact);
      r = r.filter((x) => !x.last_contact || x.last_contact.slice(0, 10) < lim);
    }
    return r;
  }, [list.data, onlyKey, noContact]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Rejestr kontrahentów</h1>
      </div>
      <div className="split">
        <div className="left">
          <DataTable
            id="contractors"
            title="Kontrahenci"
            columns={cols}
            rows={rows}
            loading={list.loading}
            error={list.error}
            onReload={list.reload}
            selectedKey={sel?.id}
            onSelect={setSel}
            onOpen={(r) => nav(`/kontrahenci/${r.id}`)}
            defaultGroup={['city']}
            defaultSort={[{ key: 'short_name', dir: 1 }]}
            searchText={(r) => `${r.contacts_search} ${r.nip ?? ''} ${(r.phone ?? '').replace(/\D/g, '')}`}
            rowClass={(r) => (!r.active ? 'muted-row' : '')}
            onFiltered={(r) => (filtered.current = r)}
            emptyText="Brak kontrahentów. Dodaj pierwszego kontrahenta lub zaimportuj bazę z pliku XLSX/CSV."
            toolbar={
              <>
                <button className="btn primary" onClick={() => setAdding(true)}>
                  <Plus size={14} /> Nowy kontrahent
                </button>
                <button className="btn" onClick={() => nav('/import')}>
                  <Upload size={14} /> Import
                </button>
                <button
                  className="btn"
                  title="Wyślij jedną wiadomość e-mail do kontrahentów widocznych w rejestrze (wynik filtra)"
                  onClick={() => nav('/korespondencja-seryjna', { state: { contractor_ids: filtered.current.map((r) => r.id), desc: `Wynik filtra rejestru kontrahentów (${filtered.current.length})` } })}
                >
                  <Mails size={14} /> Korespondencja seryjna do wyniku
                </button>
              </>
            }
            filters={
              <>
                <Check checked={onlyKey} onChange={setOnlyKey}>tylko kluczowi</Check>
                <span className="fl">
                  bez kontaktu od
                  <Select
                    value={noContact}
                    onChange={setNoContact}
                    empty="(dowolnie)"
                    options={[7, 14, 30, 60, 90, 180, 365].map((d) => ({ value: d, label: `${d} dni` }))}
                  />
                </span>
                <Check checked={showInactive} onChange={setShowInactive}>pokaż nieaktywnych</Check>
              </>
            }
          />
        </div>
        {sel && <Preview c={sel} onCorr={() => setCorr(sel.id)} onTask={() => setTask(sel.id)} />}
      </div>
      {adding && <NewContractorDialog onClose={() => setAdding(false)} onSaved={(id) => (setAdding(false), nav(`/kontrahenci/${id}`))} />}
      {corr && <CorrespondenceForm defaults={{ contractor_id: corr }} onClose={() => setCorr(null)} onSaved={() => (setCorr(null), list.reload())} />}
      {task && <TaskForm defaults={{ contractor_id: task }} onClose={() => setTask(null)} onSaved={() => setTask(null)} />}
    </div>
  );
}
export { fmtDate };
