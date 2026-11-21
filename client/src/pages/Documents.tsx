import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Upload, Eye, Download, Shield, Pencil, Archive, Trash2, FolderPlus, History, FileStack } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { del, get, post, put, upload } from '../lib/api';
import { fmtDate, fmtDateTime, fmtSize } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable } from '../components/DataTable';
import { Combo, ContractorPicker, DictSelect, Input, Loading, Modal, Notice, Select, Tabs, Textarea, Check } from '../components/ui';
import { canPreview } from '../components/Attachments';
import { documentColumns } from './columns';

function MetaFields({ v, set, folders }: { v: any; set: (k: string) => (x: any) => void; folders: any[] }) {
  const projects = useApi<any[]>('/api/projects');
  return (
    <div className="form-grid">
      <label className="lbl req">Nazwa</label>
      <div className="span3"><Input value={v.name} onChange={(e) => set('name')(e.target.value)} /></div>
      <label className="lbl">Opis</label>
      <div className="span3"><Textarea rows={2} value={v.description ?? ''} onChange={(e) => set('description')(e.target.value)} /></div>
      <label className="lbl">Segregator</label>
      <Select value={v.folder_id} onChange={set('folder_id')} options={folders.map((f) => ({ value: f.id, label: f.name }))} />
      <label className="lbl">Typ</label>
      <DictSelect dict="doc_type" value={v.type_id} onChange={set('type_id')} />
      <label className="lbl">Kontrahent</label>
      <ContractorPicker value={v.contractor_id} onChange={set('contractor_id')} />
      <label className="lbl">Projekt</label>
      <Combo items={(projects.data ?? []).map((p) => ({ id: p.id, label: p.name, sub: p.number }))} value={v.project_id} onChange={set('project_id')} />
      <label className="lbl">Ważny od</label>
      <Input type="date" value={v.valid_from ?? ''} onChange={(e) => set('valid_from')(e.target.value)} />
      <label className="lbl">Ważny do</label>
      <Input type="date" value={v.valid_to ?? ''} onChange={(e) => set('valid_to')(e.target.value)} />
    </div>
  );
}

function AddDocument({ folders, folderId, onClose, onSaved }: { folders: any[]; folderId: number | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [v, setV] = useState<any>({ name: '', description: '', folder_id: folderId, type_id: null, contractor_id: null, project_id: null, valid_from: '', valid_to: '', comment: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x }));
  const save = async () => {
    setError(null);
    if (!file) return setError('Wybierz plik dokumentu.');
    setBusy(true);
    try {
      await upload('/api/documents', [file], { ...v, name: v.name || file.name.replace(/\.[^.]+$/, '') });
      toast('Dodano dokument do rejestru.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Nowy dokument" onClose={onClose} width={820} onSubmit={save} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary" disabled={busy}>{busy ? 'Wysyłanie…' : 'Zapisz'}</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid mb8">
        <label className="lbl req">Plik</label>
        <div className="span3"><input type="file" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !v.name) set('name')(f.name.replace(/\.[^.]+$/, '')); }} aria-label="Plik dokumentu" /></div>
      </div>
      <MetaFields v={v} set={set} folders={folders.filter((f) => f.can_add)} />
      <p className="small muted mt8">Numer dokumentu nadawany jest automatycznie (DIAGNOS/D/…). Po dacie „ważny do” dokument przechodzi do archiwalnych.</p>
    </Modal>
  );
}

