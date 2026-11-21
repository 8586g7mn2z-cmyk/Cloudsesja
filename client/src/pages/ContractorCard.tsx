import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, MessageSquarePlus, Plus, Save, Trash2, ExternalLink, MapPin, Eye, Download, FileStack, Star } from 'lucide-react';
import { del, get, post, put } from '../lib/api';
import { fmtDate, fmtDateTime, fmtMoney, fmtNip, fmtSize } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable } from '../components/DataTable';
import { Check, ErrorBox, Input, Loading, Modal, Notice, Progress, Select, StatusDot, Tabs, Textarea } from '../components/ui';
import { Attachments, canPreview } from '../components/Attachments';
import { ContractorFields } from './ContractorFields';
import { CorrespondenceForm } from './CorrespondenceForm';
import { TaskForm } from './TaskForm';
import { correspondenceColumns, orderColumns, projectColumns, saleColumns, taskColumns } from './columns';
import { OrderForm } from './Orders';
import { SaleForm } from './Sales';
import { ProjectForm } from './Projects';
import { GenerateDialog } from './Templates';

function ContactDialog({ contractorId, contact, onClose, onSaved }: { contractorId: number; contact?: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [v, setV] = useState<any>(contact ?? { first_name: '', last_name: '', position: '', phone: '', mobile: '', email: '', notes: '', is_primary: 0, active: 1 });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: any) => setV((p: any) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    setError(null);
    try {
      if (contact) await put(`/api/contacts/${contact.id}`, v);
      else await post(`/api/contractors/${contractorId}/contacts`, v);
      toast(contact ? 'Zapisano osobę kontaktową.' : 'Dodano osobę kontaktową.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal title={contact ? 'Osoba kontaktowa' : 'Nowa osoba kontaktowa'} onClose={onClose} width={620} onSubmit={save} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid">
        <label className="lbl" htmlFor="p-fn">Imię</label>
        <Input id="p-fn" value={v.first_name} onChange={set('first_name')} />
        <label className="lbl req" htmlFor="p-ln">Nazwisko</label>
        <Input id="p-ln" value={v.last_name} onChange={set('last_name')} />
        <label className="lbl" htmlFor="p-pos">Stanowisko</label>
        <div className="span3"><Input id="p-pos" value={v.position} onChange={set('position')} /></div>
        <label className="lbl" htmlFor="p-ph">Telefon</label>
        <Input id="p-ph" value={v.phone} onChange={set('phone')} />
        <label className="lbl" htmlFor="p-mob">Telefon komórkowy</label>
        <Input id="p-mob" value={v.mobile} onChange={set('mobile')} />
        <label className="lbl" htmlFor="p-em">E-mail</label>
        <div className="span3"><Input id="p-em" type="email" value={v.email} onChange={set('email')} /></div>
        <label className="lbl" htmlFor="p-no">Uwagi</label>
        <div className="span3"><Textarea id="p-no" rows={3} value={v.notes} onChange={set('notes')} /></div>
        <label className="lbl">Osoba główna</label>
        <Check checked={!!v.is_primary} onChange={(c) => set('is_primary')(c ? 1 : 0)}>główna osoba kontaktowa</Check>
        <label className="lbl">Aktywna</label>
        <Check checked={!!v.active} onChange={(c) => set('active')(c ? 1 : 0)}>aktywna</Check>
      </div>
    </Modal>
  );
}

function AddressDialog({ contractorId, addr, onClose, onSaved }: { contractorId: number; addr?: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [v, setV] = useState<any>(addr ?? { kind: 'korespondencyjny', street: '', postal_code: '', city: '', voivodeship: '', country: 'Polska', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: any) => setV((p: any) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    try {
      if (addr) await put(`/api/addresses/${addr.id}`, v);
      else await post(`/api/contractors/${contractorId}/addresses`, v);
      toast('Zapisano adres.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal title="Adres" onClose={onClose} width={520} onSubmit={save} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid one">
        <label className="lbl req">Rodzaj</label>
        <Select value={v.kind} onChange={set('kind')} empty={null} options={[{ value: 'korespondencyjny', label: 'korespondencyjny' }, { value: 'dostawy', label: 'dostawy' }, { value: 'inny', label: 'inny' }]} />
        <label className="lbl">Ulica i numer</label>
        <Input value={v.street} onChange={set('street')} />
        <label className="lbl">Kod pocztowy</label>
        <Input value={v.postal_code} onChange={set('postal_code')} />
        <label className="lbl">Miasto</label>
        <Input value={v.city} onChange={set('city')} />
        <label className="lbl">Województwo</label>
        <Input value={v.voivodeship} onChange={set('voivodeship')} />
        <label className="lbl">Kraj</label>
        <Input value={v.country} onChange={set('country')} />
        <label className="lbl">Uwagi</label>
        <Input value={v.notes} onChange={set('notes')} />
      </div>
    </Modal>
  );
}

const mapUrl = (a: { street?: string; postal_code?: string; city?: string; country?: string }) =>
  encodeURIComponent([a.street, a.postal_code, a.city, a.country].filter(Boolean).join(', '));

export function ContractorCard() {
  const { id: idStr } = useParams();
  const id = Number(idStr);
  const nav = useNavigate();
  const { toast, confirm, isManager, reloadContractors, dicts } = useApp();
  const [tab, setTab] = useState('details');
  const card = useApi<any>(`/api/contractors/${id}`, [id]);
  const [v, setV] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dupConfirm, setDupConfirm] = useState(false);
  const contacts = useApi<any[]>(`/api/contacts?contractor_id=${id}`, [id]);
  const [related, setRelated] = useState(false);
  const corr = useApi<any[]>(`/api/correspondence?contractor_id=${id}${related ? '&related=1' : ''}`, [id, related]);
  const tasks = useApi<any[]>(`/api/tasks?contractor_id=${id}&archived=1`, [id]);
  const projects = useApi<any[]>(`/api/projects?contractor_id=${id}`, [id]);
  const orders = useApi<any[]>(`/api/orders?contractor_id=${id}`, [id]);
  const sales = useApi<any[]>(`/api/sales?contractor_id=${id}`, [id]);
  const atts = useApi<any[]>(`/api/contractors/${id}/attachments`, [id]);
  const directAtts = useApi<any[]>(`/api/attachments/contractor/${id}`, [id]);
  const notes = useApi<any[]>(`/api/contractors/${id}/notes`, [id]);
  const [modal, setModal] = useState<any>(null);
  const [noteText, setNoteText] = useState('');
  const [noteKind, setNoteKind] = useState('notatka');

  useEffect(() => {
    if (card.data) {
      setV({ ...card.data, credit_limit: card.data.credit_limit ?? '' });
      setDirty(false);
    }
  }, [card.data]);

  if (card.error) return <ErrorBox error={card.error} onRetry={card.reload} />;
  if (!v) return <Loading />;
  const c = card.data;
  const setVD = (fn: (p: any) => any) => {
    setV(fn);
    setDirty(true);
  };
  const save = async () => {
    setError(null);
    try {
      await put(`/api/contractors/${id}`, { ...v, confirm_duplicate: dupConfirm });
      toast('Zapisano kartotekę kontrahenta.');
      setDupConfirm(false);
      reloadContractors();
      card.reload();
    } catch (e: any) {
      if (e.status === 409) {
        setDupConfirm(true);
        setError(`${String(e.message).replace(/\.+$/, '')}. Kliknij „Zapisz” ponownie, aby zapisać mimo to.`);
      } else setError(e.message);
    }
  };
  const remove = async () => {
    if (!(await confirm(`Usunąć kontrahenta „${c.name}”?`, { ok: 'Usuń', danger: true }))) return;
    try {
      await del(`/api/contractors/${id}`);
      toast('Usunięto kontrahenta.');
      reloadContractors();
      nav('/kontrahenci');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const addNote = async () => {
    if (!noteText.trim()) return;
    const body = noteText;
    setNoteText(''); // od razu, żeby drugi klik nie dodał tej samej notatki ponownie
    try {
      await post(`/api/contractors/${id}/notes`, { body, kind: noteKind });
      notes.reload();
    } catch (e: any) {
      setNoteText(body);
      toast(e.message, 'error');
    }
  };
  const openTasks = (tasks.data ?? []).filter((t) => t.is_open);
  const allAtts = atts.data ?? [];
  const sources = [
    { key: 'kartoteka', label: 'Dodane do kartoteki' },
    { key: 'korespondencja', label: 'Z korespondencji' },
    { key: 'projekt', label: 'Z projektów' },
    { key: 'dokumenty', label: 'Z rejestru dokumentów' },
  ];
  const memberGroups = (dicts.contractor_group ?? []).filter((g) => (c.groups ?? []).includes(g.id));

  return (
    <div className="page">
      <div className="card-head">
        <button className="btn icon ghost" title="Wróć do rejestru" onClick={() => nav('/kontrahenci')}>
          <ArrowLeft size={16} />
        </button>
        <div className="grow">
          <h1 className="ellipsis">
            {c.is_key ? <Star size={14} color="var(--accent)" style={{ marginRight: 4 }} /> : null}
            Kartoteka: {c.short_name || c.name}
          </h1>
          <div className="small muted ellipsis">
            {c.name} · {c.city} · NIP {fmtNip(c.nip) || '—'} · {c.status_name ? <><StatusDot color={c.status_color} />{c.status_name}</> : 'bez statusu'} · prowadzący: {c.owner_name ?? '—'}
            {!c.active && <span className="pill warn" style={{ marginLeft: 6 }}>nieaktywny</span>}
          </div>
        </div>
        <button className="btn" onClick={() => setModal({ type: 'corr' })}>
          <MessageSquarePlus size={14} /> Nowa korespondencja
        </button>
        <button className="btn" onClick={() => setModal({ type: 'task' })}>
          <CalendarPlus size={14} /> Nowe zadanie
        </button>
        <button className="btn" onClick={() => setModal({ type: 'generate' })}>
          <FileStack size={14} /> Dokument z szablonu
        </button>
        {isManager && (
          <button className="btn danger" onClick={remove}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'details', label: 'Szczegóły' },
          { key: 'addresses', label: 'Adresy', count: (c.addresses?.length ?? 0) + 1 },
          { key: 'contacts', label: 'Osoby', count: contacts.data?.filter((p) => p.active).length },
          { key: 'corr', label: 'Korespondencja', count: corr.data?.length },
          { key: 'tasks', label: 'Zadania', count: tasks.data?.length },
          { key: 'projects', label: 'Projekty', count: projects.data?.length },
          { key: 'orders', label: 'Zamówienia', count: orders.data?.length },
          { key: 'sales', label: 'Sprzedaż', count: sales.data?.length },
          { key: 'att', label: 'Załączniki', count: allAtts.length },
          { key: 'notes', label: 'Notatki', count: notes.data?.length },
          { key: 'groups', label: 'Grupy', count: memberGroups.length + (c.group_id ? 1 : 0) },
          { key: 'www', label: 'WWW' },
          { key: 'map', label: 'Lokalizacja' },
        ]}
      />
      <div className="page-body">
        {tab === 'details' && (
          <div className="split">
            <div className="page-scroll" style={{ maxWidth: 980 }}>
              {error && <div className="mb8"><Notice kind={dupConfirm ? 'warn' : 'error'}>{error}</Notice></div>}
              <form onSubmit={(e) => (e.preventDefault(), save())}>
                <ContractorFields v={v} setV={setVD} id={id} />
                <div className="row mt12">
                  <button className="btn primary" disabled={!dirty}>
                    <Save size={14} /> Zapisz zmiany
                  </button>
                  {dirty && (
                    <button type="button" className="btn" onClick={() => card.reload()}>
                      Odrzuć zmiany
                    </button>
                  )}
                  <span className="small muted">Dodano {fmtDateTime(c.created_at)}{c.updated_at ? ` · zmieniono ${fmtDateTime(c.updated_at)}` : ''}</span>
                </div>
              </form>
            </div>
            <aside className="side-panel" style={{ width: 380 }}>
              <div className="sp-head row">
                <span className="grow">Zadania w toku ({openTasks.length})</span>
                <button className="btn sm" onClick={() => setModal({ type: 'task' })}>
                  <Plus size={12} /> Dodaj
                </button>
              </div>
              <table className="grid">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Postęp</th>
                    <th>Zadanie</th>
                    <th>Termin</th>
                  </tr>
                </thead>
                <tbody>
                  {openTasks.map((t) => (
                    <tr key={t.id} onDoubleClick={() => setModal({ type: 'task', id: t.id })} style={{ cursor: 'pointer', color: t.overdue ? 'var(--accent)' : undefined }} onClick={() => setModal({ type: 'task', id: t.id })}>
                      <td>
                        <div className="row gap4">
                          <Progress value={t.progress} />
                          <span className="xs">{t.progress}%</span>
                        </div>
                      </td>
                      <td className="small">{t.title}</td>
                      <td className="small nowrap">{fmtDateTime(t.start_at)}</td>
                    </tr>
                  ))}
                  {!openTasks.length && (
                    <tr>
                      <td colSpan={3} className="muted">
                        Brak otwartych zadań.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="sp-body">
                <div className="section-title">Podsumowanie</div>
                <dl className="kv">
                  <dt>Ostatni kontakt</dt>
                  <dd>{c.last_contact ? fmtDateTime(c.last_contact) : 'brak'}</dd>
                  <dt>Sprzedaż netto</dt>
                  <dd>{fmtMoney((sales.data ?? []).reduce((s, x) => s + x.net_total, 0))}</dd>
                  <dt>Zamówienia</dt>
                  <dd>{orders.data?.length ?? 0}</dd>
                  <dt>Oddziały</dt>
                  <dd>{(c.branches ?? []).map((b: any) => <div key={b.id}><a href={`/kontrahenci/${b.id}`} onClick={(e) => (e.preventDefault(), nav(`/kontrahenci/${b.id}`))}>{b.name}</a></div>)}{!(c.branches ?? []).length && '—'}</dd>
                </dl>
              </div>
            </aside>
          </div>
        )}
        {tab === 'addresses' && (
          <div className="page-scroll">
            <div className="row mb8">
              <button className="btn primary" onClick={() => setModal({ type: 'address' })}>
                <Plus size={14} /> Dodaj adres
              </button>
            </div>
            <table className="grid">
              <thead>
                <tr><th>Rodzaj</th><th>Ulica</th><th>Kod</th><th>Miasto</th><th>Województwo</th><th>Kraj</th><th>Uwagi</th><th /></tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>siedziba</b></td><td>{c.street}</td><td>{c.postal_code}</td><td>{c.city}</td><td>{c.voivodeship}</td><td>{c.country}</td><td className="muted small">edycja w zakładce Szczegóły</td>
                  <td><a className="btn sm ghost" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${mapUrl(c)}`}><MapPin size={13} /></a></td>
                </tr>
                {(c.addresses ?? []).map((a: any) => (
                  <tr key={a.id} onDoubleClick={() => setModal({ type: 'address', addr: a })}>
                    <td>{a.kind}</td><td>{a.street}</td><td>{a.postal_code}</td><td>{a.city}</td><td>{a.voivodeship}</td><td>{a.country}</td><td>{a.notes}</td>
                    <td className="nowrap">
                      <button className="btn sm ghost" onClick={() => setModal({ type: 'address', addr: a })}>Edytuj</button>
                      <button className="btn sm ghost danger" onClick={async () => { if (await confirm('Usunąć adres?', { ok: 'Usuń', danger: true })) { await del(`/api/addresses/${a.id}`); card.reload(); } }}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'contacts' && (
          <div className="page-scroll">
            <div className="row mb8">
              <button className="btn primary" onClick={() => setModal({ type: 'contact' })}>
                <Plus size={14} /> Nowa osoba kontaktowa
              </button>
            </div>
            <table className="grid">
              <thead>
                <tr><th>Imię i nazwisko</th><th>Stanowisko</th><th>Telefon</th><th>Komórka</th><th>E-mail</th><th>Uwagi</th><th /></tr>
              </thead>
              <tbody>
                {(contacts.data ?? []).map((p) => (
                  <tr key={p.id} onDoubleClick={() => setModal({ type: 'contact', contact: p })} className={p.active ? '' : 'muted'}>
                    <td>{p.is_primary ? <Star size={12} color="var(--accent)" /> : null} {`${p.first_name ?? ''} ${p.last_name}`.trim()} {!p.active && <span className="pill">nieaktywna</span>}</td>
                    <td>{p.position}</td><td>{p.phone}</td><td>{p.mobile}</td><td>{p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}</td><td className="small">{p.notes}</td>
                    <td className="nowrap">
                      <button className="btn sm ghost" onClick={() => setModal({ type: 'contact', contact: p })}>Edytuj</button>
                      <button className="btn sm ghost danger" title="Usuń" onClick={async () => {
                        if (!(await confirm('Usunąć osobę kontaktową? Jeśli jest powiązana z korespondencją, zostanie oznaczona jako nieaktywna.', { ok: 'Usuń', danger: true }))) return;
                        const r = await del(`/api/contacts/${p.id}`);
                        if (r.deactivated) toast('Osoba ma powiązaną korespondencję — oznaczono jako nieaktywną.', 'warn');
                        contacts.reload();
                      }}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
                {!(contacts.data ?? []).length && <tr><td colSpan={7} className="muted">Brak osób kontaktowych.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'corr' && (
          <DataTable
            id="card-corr"
            title={`Korespondencja — ${c.short_name || c.name}`}
            columns={correspondenceColumns}
            rows={corr.data}
            loading={corr.loading}
            error={corr.error}
            onOpen={(r) => setModal({ type: 'corr', id: r.id })}
            onSelect={() => undefined}
            toolbar={
              <>
                <button className="btn primary" onClick={() => setModal({ type: 'corr' })}><Plus size={14} /> Nowa korespondencja</button>
                <Check checked={related} onChange={setRelated}>także jako kontrahent powiązany</Check>
              </>
            }
            emptyText="Brak korespondencji z tym kontrahentem."
          />
        )}
        {tab === 'tasks' && (
          <DataTable id="card-tasks" title={`Zadania — ${c.short_name || c.name}`} columns={taskColumns} rows={tasks.data} loading={tasks.loading} error={tasks.error} onOpen={(r) => setModal({ type: 'task', id: r.id })} rowClass={(r) => (r.overdue ? 'alert' : !r.is_open ? 'muted-row' : '')} toolbar={<button className="btn primary" onClick={() => setModal({ type: 'task' })}><Plus size={14} /> Nowe zadanie</button>} />
        )}
        {tab === 'projects' && (
          <DataTable id="card-projects" title={`Projekty — ${c.short_name || c.name}`} columns={projectColumns} rows={projects.data} loading={projects.loading} onOpen={(r) => nav(`/projekty/${r.id}`)} toolbar={<button className="btn primary" onClick={() => setModal({ type: 'project' })}><Plus size={14} /> Nowy projekt</button>} />
        )}
        {tab === 'orders' && (
          <DataTable id="card-orders" title={`Zamówienia — ${c.short_name || c.name}`} columns={orderColumns} rows={orders.data} loading={orders.loading} onOpen={(r) => setModal({ type: 'order', id: r.id })} toolbar={<button className="btn primary" onClick={() => setModal({ type: 'order' })}><Plus size={14} /> Nowe zamówienie</button>} />
        )}
        {tab === 'sales' && (
          <DataTable id="card-sales" title={`Sprzedaż — ${c.short_name || c.name}`} columns={saleColumns} rows={sales.data} loading={sales.loading} onOpen={(r) => setModal({ type: 'sale', id: r.id })} toolbar={<button className="btn primary" onClick={() => setModal({ type: 'sale' })}><Plus size={14} /> Nowa transakcja</button>} />
        )}
        {tab === 'att' && (
          <div className="page-scroll">
            <div className="section-title" style={{ marginTop: 0 }}>Dodaj do kartoteki</div>
            <Attachments ownerType="contractor" ownerId={id} items={directAtts.data ?? []} onChange={() => (directAtts.reload(), atts.reload())} allowToDocument />
            {sources.slice(1).map((s) => {
              const items = allAtts.filter((a) => a.source === s.key);
              return (
                <div key={s.key}>
                  <div className="section-title">{s.label} ({items.length})</div>
                  <table className="grid">
                    <thead><tr><th>Nazwa</th><th>Pochodzenie</th><th className="num">Rozmiar</th><th>Autor</th><th>Data</th><th /></tr></thead>
                    <tbody>
                      {items.map((a) => {
                        const href = a.source === 'dokumenty' ? `/api/documents/${a.document_id}/file` : `/api/attachments/${a.id}/file`;
                        return (
                          <tr key={`${s.key}${a.id}`}>
                            <td>{a.title ?? a.name}{a.title && <div className="xs muted">{a.name}</div>}</td>
                            <td className="small">{a.source_label}</td>
                            <td className="num">{fmtSize(a.size)}</td>
                            <td>{a.author}</td>
                            <td className="nowrap">{fmtDate(a.created_at)}</td>
                            <td className="nowrap">
                              {canPreview(a.mime) && <a className="btn sm ghost" target="_blank" rel="noreferrer" href={`${href}?inline=1`} title="Podgląd"><Eye size={13} /></a>}
                              <a className="btn sm ghost" href={href} title="Pobierz"><Download size={13} /></a>
                            </td>
                          </tr>
                        );
                      })}
                      {!items.length && <tr><td colSpan={6} className="muted">Brak.</td></tr>}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
        {tab === 'notes' && (
          <div className="page-scroll" style={{ maxWidth: 900 }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Select value={noteKind} onChange={setNoteKind} empty={null} options={[{ value: 'notatka', label: 'Notatka' }, { value: 'komentarz', label: 'Komentarz' }]} className="" />
              <Textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Treść notatki lub komentarza…" onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) addNote(); }} />
              <button className="btn primary" onClick={addNote} disabled={!noteText.trim()}>Dodaj</button>
            </div>
            <ul className="list-plain mt12">
              {(notes.data ?? []).map((n) => (
                <li key={n.id}>
                  <div className="row small muted">
                    <span className={`pill ${n.kind === 'komentarz' ? 'navy' : ''}`}>{n.kind}</span>
                    <span>{n.author}</span>
                    <span>{fmtDateTime(n.created_at)}</span>
                    <span className="grow" />
                    <button className="btn sm ghost danger" title="Usuń" onClick={async () => { if (await confirm('Usunąć notatkę?', { ok: 'Usuń', danger: true })) { try { await del(`/api/notes/${n.id}`); notes.reload(); } catch (e: any) { toast(e.message, 'error'); } } }}><Trash2 size={12} /></button>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.body}</div>
                </li>
              ))}
              {!(notes.data ?? []).length && <li className="muted">Brak notatek.</li>}
            </ul>
          </div>
        )}
        {tab === 'groups' && (
          <div className="page-scroll" style={{ maxWidth: 700 }}>
            <dl className="kv">
              <dt>Grupa główna</dt><dd>{c.group_name ?? '—'}</dd>
              <dt>Podgrupa</dt><dd>{c.subgroup_name ?? '—'}</dd>
              <dt>Typ</dt><dd>{c.type_name ?? '—'}</dd>
              <dt>Grupa cenowa</dt><dd>{c.price_group_name ?? '—'}</dd>
            </dl>
            <div className="section-title">Kontrahent należy do grup</div>
            <ul className="list-plain">
              {memberGroups.map((g) => <li key={g.id}>{g.name}</li>)}
              {!memberGroups.length && <li className="muted">Brak dodatkowych grup. Członkostwo ustawisz w zakładce Szczegóły.</li>}
            </ul>
            <p className="small muted mt8">Grupy służą m.in. do wyboru odbiorców korespondencji seryjnej i do raportu braku aktywności.</p>
          </div>
        )}
        {tab === 'www' && (
          <div className="page-scroll">
            {c.www ? (
              <p>Strona WWW: <a href={/^https?:\/\//.test(c.www) ? c.www : `https://${c.www}`} target="_blank" rel="noreferrer">{c.www} <ExternalLink size={12} /></a></p>
            ) : <p className="muted">Nie podano adresu strony WWW (pole „WWW” w zakładce Szczegóły).</p>}
            {c.email && <p>E-mail: <a href={`mailto:${c.email}`}>{c.email}</a></p>}
          </div>
        )}
        {tab === 'map' && (
          <div className="page-scroll">
            {c.city || c.street ? (
              <>
                <p>Adres siedziby: <b>{[c.street, `${c.postal_code ?? ''} ${c.city ?? ''}`.trim(), c.country].filter(Boolean).join(', ')}</b></p>
                <div className="row">
                  <a className="btn" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${mapUrl(c)}`}><MapPin size={14} /> Pokaż w OpenStreetMap</a>
                  <a className="btn" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${mapUrl(c)}`}><MapPin size={14} /> Pokaż w Mapach Google</a>
                </div>
                {(c.addresses ?? []).map((a: any) => (
                  <p key={a.id} className="mt8">Adres {a.kind}: {[a.street, a.postal_code, a.city].filter(Boolean).join(', ')} — <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${mapUrl(a)}`}>mapa</a></p>
                ))}
              </>
            ) : <p className="muted">Uzupełnij adres w zakładce Szczegóły, aby wyświetlić lokalizację na mapie.</p>}
          </div>
        )}
      </div>
      {modal?.type === 'contact' && <ContactDialog contractorId={id} contact={modal.contact} onClose={() => setModal(null)} onSaved={() => (setModal(null), contacts.reload(), card.reload())} />}
      {modal?.type === 'address' && <AddressDialog contractorId={id} addr={modal.addr} onClose={() => setModal(null)} onSaved={() => (setModal(null), card.reload())} />}
      {modal?.type === 'corr' && <CorrespondenceForm id={modal.id} defaults={{ contractor_id: id }} onClose={() => setModal(null)} onSaved={() => (setModal(null), corr.reload(), card.reload(), atts.reload())} />}
      {modal?.type === 'task' && <TaskForm id={modal.id} defaults={{ contractor_id: id }} onClose={() => setModal(null)} onSaved={() => (setModal(null), tasks.reload())} />}
      {modal?.type === 'order' && <OrderForm id={modal.id} defaults={{ contractor_id: id }} onClose={() => setModal(null)} onSaved={() => (setModal(null), orders.reload())} />}
      {modal?.type === 'sale' && <SaleForm id={modal.id} defaults={{ contractor_id: id }} onClose={() => setModal(null)} onSaved={() => (setModal(null), sales.reload())} />}
      {modal?.type === 'project' && <ProjectForm defaults={{ contractor_id: id }} onClose={() => setModal(null)} onSaved={(pid) => (setModal(null), nav(`/projekty/${pid}`))} />}
      {modal?.type === 'generate' && <GenerateDialog contractorId={id} onClose={() => setModal(null)} onDone={() => (setModal(null), atts.reload())} />}
    </div>
  );
}
export { useMemo };
