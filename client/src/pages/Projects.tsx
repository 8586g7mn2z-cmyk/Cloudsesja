import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, MessageSquarePlus, CalendarPlus, Eye, Download, FilePlus } from 'lucide-react';
import { del, get, post, put } from '../lib/api';
import { fmtDate, fmtDateTime, fmtMinutes, fmtMoney, fmtSize, today } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable } from '../components/DataTable';
import { ContractorPicker, DictSelect, ErrorBox, Input, Loading, Modal, Notice, OperatorSelect, Select, Tabs, Textarea } from '../components/ui';
import { Attachments, canPreview } from '../components/Attachments';
import { CASE_KINDS, CASE_RESULTS, correspondenceColumns, daysToDeadline, documentColumns, projectColumns, taskColumns } from './columns';
import { History } from '../components/History';
import { AddDocument } from './Documents';
import { CorrespondenceForm } from './CorrespondenceForm';
import { TaskForm } from './TaskForm';

export function ProjectForm({ id, defaults, onClose, onSaved }: { id?: number; defaults?: { contractor_id?: number; kind?: string }; onClose: () => void; onSaved: (id: number) => void }) {
  const { user, toast } = useApp();
  const [v, setV] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (id) get(`/api/projects/${id}`).then((d) => setV({ ...d, submit_deadline: d.submit_deadline ? d.submit_deadline.slice(0, 16) : '' })).catch((e) => setError(e.message));
    else setV({ kind: defaults?.kind ?? 'zapytanie', name: '', ref_no: '', source: '', contractor_id: defaults?.contractor_id ?? null, manager_id: user!.id, received_date: today(), submit_deadline: '', result: '', result_date: '', start_date: '', end_date: '', status_id: null, budget: '', description: '', stages: [] });
  }, [id]);
  if (!v) return <Modal title="Zapytanie / przetarg" onClose={onClose}>{error ? <Notice kind="error">{error}</Notice> : <Loading />}</Modal>;
  const set = (k: string) => (e: any) => setV((p: any) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const setStage = (i: number, k: string, val: any) => setV((p: any) => ({ ...p, stages: p.stages.map((s: any, j: number) => (j === i ? { ...s, [k]: val } : s)) }));
  const save = async () => {
    setError(null);
    try {
      const r = id ? await put(`/api/projects/${id}`, v) : await post('/api/projects', v);
      toast('Zapisano.');
      onSaved(r.id);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const tender = v.kind === 'przetarg';
  return (
    <Modal title={id ? `${CASE_KINDS[v.kind] ?? 'Sprawa'}: ${v.name}` : 'Nowe zapytanie / przetarg'} onClose={onClose} width={860} onSubmit={save} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid">
        <label className="lbl req">Rodzaj</label>
        <Select value={v.kind} onChange={set('kind')} empty={null} options={Object.entries(CASE_KINDS).map(([value, label]) => ({ value, label }))} />
        <label className="lbl">Status</label>
        <DictSelect dict="project_status" value={v.status_id} onChange={set('status_id')} />
        <label className="lbl req" htmlFor="case-name">Przedmiot</label>
        <div className="span3"><Input id="case-name" value={v.name} onChange={set('name')} placeholder={tender ? 'np. Dostawa analizatorów dla szpitala powiatowego' : 'czego dotyczy zapytanie'} /></div>
        <label className="lbl">{tender ? 'Zamawiający' : 'Kontrahent'}</label>
        <div className="span3"><ContractorPicker value={v.contractor_id} onChange={set('contractor_id')} /></div>
        <label className="lbl" htmlFor="case-ref">{tender ? 'Znak postępowania' : 'Znak sprawy'}</label>
        <Input id="case-ref" value={v.ref_no ?? ''} onChange={set('ref_no')} placeholder={tender ? 'np. ZP/12/2026' : 'numer nadany przez klienta'} />
        <label className="lbl" htmlFor="case-src">Źródło</label>
        <Input id="case-src" value={v.source ?? ''} onChange={set('source')} placeholder={tender ? 'np. platforma e-Zamówienia' : 'np. e-mail, telefon, formularz'} />
        <label className="lbl">Data wpływu</label>
        <Input type="date" value={v.received_date ?? ''} onChange={set('received_date')} />
        <label className="lbl">Termin składania ofert</label>
        <Input type="datetime-local" value={v.submit_deadline ?? ''} onChange={set('submit_deadline')} />
        <label className="lbl">Opiekun</label>
        <OperatorSelect value={v.manager_id} onChange={set('manager_id')} />
        <label className="lbl">Wartość szacunkowa [zł]</label>
        <Input type="number" step="0.01" min={0} value={v.budget ?? ''} onChange={set('budget')} />
        <label className="lbl">Wynik</label>
        <Select value={v.result ?? ''} onChange={(x) => set('result')(x ?? '')} empty="(w toku)" options={CASE_RESULTS.map((x) => ({ value: x, label: x }))} />
        <label className="lbl">Data rozstrzygnięcia</label>
        <Input type="date" value={v.result_date ?? ''} onChange={set('result_date')} />
        <label className="lbl">Opis / wymagania</label>
        <div className="span3"><Textarea rows={3} value={v.description ?? ''} onChange={set('description')} /></div>
      </div>
      <p className="small muted mt8">Po podaniu terminu składania ofert opiekun dostaje zadanie z przypomnieniem dzień wcześniej. Dokumentację dodaje się w kartotece sprawy, w zakładce „Dokumentacja”.</p>
      <div className="section-title">Etapy (opcjonalnie)</div>
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
              <td><button type="button" className="btn sm ghost danger" title="Usuń etap" onClick={() => setV((p: any) => ({ ...p, stages: p.stages.filter((_: any, j: number) => j !== i) }))}><Trash2 size={13} /></button></td>
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
  const [form, setForm] = useState<string | null>(null);
  const [kind, setKind] = useState('');
  const [scope, setScope] = useState('open');
  const rows = (list.data ?? []).filter((r) => {
    if (kind && r.kind !== kind) return false;
    if (scope === 'open') return !r.result;
    if (scope === 'soon') {
      const d = daysToDeadline(r);
      return d != null && d >= 0 && d <= 14;
    }
    if (scope === 'closed') return !!r.result;
    return true;
  });
  return (
    <div className="page">
      <div className="page-head"><h1>Zapytania i przetargi</h1></div>
      <DataTable
        id="cases"
        title="Zapytania i przetargi"
        columns={projectColumns}
        rows={list.data ? rows : null}
        loading={list.loading}
        error={list.error}
        onOpen={(r) => nav(`/projekty/${r.id}`)}
        rowClass={(r) => { const d = daysToDeadline(r); return d != null && d < 0 ? 'alert' : r.result ? 'muted-row' : ''; }}
        defaultSort={[{ key: 'received_date', dir: -1 }]}
        toolbar={<>
          <button className="btn primary" onClick={() => setForm('zapytanie')}><Plus size={14} /> Nowe zapytanie</button>
          <button className="btn" onClick={() => setForm('przetarg')}><Plus size={14} /> Nowy przetarg</button>
        </>}
        filters={<>
          <span className="fl">Rodzaj <Select value={kind} onChange={(x) => setKind(x ?? '')} empty="(wszystkie)" options={Object.entries(CASE_KINDS).map(([value, label]) => ({ value, label }))} /></span>
          <span className="fl">Pokaż <Select value={scope} onChange={(x) => setScope(x ?? 'all')} empty={null} options={[{ value: 'open', label: 'w toku' }, { value: 'soon', label: 'termin ofert w ciągu 14 dni' }, { value: 'closed', label: 'rozstrzygnięte' }, { value: 'all', label: 'wszystkie' }]} /></span>
        </>}
        emptyText="Brak zapytań i przetargów spełniających warunki."
      />
      {form && <ProjectForm defaults={{ kind: form }} onClose={() => setForm(null)} onSaved={(id) => (setForm(null), nav(`/projekty/${id}`))} />}
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
  const folders = useApi<any[]>('/api/doc-folders');
  const time = useApi<any[]>(`/api/time-entries?project_id=${id}`, [id]);
  const [tab, setTab] = useState('summary');
  const [modal, setModal] = useState<any>(null);
  if (p.error) return <ErrorBox error={p.error} onRetry={p.reload} />;
  if (!p.data) return <Loading />;
  const d = p.data;
  const corrMin = (corr.data ?? []).reduce((s, k) => s + k.duration_sec / 60, 0);
  const taskMin = (time.data ?? []).reduce((s, e) => s + e.minutes, 0);
  const left = daysToDeadline(d);
  const label = CASE_KINDS[d.kind] ?? 'Sprawa';
  const defaultFolder = (folders.data ?? []).find((f) => f.name === (d.kind === 'przetarg' ? 'Przetargi' : 'Zapytania ofertowe') && f.can_add)?.id ?? null;
  const openRef = (r: any) => (r.kind === 'correspondence' ? setModal({ type: 'corr', id: r.id }) : r.kind === 'task' ? setModal({ type: 'task', id: r.id }) : r.kind === 'document' ? window.open(`/api/documents/${r.id}/file`, '_blank') : undefined);
  return (
    <div className="page">
      <div className="card-head">
        <button className="btn icon ghost" onClick={() => nav('/projekty')} title="Wróć do rejestru"><ArrowLeft size={16} /></button>
        <div className="grow">
          <h1>{label}: {d.name}</h1>
          <div className="small muted">
            {d.number}{d.ref_no ? ` · znak ${d.ref_no}` : ''} · {d.contractor_name ? <a href={`/kontrahenci/${d.contractor_id}`} onClick={(e) => (e.preventDefault(), nav(`/kontrahenci/${d.contractor_id}`))}>{d.contractor_name}</a> : 'bez kontrahenta'} · opiekun: {d.manager_name ?? '—'}
            {d.status_name ? ` · ${d.status_name}` : ''}{d.result ? ` · wynik: ${d.result}` : ''}
          </div>
        </div>
        <button className="btn" onClick={() => setModal({ type: 'edit' })}>Edytuj</button>
        <button className="btn primary" onClick={() => setModal({ type: 'doc' })}><FilePlus size={14} /> Dokument</button>
        <button className="btn" onClick={() => setModal({ type: 'corr' })}><MessageSquarePlus size={14} /> Korespondencja</button>
        <button className="btn" onClick={() => setModal({ type: 'task' })}><CalendarPlus size={14} /> Zadanie</button>
        {isManager && <button className="btn danger" title="Usuń sprawę" onClick={async () => { if (await confirm(`Usunąć: ${d.name}?`, { ok: 'Usuń', danger: true })) { try { await del(`/api/projects/${id}`); nav('/projekty'); } catch (e: any) { toast(e.message, 'error'); } } }}><Trash2 size={14} /></button>}
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'summary', label: 'Przebieg' },
        { key: 'docs', label: 'Dokumentacja', count: d.attachments.length + (docs.data?.length ?? 0) },
        { key: 'corr', label: 'Korespondencja', count: corr.data?.length },
        { key: 'tasks', label: 'Zadania', count: tasks.data?.length },
        { key: 'history', label: 'Historia' },
        { key: 'time', label: 'Czas pracy' },
      ]} />
      <div className="page-body">
        {tab === 'summary' && (
          <div className="page-scroll">
            <dl className="case-facts">
              <div><dt>Rodzaj</dt><dd>{label}</dd></div>
              <div><dt>Status</dt><dd>{d.status_name ?? '—'}</dd></div>
              <div><dt>Data wpływu</dt><dd>{fmtDate(d.received_date) || '—'}</dd></div>
              <div><dt>Termin składania ofert</dt><dd className={left != null && left <= 3 ? 'deadline-soon' : ''}>{d.submit_deadline ? fmtDateTime(d.submit_deadline) : '—'}{left != null && <span className="small"> ({left < 0 ? `${-left} dni po terminie` : left === 0 ? 'dziś' : `za ${left} dni`})</span>}</dd></div>
              <div><dt>Źródło</dt><dd>{d.source || '—'}</dd></div>
              <div><dt>Wartość szacunkowa</dt><dd>{d.budget != null ? fmtMoney(d.budget) : '—'}</dd></div>
              <div><dt>Wynik</dt><dd>{d.result || 'w toku'}</dd></div>
              <div><dt>Data rozstrzygnięcia</dt><dd>{fmtDate(d.result_date) || '—'}</dd></div>
            </dl>
            {d.description && <><div className="section-title">Opis / wymagania</div><p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{d.description}</p></>}
            <div className="section-title">Etapy</div>
            <table className="grid">
              <thead><tr><th>Lp.</th><th>Etap</th><th>Od</th><th>Do</th><th>Stan</th><th className="num">Korespondencja</th><th className="num">Zadania</th></tr></thead>
              <tbody>
                {d.stages.map((s: any, i: number) => (
                  <tr key={s.id}><td>{i + 1}</td><td>{s.name}</td><td>{fmtDate(s.start_date)}</td><td>{fmtDate(s.end_date)}</td><td><span className={`pill ${s.status === 'zakończony' ? 'ok' : s.status === 'w toku' ? 'warn' : ''}`}>{s.status}</span></td>
                    <td className="num">{(corr.data ?? []).filter((k) => k.stage_id === s.id).length}</td><td className="num">{(tasks.data ?? []).filter((t) => t.stage_id === s.id).length}</td></tr>
                ))}
                {!d.stages.length && <tr><td colSpan={7} className="muted">Bez podziału na etapy (można je dodać w „Edytuj”).</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'docs' && (
          <div className="page-scroll">
            <div className="row mb8">
              <div className="section-title" style={{ margin: 0 }}>Dokumenty w rejestrze (z wersjami, ważnością i uprawnieniami)</div>
              <span className="grow" />
              <button className="btn primary sm" onClick={() => setModal({ type: 'doc' })}><FilePlus size={13} /> Dodaj dokument</button>
            </div>
            <table className="grid">
              <thead><tr><th>Nr</th><th>Nazwa</th><th>Typ</th><th>Segregator</th><th>Dodano</th><th>Autor</th><th className="num">Rozmiar</th><th>Wersja</th><th /></tr></thead>
              <tbody>
                {(docs.data ?? []).map((x) => (
                  <tr key={x.id}><td className="nowrap">{x.number}</td><td>{x.name}</td><td>{x.type_name}</td><td>{x.folder_name}</td><td className="nowrap">{fmtDate(x.published_at)}</td><td>{x.author_name}</td><td className="num">{fmtSize(x.size)}</td><td>{x.current_version}</td>
                    <td className="nowrap">{canPreview(x.mime) && <a className="btn sm ghost" title="Podgląd" target="_blank" rel="noreferrer" href={`/api/documents/${x.id}/file?inline=1`}><Eye size={13} /></a>}<a className="btn sm ghost" title="Pobierz" href={`/api/documents/${x.id}/file`}><Download size={13} /></a></td></tr>
                ))}
                {!(docs.data ?? []).length && <tr><td colSpan={9} className="muted">Brak dokumentów. Dodaj treść zapytania, specyfikację, ofertę lub inne pliki przyciskiem „Dodaj dokument”.</td></tr>}
              </tbody>
            </table>
            <div className="section-title">Pliki robocze (bez wersjonowania)</div>
            <Attachments ownerType="project" ownerId={id} items={d.attachments} onChange={p.reload} allowToDocument />
          </div>
        )}
        {tab === 'corr' && <DataTable id="prj-corr" title={`Korespondencja — ${d.name}`} columns={correspondenceColumns} rows={corr.data} loading={corr.loading} onOpen={(r) => setModal({ type: 'corr', id: r.id })} toolbar={<button className="btn primary" onClick={() => setModal({ type: 'corr' })}><Plus size={14} /> Nowa korespondencja</button>} />}
        {tab === 'tasks' && <DataTable id="prj-tasks" title={`Zadania — ${d.name}`} columns={taskColumns} rows={tasks.data} loading={tasks.loading} onOpen={(r) => setModal({ type: 'task', id: r.id })} rowClass={(r) => (r.overdue ? 'alert' : '')} toolbar={<button className="btn primary" onClick={() => setModal({ type: 'task' })}><Plus size={14} /> Nowe zadanie</button>} />}
        {tab === 'history' && <History projectId={id} onOpen={openRef} reloadKey={`${corr.data?.length}-${tasks.data?.length}-${docs.data?.length}-${d.attachments.length}-${d.status_name}-${d.result}`} />}
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
      {modal?.type === 'edit' && <ProjectForm id={id} onClose={() => setModal(null)} onSaved={() => (setModal(null), p.reload(), tasks.reload())} />}
      {modal?.type === 'doc' && <AddDocument folders={folders.data ?? []} folderId={defaultFolder} defaults={{ contractor_id: d.contractor_id, project_id: id }} onClose={() => setModal(null)} onSaved={() => (setModal(null), docs.reload(), setTab('docs'))} />}
      {modal?.type === 'corr' && <CorrespondenceForm id={modal.id} defaults={{ contractor_id: d.contractor_id, project_id: id }} onClose={() => setModal(null)} onSaved={() => (setModal(null), corr.reload())} />}
      {modal?.type === 'task' && <TaskForm id={modal.id} defaults={{ contractor_id: d.contractor_id, project_id: id }} onClose={() => setModal(null)} onSaved={() => (setModal(null), tasks.reload())} />}
    </div>
  );
}
export { documentColumns };
