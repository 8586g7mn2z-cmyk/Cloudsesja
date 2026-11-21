import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, MessageSquarePlus, CalendarPlus, Eye, Download } from 'lucide-react';
import { del, get, post, put } from '../lib/api';
import { fmtDate, fmtMinutes, fmtMoney, fmtSize } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable } from '../components/DataTable';
import { ContractorPicker, DictSelect, ErrorBox, Input, Loading, Modal, Notice, OperatorSelect, Select, Tabs, Textarea } from '../components/ui';
import { Attachments, canPreview } from '../components/Attachments';
import { correspondenceColumns, documentColumns, projectColumns, taskColumns } from './columns';
import { CorrespondenceForm } from './CorrespondenceForm';
import { TaskForm } from './TaskForm';

export function ProjectForm({ id, defaults, onClose, onSaved }: { id?: number; defaults?: { contractor_id?: number }; onClose: () => void; onSaved: (id: number) => void }) {
  const { user, toast } = useApp();
  const [v, setV] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (id) get(`/api/projects/${id}`).then(setV).catch((e) => setError(e.message));
    else setV({ name: '', contractor_id: defaults?.contractor_id ?? null, manager_id: user!.id, start_date: '', end_date: '', status_id: null, budget: '', description: '', stages: [] });
  }, [id]);
  if (!v) return <Modal title="Projekt" onClose={onClose}>{error ? <Notice kind="error">{error}</Notice> : <Loading />}</Modal>;
  const set = (k: string) => (e: any) => setV((p: any) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const setStage = (i: number, k: string, val: any) => setV((p: any) => ({ ...p, stages: p.stages.map((s: any, j: number) => (j === i ? { ...s, [k]: val } : s)) }));
  const save = async () => {
    setError(null);
    try {
      const r = id ? await put(`/api/projects/${id}`, v) : await post('/api/projects', v);
      toast('Zapisano projekt.');
      onSaved(r.id);
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal title={id ? `Projekt: ${v.name}` : 'Nowy projekt'} onClose={onClose} width={860} onSubmit={save} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid">
        <label className="lbl req">Nazwa projektu</label>
        <div className="span3"><Input value={v.name} onChange={set('name')} /></div>
        <label className="lbl">Kontrahent</label>
        <div className="span3"><ContractorPicker value={v.contractor_id} onChange={set('contractor_id')} /></div>
        <label className="lbl">Opiekun</label>
        <OperatorSelect value={v.manager_id} onChange={set('manager_id')} />
        <label className="lbl">Status</label>
        <DictSelect dict="project_status" value={v.status_id} onChange={set('status_id')} />
        <label className="lbl">Rozpoczęcie</label>
        <Input type="date" value={v.start_date ?? ''} onChange={set('start_date')} />
        <label className="lbl">Zakończenie</label>
        <Input type="date" value={v.end_date ?? ''} onChange={set('end_date')} />
        <label className="lbl">Budżet [zł]</label>
        <Input type="number" step="0.01" value={v.budget ?? ''} onChange={set('budget')} />
        <span /><span />
        <label className="lbl">Opis</label>
        <div className="span3"><Textarea rows={3} value={v.description ?? ''} onChange={set('description')} /></div>
      </div>
      <div className="section-title">Etapy projektu</div>
      <table className="grid">
        <thead><tr><th style={{ width: 30 }}>Lp.</th><th>Nazwa etapu</th><th style={{ width: 150 }}>Od</th><th style={{ width: 150 }}>Do</th><th style={{ width: 140 }}>Stan</th><th style={{ width: 32 }} /></tr></thead>
        <tbody>
          {v.stages.map((s: any, i: number) => (
            <tr key={s.id ?? `n${i}`}>
              <td>{i + 1}</td>
              <td><Input value={s.name} onChange={(e) => setStage(i, 'name', e.target.value)} aria-label="Nazwa etapu" /></td>
              <td><Input type="date" value={s.start_date ?? ''} onChange={(e) => setStage(i, 'start_date', e.target.value)} aria-label="Etap od" /></td>
              <td><Input type="date" value={s.end_date ?? ''} onChange={(e) => setStage(i, 'end_date', e.target.value)} aria-label="Etap do" /></td>
              <td><Select value={s.status} onChange={(x) => setStage(i, 'status', x)} empty={null} options={['planowany', 'w toku', 'zakończony'].map((x) => ({ value: x, label: x }))} /></td>
              <td><button type="button" className="btn sm ghost danger" onClick={() => setV((p: any) => ({ ...p, stages: p.stages.filter((_: any, j: number) => j !== i) }))}><Trash2 size={13} /></button></td>
            </tr>
          ))}
          {!v.stages.length && <tr><td colSpan={6} className="muted">Brak etapów.</td></tr>}
        </tbody>
      </table>
      <button type="button" className="btn sm mt8" onClick={() => setV((p: any) => ({ ...p, stages: [...p.stages, { name: '', start_date: '', end_date: '', status: 'planowany' }] }))}><Plus size={13} /> Dodaj etap</button>
    </Modal>
  );
}

export function ProjectsPage() {
  const nav = useNavigate();
  const list = useApi<any[]>('/api/projects');
  const [form, setForm] = useState(false);
  return (
    <div className="page">
      <div className="page-head"><h1>Projekty</h1></div>
      <DataTable id="projects" title="Projekty" columns={projectColumns} rows={list.data} loading={list.loading} error={list.error} onOpen={(r) => nav(`/projekty/${r.id}`)} toolbar={<button className="btn primary" onClick={() => setForm(true)}><Plus size={14} /> Nowy projekt</button>} emptyText="Brak projektów." />
      {form && <ProjectForm onClose={() => setForm(false)} onSaved={(id) => (setForm(false), nav(`/projekty/${id}`))} />}
    </div>
  );
}

export function ProjectCard() {
  const { id: idStr } = useParams();
  const id = Number(idStr);
  const nav = useNavigate();
  const { isManager, confirm, toast } = useApp();
  const p = useApi<any>(`/api/projects/${id}`, [id]);
  const corr = useApi<any[]>(`/api/correspondence?project_id=${id}`, [id]);
  const tasks = useApi<any[]>(`/api/tasks?project_id=${id}&archived=1`, [id]);
  const docs = useApi<any[]>(`/api/documents?project_id=${id}`, [id]);
  const time = useApi<any[]>(`/api/time-entries?project_id=${id}`, [id]);
  const [tab, setTab] = useState('stages');
  const [modal, setModal] = useState<any>(null);
  if (p.error) return <ErrorBox error={p.error} onRetry={p.reload} />;
  if (!p.data) return <Loading />;
  const d = p.data;
  const corrMin = (corr.data ?? []).reduce((s, k) => s + k.duration_sec / 60, 0);
  const taskMin = (time.data ?? []).reduce((s, e) => s + e.minutes, 0);
  return (
    <div className="page">
      <div className="card-head">
        <button className="btn icon ghost" onClick={() => nav('/projekty')} title="Wróć"><ArrowLeft size={16} /></button>
        <div className="grow">
          <h1>Projekt: {d.name}</h1>
          <div className="small muted">{d.number} · {d.contractor_name ? <a href={`/kontrahenci/${d.contractor_id}`} onClick={(e) => (e.preventDefault(), nav(`/kontrahenci/${d.contractor_id}`))}>{d.contractor_name}</a> : 'bez kontrahenta'} · opiekun: {d.manager_name ?? '—'} · {d.status_name ?? 'bez statusu'} · {fmtDate(d.start_date)} – {fmtDate(d.end_date)}{d.budget != null ? ` · budżet ${fmtMoney(d.budget)}` : ''}</div>
        </div>
        <button className="btn" onClick={() => setModal({ type: 'edit' })}>Edytuj</button>
        <button className="btn" onClick={() => setModal({ type: 'corr' })}><MessageSquarePlus size={14} /> Korespondencja</button>
        <button className="btn" onClick={() => setModal({ type: 'task' })}><CalendarPlus size={14} /> Zadanie</button>
        {isManager && <button className="btn danger" onClick={async () => { if (await confirm('Usunąć projekt?', { ok: 'Usuń', danger: true })) { try { await del(`/api/projects/${id}`); nav('/projekty'); } catch (e: any) { toast(e.message, 'error'); } } }}><Trash2 size={14} /></button>}
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'stages', label: 'Etapy', count: d.stages.length },
        { key: 'corr', label: 'Korespondencja', count: corr.data?.length },
        { key: 'tasks', label: 'Zadania', count: tasks.data?.length },
        { key: 'att', label: 'Załączniki', count: d.attachments.length + (docs.data?.length ?? 0) },
        { key: 'time', label: 'Czas pracy' },
      ]} />
      <div className="page-body">
        {tab === 'stages' && (
          <div className="page-scroll">
            {d.description && <p style={{ whiteSpace: 'pre-wrap' }}>{d.description}</p>}
            <table className="grid">
              <thead><tr><th>Lp.</th><th>Etap</th><th>Od</th><th>Do</th><th>Stan</th><th className="num">Korespondencja</th><th className="num">Zadania</th></tr></thead>
              <tbody>
                {d.stages.map((s: any, i: number) => (
                  <tr key={s.id}><td>{i + 1}</td><td>{s.name}</td><td>{fmtDate(s.start_date)}</td><td>{fmtDate(s.end_date)}</td><td><span className={`pill ${s.status === 'zakończony' ? 'ok' : s.status === 'w toku' ? 'warn' : ''}`}>{s.status}</span></td>
                    <td className="num">{(corr.data ?? []).filter((k) => k.stage_id === s.id).length}</td><td className="num">{(tasks.data ?? []).filter((t) => t.stage_id === s.id).length}</td></tr>
                ))}
                {!d.stages.length && <tr><td colSpan={7} className="muted">Projekt nie ma zdefiniowanych etapów (Edytuj → Etapy projektu).</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'corr' && <DataTable id="prj-corr" title={`Korespondencja — ${d.name}`} columns={correspondenceColumns} rows={corr.data} loading={corr.loading} onOpen={(r) => setModal({ type: 'corr', id: r.id })} toolbar={<button className="btn primary" onClick={() => setModal({ type: 'corr' })}><Plus size={14} /> Nowa</button>} />}
        {tab === 'tasks' && <DataTable id="prj-tasks" title={`Zadania — ${d.name}`} columns={taskColumns} rows={tasks.data} loading={tasks.loading} onOpen={(r) => setModal({ type: 'task', id: r.id })} rowClass={(r) => (r.overdue ? 'alert' : '')} toolbar={<button className="btn primary" onClick={() => setModal({ type: 'task' })}><Plus size={14} /> Nowe</button>} />}
        {tab === 'att' && (
          <div className="page-scroll">
            <div className="section-title" style={{ marginTop: 0 }}>Załączniki projektu</div>
            <Attachments ownerType="project" ownerId={id} items={d.attachments} onChange={p.reload} allowToDocument />
            <div className="section-title">Z rejestru dokumentów</div>
            <table className="grid">
              <thead><tr><th>Nr</th><th>Nazwa</th><th>Segregator</th><th className="num">Rozmiar</th><th>Edycja</th><th /></tr></thead>
              <tbody>
                {(docs.data ?? []).map((x) => (
                  <tr key={x.id}><td>{x.number}</td><td>{x.name}</td><td>{x.folder_name}</td><td className="num">{fmtSize(x.size)}</td><td>{x.current_version}</td>
                    <td className="nowrap">{canPreview(x.mime) && <a className="btn sm ghost" target="_blank" rel="noreferrer" href={`/api/documents/${x.id}/file?inline=1`}><Eye size={13} /></a>}<a className="btn sm ghost" href={`/api/documents/${x.id}/file`}><Download size={13} /></a></td></tr>
                ))}
                {!(docs.data ?? []).length && <tr><td colSpan={6} className="muted">Brak dokumentów przypisanych do projektu.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'time' && (
          <div className="page-scroll">
            <p>Czas z korespondencji: <b>{fmtMinutes(corrMin) || '0 h'}</b> · z ewidencji zadań: <b>{fmtMinutes(taskMin) || '0 h'}</b> · razem: <b>{fmtMinutes(corrMin + taskMin) || '0 h'}</b></p>
            <table className="grid">
              <thead><tr><th>Data</th><th>Operator</th><th>Zadanie</th><th className="num">Czas</th><th>Opis</th></tr></thead>
              <tbody>
                {(time.data ?? []).map((e) => <tr key={e.id}><td>{fmtDate(e.work_date)}</td><td>{e.operator}</td><td>{e.task_title}</td><td className="num">{fmtMinutes(e.minutes)}</td><td>{e.note}</td></tr>)}
                {!(time.data ?? []).length && <tr><td colSpan={5} className="muted">Brak wpisów ewidencji czasu.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modal?.type === 'edit' && <ProjectForm id={id} onClose={() => setModal(null)} onSaved={() => (setModal(null), p.reload())} />}
      {modal?.type === 'corr' && <CorrespondenceForm id={modal.id} defaults={{ contractor_id: d.contractor_id, project_id: id }} onClose={() => setModal(null)} onSaved={() => (setModal(null), corr.reload())} />}
      {modal?.type === 'task' && <TaskForm id={modal.id} defaults={{ contractor_id: d.contractor_id, project_id: id }} onClose={() => setModal(null)} onSaved={() => (setModal(null), tasks.reload())} />}
    </div>
  );
}
export { documentColumns };