export function PermissionsEditor({ type, id, onClose }: { type: 'document' | 'folder'; id: number; onClose: () => void }) {
  const { operators, toast } = useApp();
  const deps = useApi<any[]>('/api/departments');
  const cur = useApi<any[]>(`/api/permissions/${type}/${id}`);
  const [entries, setEntries] = useState<any[] | null>(null);
  const list = entries ?? cur.data ?? [];
  const [add, setAdd] = useState<any>({ subject_type: 'department', subject_id: null, level: 'view' });
  const save = async () => {
    try {
      await put(`/api/permissions/${type}/${id}`, { entries: list });
      toast('Zapisano uprawnienia.');
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const subjOpts = add.subject_type === 'operator' ? operators.filter((o) => o.active).map((o) => ({ value: o.id, label: o.name })) : (deps.data ?? []).map((d) => ({ value: d.id, label: d.name }));
  const name = (e: any) => (e.subject_type === 'all' ? 'Wszyscy operatorzy' : e.subject_type === 'operator' ? operators.find((o) => o.id === e.subject_id)?.name : deps.data?.find((d) => d.id === e.subject_id)?.name) ?? e.subject_name;
  return (
    <Modal title={type === 'folder' ? 'Uprawnienia segregatora' : 'Uprawnienia dokumentu'} onClose={onClose} width={620} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button type="button" className="btn primary" onClick={save}>Zapisz uprawnienia</button></>}>
      <Notice kind="info">
        {type === 'document'
          ? 'Bez wpisów dokument dziedziczy uprawnienia segregatora. Gdy dodasz wpisy, dostęp mają tylko wskazani operatorzy i działy (oraz autor i administrator).'
          : 'Bez wpisów segregator jest otwarty: wszyscy mają podgląd, kierownicy edycję. Gdy dodasz wpisy, dostęp mają tylko wskazani (oraz autorzy dokumentów i administrator).'}
      </Notice>
      {cur.loading ? <Loading /> : (
        <table className="grid mt8">
          <thead><tr><th>Komu</th><th>Rodzaj</th><th>Poziom</th><th /></tr></thead>
          <tbody>
            {list.map((e, i) => (
              <tr key={i}><td>{name(e)}</td><td>{e.subject_type === 'department' ? 'dział' : e.subject_type === 'operator' ? 'operator' : 'wszyscy'}</td>
                <td><Select value={e.level} onChange={(l) => setEntries(list.map((x, j) => (j === i ? { ...x, level: l } : x)))} empty={null} options={[{ value: 'view', label: 'podgląd' }, { value: 'edit', label: 'edycja' }]} /></td>
                <td><button type="button" className="btn sm ghost danger" onClick={() => setEntries(list.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td></tr>
            ))}
            {!list.length && <tr><td colSpan={4} className="muted">Brak wpisów — {type === 'document' ? 'uprawnienia jak segregator' : 'segregator otwarty'}.</td></tr>}
          </tbody>
        </table>
      )}
      <div className="row mt8">
        <Select value={add.subject_type} onChange={(t) => setAdd({ ...add, subject_type: t, subject_id: null })} empty={null} options={[{ value: 'department', label: 'dział' }, { value: 'operator', label: 'operator' }, { value: 'all', label: 'wszyscy' }]} className="" />
        {add.subject_type !== 'all' && <Select value={add.subject_id} onChange={(s) => setAdd({ ...add, subject_id: s })} options={subjOpts} />}
        <Select value={add.level} onChange={(l) => setAdd({ ...add, level: l })} empty={null} options={[{ value: 'view', label: 'podgląd' }, { value: 'edit', label: 'edycja' }]} />
        <button type="button" className="btn" disabled={add.subject_type !== 'all' && !add.subject_id} onClick={() => setEntries([...list, { ...add, subject_id: add.subject_type === 'all' ? 0 : add.subject_id }])}>Dodaj</button>
      </div>
    </Modal>
  );
}

function DocPanel({ id, folders, onChanged }: { id: number; folders: any[]; onChanged: () => void }) {
  const { toast, confirm, isAdmin } = useApp();
  const d = useApi<any>(`/api/documents/${id}`, [id]);
  const [tab, setTab] = useState('info');
  const [edit, setEdit] = useState<any>(null);
  const [perm, setPerm] = useState(false);
  const verInp = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState('');
  if (!d.data) return <aside className="side-panel"><Loading /></aside>;
  const x = d.data;
  const canEdit = x.level === 'edit';
  const newVersion = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      await upload(`/api/documents/${id}/versions`, files, { comment });
      toast('Dodano nową wersję dokumentu.');
      setComment('');
      d.reload();
      onChanged();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <aside className="side-panel" style={{ width: 400 }}>
      <div className="sp-head">{x.number}</div>
      <div className="row wrap" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
        {canPreview(x.mime) && <a className="btn sm" href={`/api/documents/${id}/file?inline=1`} target="_blank" rel="noreferrer"><Eye size={13} /> Podgląd</a>}
        <a className="btn sm" href={`/api/documents/${id}/file`}><Download size={13} /> Pobierz</a>
        {canEdit && <button className="btn sm" onClick={() => setEdit({ ...x })}><Pencil size={13} /> Edytuj</button>}
        {canEdit && <button className="btn sm" onClick={() => setPerm(true)}><Shield size={13} /> Uprawnienia</button>}
        {canEdit && <button className="btn sm" onClick={async () => { await put(`/api/documents/${id}`, { ...x, archived: !x.archived }); d.reload(); onChanged(); }}><Archive size={13} /> {x.archived ? 'Przywróć' : 'Archiwizuj'}</button>}
        {isAdmin && <button className="btn sm danger" onClick={async () => { if (await confirm('Usunąć dokument wraz z historią wersji?', { ok: 'Usuń', danger: true })) { await del(`/api/documents/${id}`); onChanged(); } }}><Trash2 size={13} /></button>}
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'info', label: 'Dane' }, { key: 'ver', label: 'Wersje', count: x.versions.length }, { key: 'log', label: 'Rejestr zmian', count: x.log.length }]} />
      <div className="sp-body">
        {tab === 'info' && (
          <>
            <h3>{x.name}</h3>
            {x.description && <p className="small mt8" style={{ whiteSpace: 'pre-wrap' }}>{x.description}</p>}
            <dl className="kv mt8">
              <dt>Segregator</dt><dd>{x.folder_name}</dd>
              <dt>Typ</dt><dd>{x.type_name}</dd>
              <dt>Plik</dt><dd>{x.file_name} ({fmtSize(x.size)})</dd>
              <dt>Edycja</dt><dd>{x.current_version}</dd>
              <dt>Publikacja</dt><dd>{fmtDateTime(x.published_at)}</dd>
              <dt>Autor</dt><dd>{x.author_name}</dd>
              <dt>Ważność</dt><dd>{x.valid_from || x.valid_to ? `${fmtDate(x.valid_from) || '…'} – ${fmtDate(x.valid_to) || '…'}` : 'bezterminowo'} <span className={`pill ${x.validity === 'aktualny' ? 'ok' : 'warn'}`}>{x.validity}</span></dd>
              <dt>Kontrahent</dt><dd>{x.contractor_name}</dd>
              <dt>Projekt</dt><dd>{x.project_name}</dd>
              <dt>Twoje prawo</dt><dd>{canEdit ? 'edycja' : 'podgląd'}</dd>
            </dl>
            {x.mime?.startsWith('image/') && <img src={`/api/documents/${id}/file?inline=1`} alt={x.name} style={{ maxWidth: '100%', marginTop: 8, border: '1px solid var(--line)' }} />}
          </>
        )}
        {tab === 'ver' && (
          <>
            {canEdit && (
              <div className="col gap4 mb8">
                <Input placeholder="Opis zmian w nowej wersji" value={comment} onChange={(e) => setComment(e.target.value)} />
                <input ref={verInp} type="file" hidden onChange={(e) => newVersion(e.target.files)} />
                <button className="btn sm" onClick={() => verInp.current?.click()}><Upload size={13} /> Wgraj nową wersję</button>
              </div>
            )}
            <table className="grid">
              <thead><tr><th>Ed.</th><th>Data</th><th>Autor</th><th>Plik</th><th /></tr></thead>
              <tbody>
                {x.versions.map((v: any) => (
                  <tr key={v.id}><td>{v.version}</td><td className="nowrap small">{fmtDateTime(v.created_at)}</td><td className="small">{v.author}</td><td className="small">{v.original_name}<div className="xs muted">{v.comment}</div></td>
                    <td><a className="btn sm ghost" href={`/api/documents/${id}/file?version=${v.version}`} title="Pobierz tę wersję"><Download size={13} /></a></td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {tab === 'log' && (
          <table className="grid">
            <thead><tr><th>Kiedy</th><th>Kto</th><th>Czynność</th></tr></thead>
            <tbody>
              {x.log.map((l: any) => <tr key={l.id}><td className="nowrap small">{fmtDateTime(l.at)}</td><td className="small">{l.operator}</td><td className="small">{l.action}{l.version != null ? ` (ed. ${l.version})` : ''}{l.details ? <div className="xs muted">{l.details}</div> : null}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>
      {edit && (
        <Modal title="Dane dokumentu" onClose={() => setEdit(null)} width={820} onSubmit={async () => { try { await put(`/api/documents/${id}`, edit); toast('Zapisano.'); setEdit(null); d.reload(); onChanged(); } catch (e: any) { toast(e.message, 'error'); } }} footer={<><button type="button" className="btn" onClick={() => setEdit(null)}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
          <MetaFields v={edit} set={(k) => (val) => setEdit((p: any) => ({ ...p, [k]: val }))} folders={folders} />
        </Modal>
      )}
      {perm && <PermissionsEditor type="document" id={id} onClose={() => (setPerm(false), d.reload())} />}
    </aside>
  );
}

export function DocumentsPage() {
  const nav = useNavigate();
  const { isManager, toast } = useApp();
  const [state, setState] = useState<'current' | 'archived'>('current');
  const list = useApi<any[]>(`/api/documents?state=${state}`, [state]);
  const folders = useApi<any[]>('/api/doc-folders');
  const [folder, setFolder] = useState<number | null>(null);
  const [sel, setSel] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [folderPerm, setFolderPerm] = useState<number | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const rows = useMemo(() => (list.data ?? []).filter((d) => !folder || d.folder_id === folder), [list.data, folder]);
  // panel boczny znika, gdy wybrany dokument przestał istnieć na liście (np. został usunięty)
  useEffect(() => {
    if (sel && list.data && !list.data.some((d) => d.id === sel.id)) setSel(null);
  }, [list.data]);
  const reload = () => (list.reload(), folders.reload());
  return (
    <div className="page">
      <div className="page-head">
        <h1>Rejestr dokumentów</h1>
        <div className="btn-group">
          <button className={`btn ${state === 'current' ? 'active' : ''}`} onClick={() => setState('current')}>Aktualne</button>
          <button className={`btn ${state === 'archived' ? 'active' : ''}`} onClick={() => setState('archived')}>Archiwalne</button>
        </div>
      </div>
      <div className="split">
        <aside style={{ width: 210, borderRight: '1px solid var(--line)', overflow: 'auto', flexShrink: 0, background: 'var(--bg-subtle)' }}>
          <div className="nav-sec row">Segregatory <span className="grow" />{isManager && <button className="btn sm ghost icon" title="Nowy segregator" onClick={() => setNewFolder('')}><FolderPlus size={13} /></button>}</div>
          <a className={`nav-link ${folder === null ? 'active' : ''}`} href="#" onClick={(e) => (e.preventDefault(), setFolder(null))}>Wszystkie</a>
          {(folders.data ?? []).map((f) => (
            <div key={f.id} className={`nav-link ${folder === f.id ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFolder(f.id)}>
              <span className="grow ellipsis">{f.name}</span>
              {f.restricted && <Shield size={11} />}
              <span className="xs muted">{f.documents}</span>
              {isManager && f.level === 'edit' && <button className="btn sm ghost icon" title="Uprawnienia segregatora" onClick={(e) => (e.stopPropagation(), setFolderPerm(f.id))}><Shield size={11} /></button>}
            </div>
          ))}
        </aside>
        <div className="left">
          <DataTable
            id="documents"
            title="Rejestr dokumentów"
            columns={documentColumns}
            rows={rows}
            loading={list.loading}
            error={list.error}
            onReload={reload}
            selectedKey={sel?.id}
            onSelect={setSel}
            onOpen={(r) => window.open(`/api/documents/${r.id}/file${canPreview(r.mime) ? '?inline=1' : ''}`, '_blank')}
            defaultSort={[{ key: 'published_at', dir: -1 }]}
            searchText={(r) => `${r.description ?? ''} ${r.file_name}`}
            toolbar={
              <>
                <button className="btn primary" onClick={() => setAdding(true)}><Plus size={14} /> Nowy dokument</button>
                <button className="btn" onClick={() => nav('/szablony')}><FileStack size={14} /> Z szablonu</button>
              </>
            }
            emptyText={state === 'current' ? 'Brak aktualnych dokumentów.' : 'Brak dokumentów archiwalnych.'}
          />
        </div>
        {sel && <DocPanel id={sel.id} folders={folders.data ?? []} onChanged={() => (reload(), setSel((s: any) => (rows.find((r) => r.id === s?.id) ? s : null)))} />}
      </div>
      {adding && <AddDocument folders={folders.data ?? []} folderId={folder} onClose={() => setAdding(false)} onSaved={() => (setAdding(false), reload())} />}
      {folderPerm && <PermissionsEditor type="folder" id={folderPerm} onClose={() => (setFolderPerm(null), reload())} />}
      {newFolder !== null && (
        <Modal title="Nowy segregator" onClose={() => setNewFolder(null)} width={420} onSubmit={async () => { try { await post('/api/doc-folders', { name: newFolder }); setNewFolder(null); folders.reload(); } catch (e: any) { toast(e.message, 'error'); } }} footer={<><button type="button" className="btn" onClick={() => setNewFolder(null)}>Anuluj</button><button className="btn primary">Dodaj</button></>}>
          <Input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Nazwa segregatora" />
        </Modal>
      )}
    </div>
  );
}
export { get, Check, History };
