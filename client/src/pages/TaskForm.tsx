import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { del, get, post, put } from '../lib/api';
import { addMinutes, fmtDate, fmtDateTime, fmtMinutes, PRIORITIES, toIsoDateTime, today } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { Check, ContractorPicker, DictSelect, Input, Loading, Modal, MultiOperator, Notice, OperatorSelect, Select, Tabs, Textarea, Combo } from '../components/ui';
import { Attachments } from '../components/Attachments';

export interface TaskDefaults {
  start_at?: string;
  end_at?: string;
  contractor_id?: number | null;
  contact_id?: number | null;
  project_id?: number | null;
  correspondence_id?: number | null;
  title?: string;
  operator_ids?: number[];
}

const REMIND = [
  { value: '', label: 'bez przypomnienia' },
  { value: 0, label: 'w chwili rozpoczęcia' },
  { value: 5, label: '5 min wcześniej' },
  { value: 15, label: '15 min wcześniej' },
  { value: 30, label: '30 min wcześniej' },
  { value: 60, label: '1 godz. wcześniej' },
  { value: 120, label: '2 godz. wcześniej' },
  { value: 1440, label: '1 dzień wcześniej' },
];

function nextSlot() {
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0);
  return toIsoDateTime(d);
}

export function TaskForm({ id, defaults, onClose, onSaved }: { id?: number | null; defaults?: TaskDefaults; onClose: () => void; onSaved: () => void }) {
  const { user, toast, confirm, dicts, status } = useApp();
  const [tab, setTab] = useState('main');
  const [v, setV] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const projects = useApi<any[]>('/api/projects');
  const stages = useApi<any[]>('/api/project-stages');
  const [time, setTime] = useState({ work_date: today(), minutes: '', note: '' });

  const load = async () => {
    if (id) {
      try {
        const t = await get(`/api/tasks/${id}`);
        setV({ ...t, start_at: t.start_at.slice(0, 16), end_at: t.end_at.slice(0, 16), remind_before_min: t.remind_before_min ?? '' });
      } catch (e: any) {
        setError(e.message);
      }
    } else {
      const start = defaults?.start_at ?? nextSlot();
      setV({
        title: defaults?.title ?? '',
        description: '',
        start_at: start,
        end_at: defaults?.end_at ?? addMinutes(start, 30),
        operator_ids: defaults?.operator_ids ?? [user!.id],
        principal_id: user!.id,
        priority: 2,
        status_id: null,
        progress: 0,
        contractor_id: defaults?.contractor_id ?? null,
        contact_id: defaults?.contact_id ?? null,
        project_id: defaults?.project_id ?? null,
        correspondence_id: defaults?.correspondence_id ?? null,
        stage_id: null,
        remind_before_min: 15,
        remind_inapp: 1,
        remind_email: 0,
        remind_sms: 0,
        can_edit: true,
      });
    }
  };
  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    if (v?.contractor_id) get(`/api/contacts?contractor_id=${v.contractor_id}`).then(setContacts).catch(() => setContacts([]));
    else setContacts([]);
  }, [v?.contractor_id]);

  if (!v) return <Modal title="Zadanie" onClose={onClose}>{error ? <Notice kind="error">{error}</Notice> : <Loading />}</Modal>;
  const set = (k: string) => (val: any) => setV((p: any) => ({ ...p, [k]: val }));
  const ro = id ? !v.can_edit : false;

  const save = async () => {
    setError(null);
    if (!v.title.trim()) return setError('Podaj tytuł zadania.');
    if (v.end_at < v.start_at) return setError('Termin zakończenia nie może być wcześniejszy niż rozpoczęcia.');
    setBusy(true);
    try {
      const body = { ...v, remind_before_min: v.remind_before_min === '' ? null : v.remind_before_min };
      if (id) await put(`/api/tasks/${id}`, body);
      else await post('/api/tasks', body);
      toast(id ? 'Zapisano zmiany zadania.' : 'Dodano zadanie.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirm('Usunąć zadanie? Operacji nie można cofnąć.', { ok: 'Usuń', danger: true }))) return;
    try {
      await del(`/api/tasks/${id}`);
      toast('Usunięto zadanie.');
      onSaved();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const addTime = async () => {
    try {
      await post(`/api/tasks/${id}/time`, time);
      setTime({ ...time, minutes: '', note: '' });
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const projItems = (projects.data ?? []).map((p) => ({ id: p.id, label: p.name, sub: [p.number, p.contractor_short || p.contractor_name].filter(Boolean).join(' · ') }));
  const stageOpts = (stages.data ?? []).filter((s) => s.project_id === v.project_id).map((s) => ({ value: s.id, label: s.name }));
  const doneCode = (dicts.task_status ?? []).find((s) => s.code === 'done');

  return (
    <Modal
      title={id ? `Zadanie: ${v.title}` : 'Nowe zadanie'}
      onClose={onClose}
      width={760}
      onSubmit={ro ? undefined : save}
      footer={
        <>
          <div className="left">
            {id && !ro && (
              <button type="button" className="btn danger" onClick={remove}>
                <Trash2 size={14} /> Usuń
              </button>
            )}
            {v.series_id && <span className="small muted">Wystąpienie zadania cyklicznego</span>}
            {v.rule_id && <span className="small muted">Zadanie utworzone automatycznie</span>}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Zamknij
          </button>
          {!ro && (
            <button className="btn primary" disabled={busy}>
              Zapisz (Ctrl+Enter)
            </button>
          )}
        </>
      }
    >
      {id && (
        <div style={{ margin: '-12px -12px 12px' }}>
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'main', label: 'Ogólne' },
              { key: 'time', label: 'Czas pracy', count: v.time_entries?.length },
              { key: 'att', label: 'Załączniki', count: v.attachments?.length },
            ]}
          />
        </div>
      )}
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      {ro && <div className="mb8"><Notice kind="info">Podgląd: nie jesteś wykonawcą ani zlecającym tego zadania.</Notice></div>}
      {tab === 'main' && (
        <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <label className="lbl req" htmlFor="t-title">Tytuł</label>
            <div className="span3"><Input id="t-title" value={v.title} onChange={(e) => set('title')(e.target.value)} /></div>
            <label className="lbl" htmlFor="t-from">Termin od</label>
            <Input
              id="t-from"
              type="datetime-local"
              value={v.start_at}
              onChange={(e) => {
                const ns = e.target.value;
                const dur = (new Date(v.end_at).getTime() - new Date(v.start_at).getTime()) / 60000;
                setV((p: any) => ({ ...p, start_at: ns, end_at: ns ? addMinutes(ns, Math.max(5, dur || 30)) : p.end_at }));
              }}
            />
            <label className="lbl" htmlFor="t-to">do</label>
            <Input id="t-to" type="datetime-local" value={v.end_at} onChange={(e) => set('end_at')(e.target.value)} />
            <label className="lbl">Wykonawcy</label>
            <div className="span3">
              <MultiOperator value={v.operator_ids ?? []} onChange={set('operator_ids')} />
              {(v.operator_ids?.length ?? 0) > 1 && <div className="field-hint">Zadanie grupowe: każdy wykonawca widzi je u siebie.</div>}
            </div>
            <label className="lbl">Zlecający</label>
            <OperatorSelect value={v.principal_id} onChange={set('principal_id')} />
            <label className="lbl">Priorytet</label>
            <Select value={v.priority} onChange={set('priority')} empty={null} options={Object.entries(PRIORITIES).map(([k, l]) => ({ value: Number(k), label: l }))} />
            <label className="lbl">Status</label>
            <DictSelect dict="task_status" value={v.status_id} onChange={(s) => setV((p: any) => ({ ...p, status_id: s, progress: s === doneCode?.id ? 100 : p.progress }))} empty="(wg stopnia wykonania)" />
            <label className="lbl" htmlFor="t-prog">Stopień wykonania</label>
            <div className="row">
              <input id="t-prog" type="range" min={0} max={100} step={5} value={v.progress} onChange={(e) => set('progress')(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--navy)' }} />
              <Input type="number" min={0} max={100} value={v.progress} onChange={(e) => set('progress')(Math.max(0, Math.min(100, Number(e.target.value))))} style={{ width: 64 }} />
              <span>%</span>
            </div>
            <label className="lbl">Kontrahent</label>
            <div className="span3"><ContractorPicker value={v.contractor_id} onChange={(c) => setV((p: any) => ({ ...p, contractor_id: c, contact_id: null }))} /></div>
            <label className="lbl">Osoba kontaktowa</label>
            <Select value={v.contact_id} onChange={set('contact_id')} options={contacts.map((c) => ({ value: c.id, label: `${c.first_name ?? ''} ${c.last_name}`.trim() + (c.phone ? ` (tel. ${c.phone})` : '') }))} empty={v.contractor_id ? '—' : 'najpierw wybierz kontrahenta'} />
            <label className="lbl">Korespondencja</label>
            <Input readOnly value={v.correspondence_number ?? (v.correspondence_id ? `#${v.correspondence_id}` : '')} placeholder="(brak powiązania)" />
            <label className="lbl">Sprawa</label>
            <Combo items={projItems} value={v.project_id} onChange={(pid) => setV((p: any) => ({ ...p, project_id: pid, stage_id: null }))} placeholder="zapytanie lub przetarg…" />
            <label className="lbl">Etap sprawy</label>
            <Select value={v.stage_id} onChange={set('stage_id')} options={stageOpts} empty={v.project_id ? '—' : 'najpierw wybierz sprawę'} />
            <label className="lbl">Opis</label>
            <div className="span3"><Textarea rows={4} value={v.description} onChange={(e) => set('description')(e.target.value)} /></div>
            <label className="lbl">Przypomnienie</label>
            <Select value={v.remind_before_min} onChange={(x) => set('remind_before_min')(x ?? '')} empty={null} options={REMIND} />
            <div className="span3 row wrap" style={{ gridColumn: 'span 2' }}>
              <Check checked={!!v.remind_inapp} onChange={set('remind_inapp')}>komunikat w aplikacji</Check>
              <Check checked={!!v.remind_email} onChange={set('remind_email')}>e-mail</Check>
              <Check checked={!!v.remind_sms} onChange={set('remind_sms')}>SMS</Check>
            </div>
            {(v.remind_email && !status.smtp_configured) || (v.remind_sms && !status.sms_configured) ? (
              <div className="span4">
                <Notice kind="warn">
                  {v.remind_email && !status.smtp_configured ? 'Serwer SMTP nie jest skonfigurowany: przypomnienie e-mail trafi do kolejki i zostanie wysłane po konfiguracji. ' : ''}
                  {v.remind_sms && !status.sms_configured ? 'Bramka SMS nie jest skonfigurowana: SMS trafi do kolejki „oczekuje na konfigurację bramki”.' : ''}
                </Notice>
              </div>
            ) : null}
            <label className="lbl">Archiwalne</label>
            <Check checked={!!v.archived} onChange={set('archived')}>przenieś do archiwum</Check>
          </div>
        </fieldset>
      )}
      {tab === 'time' && id && (
        <div>
          <p className="small muted">
            Planowany czas: {fmtMinutes(v.planned_minutes) || '0 h'} · przepracowano: <b>{fmtMinutes(v.worked_minutes) || '0 h'}</b>
          </p>
          <table className="grid">
            <thead>
              <tr>
                <th>Data</th>
                <th>Operator</th>
                <th className="num">Czas</th>
                <th>Opis</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(v.time_entries ?? []).map((e: any) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.work_date)}</td>
                  <td>{e.operator}</td>
                  <td className="num">{fmtMinutes(e.minutes)}</td>
                  <td>{e.note}</td>
                  <td>
                    <button type="button" className="btn sm ghost danger" onClick={() => del(`/api/time-entries/${e.id}`).then(load).catch((er) => toast(er.message, 'error'))}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row mt8">
            <Input type="date" value={time.work_date} onChange={(e) => setTime({ ...time, work_date: e.target.value })} style={{ width: 150 }} />
            <Input type="number" min={1} placeholder="minuty" value={time.minutes} onChange={(e) => setTime({ ...time, minutes: e.target.value })} style={{ width: 90 }} aria-label="Czas w minutach" />
            <Input placeholder="opis wykonanej pracy" value={time.note} onChange={(e) => setTime({ ...time, note: e.target.value })} />
            <button type="button" className="btn" onClick={addTime} disabled={!time.minutes}>
              Dodaj czas
            </button>
          </div>
        </div>
      )}
      {tab === 'att' && id && <Attachments ownerType="task" ownerId={id} items={v.attachments ?? []} onChange={load} readOnly={ro} />}
      {id && tab === 'main' && v.reminders?.length > 0 && (
        <div className="small muted mt8">
          Przypomnienia: {v.reminders.map((r: any) => `${r.operator} ${fmtDateTime(r.remind_at)} (${r.status === 'pending' ? 'oczekuje' : r.status === 'due' ? 'wyświetlone' : 'potwierdzone'})`).join('; ')}
        </div>
      )}
    </Modal>
  );
}
