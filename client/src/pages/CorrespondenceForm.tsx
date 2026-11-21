import { useEffect, useRef, useState } from 'react';
import { Paperclip, FolderOpen, Trash2, Send, Pause, Play } from 'lucide-react';
import { del, get, post, put, upload } from '../lib/api';
import { fmtDuration, fmtSize, today } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { Combo, ContractorPicker, DictSelect, Input, Loading, Modal, Notice, Select, Tabs, Textarea } from '../components/ui';
import { Attachments, DocumentPicker } from '../components/Attachments';
import { TaskForm } from './TaskForm';

export interface CorrDefaults {
  contractor_id?: number | null;
  project_id?: number | null;
  kind_code?: string;
  direction?: 'in' | 'out';
}

function parseDur(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0);
}

export function CorrespondenceForm({ id, defaults, onClose, onSaved }: { id?: number | null; defaults?: CorrDefaults; onClose: () => void; onSaved: () => void }) {
  const { user, dicts, toast, confirm, status, isManager } = useApp();
  const [tab, setTab] = useState('main');
  const [v, setV] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingDocs, setPendingDocs] = useState<any[]>([]);
  const [picker, setPicker] = useState(false);
  const [taskFrom, setTaskFrom] = useState<number | null>(null);
  const [nextNo, setNextNo] = useState('');
  const projects = useApi<any[]>('/api/projects');
  const stages = useApi<any[]>('/api/project-stages');
  const fileInp = useRef<HTMLInputElement>(null);
  // stoper: liczy czas od otwarcia formularza
  const [running, setRunning] = useState(!id);
  const [elapsed, setElapsed] = useState(0);
  const [durText, setDurText] = useState<string | null>(null);
  const opened = useRef(Date.now());
  const base = useRef(0);

  const kinds = dicts.corr_kind ?? [];
  const load = async () => {
    if (id) {
      try {
        const k = await get(`/api/correspondence/${id}`);
        setV({ ...k, date: k.event_at.slice(0, 10), time: k.event_at.slice(11, 16) });
        base.current = k.duration_sec;
        setElapsed(k.duration_sec);
      } catch (e: any) {
        setError(e.message);
      }
    } else {
      const now = new Date();
      const kind = kinds.find((k) => k.code === (defaults?.kind_code ?? 'phone')) ?? kinds[0];
      setV({
        kind_id: kind?.id ?? null,
        direction: defaults?.direction ?? 'out',
        date: today(),
        time: now.toTimeString().slice(0, 5),
        topic_id: null,
        topic_text: '',
        contractor_id: defaults?.contractor_id ?? null,
        contact_id: null,
        project_id: defaults?.project_id ?? null,
        stage_id: null,
        related_contractor_id: null,
        body: '',
        email_to: '',
        email_cc: '',
        phone_to: '',
        operator_name: user?.name,
        attachments: [],
      });
      get('/api/correspondence/next-number').then((r) => setNextNo(r.number)).catch(() => undefined);
    }
  };
  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => setElapsed(base.current + Math.round((Date.now() - opened.current) / 1000)), 1000);
    return () => clearInterval(h);
  }, [running]);
  useEffect(() => {
    if (v?.contractor_id) get(`/api/contacts?contractor_id=${v.contractor_id}`).then(setContacts).catch(() => setContacts([]));
    else setContacts([]);
  }, [v?.contractor_id]);

  if (!v) return <Modal title="Korespondencja" onClose={onClose}>{error ? <Notice kind="error">{error}</Notice> : <Loading />}</Modal>;
  const set = (k: string) => (val: any) => setV((p: any) => ({ ...p, [k]: val }));
  const code = kinds.find((k) => k.id === v.kind_id)?.code;
  const sent = v.send_status === 'sent';
  const contact = contacts.find((c) => c.id === v.contact_id);
  const canEdit = !id || v.operator_id === user?.id || isManager;

  const toggleRun = () => {
    if (running) {
      base.current = elapsed;
      setRunning(false);
    } else {
      opened.current = Date.now();
      setRunning(true);
    }
  };

  const payload = () => {
    const dur = durText !== null ? parseDur(durText) : elapsed;
    if (dur === null) throw new Error('Czas trwania wpisz w formacie gg:mm:ss.');
    return { ...v, event_at: `${v.date}T${v.time}`, duration_sec: dur };
  };

  const save = async (andSend = false) => {
    setError(null);
    let body: any;
    try {
      body = payload();
    } catch (e: any) {
      return setError(e.message);
    }
    if (!v.topic_id && !v.topic_text.trim()) return setError('Wybierz temat ze słownika lub wpisz temat własny.');
    if (andSend && code === 'email' && !v.email_to) return setError('Podaj adres e-mail odbiorcy.');
    if (andSend && code === 'sms' && !v.phone_to) return setError('Podaj numer telefonu odbiorcy.');
    setBusy(true);
    try {
      let cid = id;
      if (id) await put(`/api/correspondence/${id}`, body);
      else {
        const r = await post('/api/correspondence', body);
        cid = r.id;
        if (pendingFiles.length) await upload(`/api/attachments/correspondence/${cid}`, pendingFiles);
        for (const d of pendingDocs) await post(`/api/attachments/correspondence/${cid}/from-document`, { document_id: d.id });
      }
      setRunning(false);
      if (andSend) {
        const s = await post(`/api/correspondence/${cid}/send`);
        if (s.status === 'sent') toast('Wiadomość została wysłana.');
        else if (s.status === 'awaiting_config') toast(code === 'sms' ? 'Zapisano. SMS czeka w kolejce: bramka SMS nie jest skonfigurowana.' : 'Zapisano. Wiadomość czeka w kolejce: serwer SMTP nie jest skonfigurowany.', 'warn');
        else if (s.status === 'failed' || s.error) toast(`Wysyłka nie powiodła się: ${s.error ?? ''}. Wiadomość pozostaje w kolejce do ponowienia.`, 'error');
        else toast(`Zapisano. Stan wysyłki: ${s.status_label}.`, 'warn');
      } else toast(id ? 'Zapisano zmiany.' : 'Zapisano korespondencję.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirm('Usunąć tę korespondencję z rejestru?', { ok: 'Usuń', danger: true }))) return;
    try {
      await del(`/api/correspondence/${id}`);
      toast('Usunięto korespondencję.');
      onSaved();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const projItems = (projects.data ?? []).map((p) => ({ id: p.id, label: p.name, sub: [p.number, p.contractor_short || p.contractor_name].filter(Boolean).join(' · ') }));
  const stageOpts = (stages.data ?? []).filter((s) => s.project_id === v.project_id).map((s) => ({ value: s.id, label: s.name }));
  const contractorName = v.contact_name || contact ? `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim() || v.contact_name : '';
  const title = `Korespondencja${contractorName ? ` do ${contractorName}` : ''}${id ? ` · ${v.number}` : ''}`;
  const canSend = (code === 'email' || code === 'sms') && v.direction === 'out' && !sent && !['queued', 'sending', 'awaiting_config'].includes(v.send_status ?? '');

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={820}
      onSubmit={canEdit ? () => save(false) : undefined}
      headExtra={
        <span className="row gap4">
          <span className="stopwatch" title="Czas trwania (stoper uruchomiony przy otwarciu)">{fmtDuration(elapsed)}</span>
          {canEdit && (
            <button type="button" className="x" title={running ? 'Zatrzymaj stoper' : 'Wznów stoper'} onClick={toggleRun} style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer' }}>
              {running ? <Pause size={14} /> : <Play size={14} />}
            </button>
          )}
        </span>
      }
      footer={
        <>
          <div className="left">
            {id && canEdit && !sent && (
              <button type="button" className="btn danger" onClick={remove}>
                <Trash2 size={14} /> Usuń
              </button>
            )}
            {id && (
              <button type="button" className="btn" onClick={() => setTaskFrom(id)}>
                Utwórz zadanie
              </button>
            )}
            {v.send_status && <span className={`pill ${sent ? 'ok' : v.send_status === 'failed' ? 'danger' : 'warn'}`}>{v.send_status_label}</span>}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Zamknij
          </button>
          {canEdit && (
            <button className="btn" disabled={busy}>
              Zapisz
            </button>
          )}
          {canEdit && canSend && (
            <button type="button" className="btn primary" disabled={busy} onClick={() => save(true)}>
              <Send size={14} /> Zapisz i wyślij {code === 'sms' ? 'SMS' : 'e-mail'}
            </button>
          )}
        </>
      }
    >
      <div style={{ margin: '-12px -12px 12px' }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'main', label: 'Ogólne' },
            { key: 'body', label: 'Treść' },
            { key: 'att', label: 'Załączniki', count: id ? v.attachments?.length : pendingFiles.length + pendingDocs.length },
          ]}
        />
      </div>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      {tab === 'main' && (
        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <label className="lbl req">Rodzaj</label>
            <Select value={v.kind_id} onChange={set('kind_id')} empty={null} options={kinds.filter((k) => k.active || k.id === v.kind_id).map((k) => ({ value: k.id, label: k.name }))} disabled={sent} />
            <label className="lbl req">Kierunek</label>
            <Select value={v.direction} onChange={set('direction')} empty={null} options={[{ value: 'out', label: 'Wychodząca' }, { value: 'in', label: 'Przychodząca' }]} disabled={sent} />
            <label className="lbl req" htmlFor="k-date">Data</label>
            <Input id="k-date" type="date" value={v.date} onChange={(e) => set('date')(e.target.value)} />
            <label className="lbl req" htmlFor="k-time">Godzina</label>
            <Input id="k-time" type="time" value={v.time} onChange={(e) => set('time')(e.target.value)} />
            <label className="lbl">Temat</label>
            <DictSelect dict="corr_topic" value={v.topic_id} onChange={set('topic_id')} />
            <label className="lbl">Nr</label>
            <Input readOnly value={id ? v.number : nextNo ? `${nextNo} (nadawany przy zapisie)` : 'nadawany przy zapisie'} />
            <label className="lbl" htmlFor="k-topic">Temat własny</label>
            <div className="span3"><Input id="k-topic" value={v.topic_text} onChange={(e) => set('topic_text')(e.target.value)} placeholder="uzupełnij lub zastąp temat ze słownika" /></div>
            <label className="lbl">Kontrahent</label>
            <div className="span3"><ContractorPicker value={v.contractor_id} onChange={(c) => setV((p: any) => ({ ...p, contractor_id: c, contact_id: null }))} /></div>
            <label className="lbl">Adresat</label>
            <div className="span3">
              <Select
                value={v.contact_id}
                onChange={(cid) => {
                  const c = contacts.find((x) => x.id === cid);
                  setV((p: any) => ({ ...p, contact_id: cid, email_to: c?.email && !p.email_to ? c.email : p.email_to, phone_to: (c?.mobile || c?.phone) && !p.phone_to ? c.mobile || c.phone : p.phone_to }));
                }}
                empty={v.contractor_id ? '—' : 'najpierw wybierz kontrahenta'}
                options={contacts.map((c) => ({ value: c.id, label: `${c.first_name ?? ''} ${c.last_name}`.trim() + ` (tel: ${c.phone ?? ''} gsm: ${c.mobile ?? ''}${c.email ? ', ' + c.email : ''})` + (c.position ? ` — ${c.position}` : '') }))}
              />
            </div>
            <label className="lbl">Projekt</label>
            <Combo items={projItems} value={v.project_id} onChange={(pid) => setV((p: any) => ({ ...p, project_id: pid, stage_id: null }))} placeholder="wyszukaj projekt…" />
            <label className="lbl">Etap projektu</label>
            <Select value={v.stage_id} onChange={set('stage_id')} options={stageOpts} empty={v.project_id ? '—' : 'najpierw wybierz projekt'} />
            <label className="lbl">K. powiązany</label>
            <div className="span3"><ContractorPicker value={v.related_contractor_id} onChange={set('related_contractor_id')} exclude={v.contractor_id ?? undefined} /></div>
            <label className="lbl" htmlFor="k-dur">Czas trwania</label>
            <div className="row">
              <Input id="k-dur" value={durText ?? fmtDuration(elapsed)} onFocus={() => (setRunning(false), setDurText(fmtDuration(elapsed)))} onChange={(e) => setDurText(e.target.value)} invalid={durText !== null && parseDur(durText) === null} style={{ width: 100 }} />
              <span className="field-hint">gg:mm:ss — kliknij, aby poprawić ręcznie</span>
            </div>
            <label className="lbl">Operator</label>
            <Input readOnly value={v.operator_name ?? ''} />
            {code === 'email' && (
              <>
                <label className="lbl" htmlFor="k-to">E-mail do</label>
                <Input id="k-to" value={v.email_to} onChange={(e) => set('email_to')(e.target.value)} disabled={sent} placeholder="adres@firma.pl" />
                <label className="lbl" htmlFor="k-cc">DW</label>
                <Input id="k-cc" value={v.email_cc} onChange={(e) => set('email_cc')(e.target.value)} disabled={sent} />
              </>
            )}
            {code === 'sms' && (
              <>
                <label className="lbl" htmlFor="k-ph">Numer telefonu</label>
                <Input id="k-ph" value={v.phone_to} onChange={(e) => set('phone_to')(e.target.value)} disabled={sent} />
                <span />
                <span />
              </>
            )}
            {code === 'email' && v.direction === 'out' && !sent && !status.smtp_configured && (
              <div className="span4"><Notice kind="warn">Serwer SMTP nie jest skonfigurowany (Ustawienia → Poczta SMTP). Wiadomość zostanie zapisana i trafi do kolejki „oczekuje na konfigurację”; nie zostanie wysłana, dopóki administrator nie uzupełni konfiguracji.</Notice></div>
            )}
            {code === 'sms' && v.direction === 'out' && !sent && !status.sms_configured && (
              <div className="span4"><Notice kind="warn">Bramka SMS nie jest skonfigurowana (Ustawienia → Bramka SMS). SMS trafi do kolejki „oczekuje na konfigurację bramki”.</Notice></div>
            )}
            {v.send_error && <div className="span4"><Notice kind="error">Ostatni błąd wysyłki: {v.send_error}</Notice></div>}
          </div>
        </fieldset>
      )}
      {tab === 'body' && (
        <Textarea aria-label="Treść" rows={16} value={v.body} onChange={(e) => set('body')(e.target.value)} disabled={!canEdit || sent} placeholder="Treść notatki, ustaleń lub wiadomości…" />
      )}
      {tab === 'att' &&
        (id ? (
          <Attachments ownerType="correspondence" ownerId={id} items={v.attachments ?? []} onChange={load} allowToDocument readOnly={!canEdit} />
        ) : (
          <div>
            <div className="row mb8">
              <input ref={fileInp} type="file" multiple hidden onChange={(e) => (setPendingFiles([...pendingFiles, ...Array.from(e.target.files ?? [])]), (e.target.value = ''))} />
              <button type="button" className="btn" onClick={() => fileInp.current?.click()}>
                <Paperclip size={14} /> Dodaj pliki
              </button>
              <button type="button" className="btn" onClick={() => setPicker(true)}>
                <FolderOpen size={14} /> Z rejestru dokumentów
              </button>
            </div>
            <table className="grid">
              <tbody>
                {pendingFiles.map((f, i) => (
                  <tr key={`f${i}`}>
                    <td>{f.name}</td>
                    <td className="num">{fmtSize(f.size)}</td>
                    <td>plik</td>
                    <td><button type="button" className="btn sm ghost danger" onClick={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
                {pendingDocs.map((d, i) => (
                  <tr key={`d${i}`}>
                    <td>{d.name} ({d.number})</td>
                    <td className="num">{fmtSize(d.size)}</td>
                    <td>rejestr dokumentów</td>
                    <td><button type="button" className="btn sm ghost danger" onClick={() => setPendingDocs(pendingDocs.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
                {!pendingFiles.length && !pendingDocs.length && <tr><td className="muted">Brak załączników. Pliki zostaną zapisane razem z korespondencją.</td></tr>}
              </tbody>
            </table>
            {picker && <DocumentPicker onClose={() => setPicker(false)} onPick={(d) => (setPendingDocs([...pendingDocs, d]), setPicker(false))} />}
          </div>
        ))}
      {taskFrom && (
        <TaskForm
          defaults={{ correspondence_id: taskFrom, contractor_id: v.contractor_id, contact_id: v.contact_id, project_id: v.project_id, title: v.subject ? `Dot.: ${v.subject}` : '' }}
          onClose={() => setTaskFrom(null)}
          onSaved={() => setTaskFrom(null)}
        />
      )}
    </Modal>
  );
}
