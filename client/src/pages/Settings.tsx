import { useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { del, get, post, put, upload } from '../lib/api';
import { fmtDateTime, PRIORITIES } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { Check, Input, Loading, Modal, Notice, OperatorSelect, Select, Tabs, Textarea } from '../components/ui';

const ROLE_LABELS: Record<string, string> = { admin: 'Administrator', kierownik: 'Kierownik', handlowiec: 'Handlowiec' };

function Operators() {
  const { operators, reloadOperators, toast } = useApp();
  const deps = useApi<any[]>('/api/departments');
  const [form, setForm] = useState<any>(null);
  const [reset, setReset] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      if (form.id) await put(`/api/operators/${form.id}`, form);
      else await post('/api/operators', form);
      toast('Zapisano operatora.');
      setForm(null);
      reloadOperators();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const set = (k: string) => (x: any) => setForm((p: any) => ({ ...p, [k]: x?.target ? x.target.value : x }));
  return (
    <div>
      <div className="row mb8"><button className="btn primary" onClick={() => (setError(null), setForm({ login: '', name: '', email: '', phone: '', role: 'handlowiec', manager_id: null, password: '', departments: [], active: 1, must_change_password: true }))}><Plus size={14} /> Nowy operator</button></div>
      <table className="grid">
        <thead><tr><th>Login</th><th>Imię i nazwisko</th><th>Rola</th><th>Przełożony</th><th>Działy</th><th>E-mail</th><th>Telefon</th><th>Ostatnie logowanie</th><th>Aktywny</th><th /></tr></thead>
        <tbody>
          {operators.map((o: any) => (
            <tr key={o.id} className={o.active ? '' : 'muted'}>
              <td>{o.login}</td><td>{o.name}</td><td>{ROLE_LABELS[o.role]}</td><td>{operators.find((x) => x.id === o.manager_id)?.name}</td>
              <td className="small">{(deps.data ?? []).filter((d) => o.departments.includes(d.id)).map((d) => d.name).join(', ')}</td>
              <td>{o.email}</td><td>{o.phone}</td><td className="nowrap">{fmtDateTime(o.last_login_at)}</td><td>{o.active ? 'tak' : 'nie'}</td>
              <td className="nowrap"><button className="btn sm" onClick={() => (setError(null), setForm({ ...o }))}>Edytuj</button> <button className="btn sm" onClick={() => setReset({ id: o.id, name: o.name, password: '' })}>Nadaj hasło</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {form && (
        <Modal title={form.id ? `Operator: ${form.name}` : 'Nowy operator'} onClose={() => setForm(null)} width={640} onSubmit={save} footer={<><button type="button" className="btn" onClick={() => setForm(null)}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
          {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
          <div className="form-grid one">
            <label className="lbl req">Login</label><Input value={form.login} onChange={set('login')} />
            <label className="lbl req">Imię i nazwisko</label><Input value={form.name} onChange={set('name')} />
            <label className="lbl req">Rola</label><Select value={form.role} onChange={set('role')} empty={null} options={Object.entries(ROLE_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
            <label className="lbl">Przełożony (kierownik)</label><OperatorSelect value={form.manager_id} onChange={set('manager_id')} />
            <label className="lbl">Działy (grupy uprawnień)</label>
            <div className="row wrap">{(deps.data ?? []).map((d) => <Check key={d.id} checked={form.departments.includes(d.id)} onChange={(c) => set('departments')(c ? [...form.departments, d.id] : form.departments.filter((x: number) => x !== d.id))}>{d.name}</Check>)}</div>
            <label className="lbl">E-mail</label><Input value={form.email ?? ''} onChange={set('email')} />
            <label className="lbl">Telefon (SMS)</label><Input value={form.phone ?? ''} onChange={set('phone')} />
            {!form.id && (<><label className="lbl req">Hasło startowe</label><Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /><label className="lbl" /><Check checked={!!form.must_change_password} onChange={set('must_change_password')}>wymuś zmianę hasła przy pierwszym logowaniu</Check></>)}
            <label className="lbl">Aktywny</label><Check checked={!!form.active} onChange={(c) => set('active')(c ? 1 : 0)}>może się logować</Check>
          </div>
          <p className="small muted mt8">Administrator: pełny dostęp i konfiguracja. Kierownik: widzi zadania i raporty swoich pracowników (operatorów, dla których jest przełożonym), zarządza segregatorami i szablonami. Handlowiec: własne zadania i raporty.</p>
        </Modal>
      )}
      {reset && (
        <Modal title={`Nowe hasło: ${reset.name}`} onClose={() => setReset(null)} width={420} onSubmit={async () => { try { await post(`/api/operators/${reset.id}/reset-password`, { password: reset.password }); toast('Nadano hasło. Operator zmieni je przy logowaniu.'); setReset(null); } catch (e: any) { toast(e.message, 'error'); } }} footer={<><button type="button" className="btn" onClick={() => setReset(null)}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
          <Input type="password" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} autoComplete="new-password" placeholder="min. 8 znaków, litery i cyfry" />
          <p className="small muted mt8">Operator zostanie wylogowany i przy logowaniu musi ustawić własne hasło.</p>
        </Modal>
      )}
    </div>
  );
}

function Departments() {
  const { toast, confirm } = useApp();
  const list = useApi<any[]>('/api/departments');
  const [name, setName] = useState('');
  return (
    <div style={{ maxWidth: 600 }}>
      <p className="small muted">Działy to grupy uprawnień używane m.in. w uprawnieniach do dokumentów i segregatorów. Przynależność operatora ustawisz w zakładce Operatorzy.</p>
      <div className="row mb8"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa działu" /><button className="btn primary" disabled={!name.trim()} onClick={async () => { try { await post('/api/departments', { name }); setName(''); list.reload(); } catch (e: any) { toast(e.message, 'error'); } }}><Plus size={14} /> Dodaj</button></div>
      <table className="grid"><tbody>{(list.data ?? []).map((d) => <tr key={d.id}><td>{d.name}</td><td style={{ width: 40 }}><button className="btn sm ghost danger" onClick={async () => { if (await confirm(`Usunąć dział „${d.name}”? Usunięte zostaną też jego wpisy uprawnień.`, { ok: 'Usuń', danger: true })) { await del(`/api/departments/${d.id}`); list.reload(); } }}><Trash2 size={13} /></button></td></tr>)}</tbody></table>
    </div>
  );
}

function Dictionaries() {
  const { dicts, dictLabels, reloadDicts, toast, confirm } = useApp();
  const [dict, setDict] = useState('contractor_type');
  const [name, setName] = useState('');
  const [parent, setParent] = useState<number | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const items = dicts[dict] ?? [];
  const subs = dicts.contractor_subgroup ?? [];
  const add = async (d: string, n: string, parentId?: number | null) => {
    try {
      await post(`/api/dicts/${d}`, { name: n, parent_id: parentId });
      reloadDicts();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const remove = async (it: any) => {
    if (!(await confirm(`Usunąć pozycję „${it.name}”? Jeśli jest używana, zostanie oznaczona jako nieaktywna.`, { ok: 'Usuń', danger: true }))) return;
    try {
      const r = await del(`/api/dict-items/${it.id}`);
      if (r.deactivated) toast('Pozycja jest używana — oznaczono jako nieaktywną.', 'warn');
      reloadDicts();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const Row = ({ it, indent }: { it: any; indent?: boolean }) => (
    <tr className={it.active ? '' : 'muted'}>
      <td style={{ paddingLeft: indent ? 28 : undefined }}>{it.color && <span className="dot" style={{ background: it.color }} />}{it.name} {it.system ? <span className="pill navy">systemowa</span> : null} {!it.active && <span className="pill">nieaktywna</span>}</td>
      <td className="nowrap" style={{ width: 150 }}><button className="btn sm" onClick={() => setEdit({ ...it })}>Edytuj</button> {!it.system && <button className="btn sm ghost danger" onClick={() => remove(it)}><Trash2 size={13} /></button>}</td>
    </tr>
  );
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div style={{ width: 260 }}>
        {Object.entries(dictLabels).map(([k, l]) => <div key={k} className={`nav-link ${dict === k ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setDict(k)}>{l}</div>)}
      </div>
      <div className="grow" style={{ maxWidth: 700 }}>
        <h2 className="mb8">{dictLabels[dict]}</h2>
        <div className="row mb8">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nowa pozycja" onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { add(dict, name); setName(''); } }} />
          <button className="btn primary" disabled={!name.trim()} onClick={() => (add(dict, name), setName(''))}><Plus size={14} /> Dodaj</button>
        </div>
        <table className="grid">
          <tbody>
            {items.map((it) => (
              <>
                <Row key={it.id} it={it} />
                {dict === 'contractor_group' && subs.filter((s) => s.parent_id === it.id).map((s) => <Row key={s.id} it={s} indent />)}
              </>
            ))}
          </tbody>
        </table>
        {dict === 'contractor_group' && (
          <div className="row mt8">
            <Select value={parent} onChange={setParent} empty="grupa nadrzędna…" options={items.map((g) => ({ value: g.id, label: g.name }))} />
            <Input id="sub-name" placeholder="Nowa podgrupa" onKeyDown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && parent && t.value.trim()) { add('contractor_subgroup', t.value, parent); t.value = ''; } }} />
            <span className="small muted">Enter dodaje podgrupę</span>
          </div>
        )}
        {(dict === 'task_status' || dict === 'corr_kind') && <p className="small muted mt8">Pozycje systemowe sterują logiką (np. „Zrealizowane” zamyka zadanie, „E-mail” umożliwia wysyłkę); można zmieniać ich nazwy, ale nie usuwać.</p>}
      </div>
      {edit && (
        <Modal title="Pozycja słownika" onClose={() => setEdit(null)} width={420} onSubmit={async () => { try { await put(`/api/dict-items/${edit.id}`, edit); reloadDicts(); setEdit(null); } catch (e: any) { toast(e.message, 'error'); } }} footer={<><button type="button" className="btn" onClick={() => setEdit(null)}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
          <div className="form-grid one">
            <label className="lbl req">Nazwa</label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <label className="lbl">Kolor</label><Input type="color" value={edit.color ?? '#1b2f5b'} onChange={(e) => setEdit({ ...edit, color: e.target.value })} style={{ width: 60, padding: 2 }} />
            <label className="lbl">Kolejność</label><Input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} />
            <label className="lbl">Aktywna</label><Check checked={!!edit.active} onChange={(c) => setEdit({ ...edit, active: c })}>widoczna przy wyborze</Check>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CustomFields() {
  const { toast, confirm } = useApp();
  const list = useApi<any[]>('/api/custom-fields');
  const [form, setForm] = useState<any>(null);
  const types: Record<string, string> = { text: 'tekst', number: 'liczba', date: 'data', select: 'lista wyboru', bool: 'znacznik tak/nie' };
  const save = async () => {
    try {
      const body = { ...form, options: typeof form.options === 'string' ? form.options.split('\n') : form.options };
      if (form.id) await put(`/api/custom-fields/${form.id}`, body);
      else await post('/api/custom-fields', body);
      setForm(null);
      list.reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <div style={{ maxWidth: 800 }}>
      <p className="small muted">Pola dodatkowe pojawiają się w kartotece kontrahenta (zakładka Szczegóły), jako kolumny i filtry rejestru kontrahentów (wybór kolumn) oraz w imporcie.</p>
      <div className="row mb8"><button className="btn primary" onClick={() => setForm({ label: '', type: 'text', options: '', sort: 0, active: true })}><Plus size={14} /> Nowe pole</button></div>
      <table className="grid">
        <thead><tr><th>Nazwa</th><th>Kod</th><th>Typ</th><th>Wartości</th><th>Aktywne</th><th /></tr></thead>
        <tbody>
          {(list.data ?? []).map((f) => <tr key={f.id}><td>{f.label}</td><td className="small muted">{f.code}</td><td>{types[f.type]}</td><td className="small">{f.options.join(', ')}</td><td>{f.active ? 'tak' : 'nie'}</td>
            <td className="nowrap"><button className="btn sm" onClick={() => setForm({ ...f, options: f.options.join('\n') })}>Edytuj</button> <button className="btn sm ghost danger" onClick={async () => { if (await confirm('Usunąć pole? Wartości zapisane u kontrahentów przestaną być widoczne.', { ok: 'Usuń', danger: true })) { await del(`/api/custom-fields/${f.id}`); list.reload(); } }}><Trash2 size={13} /></button></td></tr>)}
          {!(list.data ?? []).length && <tr><td colSpan={6} className="muted">Brak pól dodatkowych.</td></tr>}
        </tbody>
      </table>
      {form && (
        <Modal title="Pole dodatkowe" onClose={() => setForm(null)} width={480} onSubmit={save} footer={<><button type="button" className="btn" onClick={() => setForm(null)}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
          <div className="form-grid one">
            <label className="lbl req">Nazwa</label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <label className="lbl req">Typ</label><Select value={form.type} onChange={(t) => setForm({ ...form, type: t })} empty={null} options={Object.entries(types).map(([k, l]) => ({ value: k, label: l }))} />
            {form.type === 'select' && (<><label className="lbl req">Wartości listy</label><Textarea rows={5} value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="jedna wartość w wierszu" /></>)}
            <label className="lbl">Kolejność</label><Input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} />
            <label className="lbl">Aktywne</label><Check checked={!!form.active} onChange={(c) => setForm({ ...form, active: c })}>widoczne w kartotece</Check>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Rules() {
  const { toast, confirm } = useApp();
  const d = useApi<any>('/api/auto-rules');
  const [form, setForm] = useState<any>(null);
  const save = async () => {
    try {
      if (form.id) await put(`/api/auto-rules/${form.id}`, form);
      else await post('/api/auto-rules', form);
      setForm(null);
      d.reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  if (!d.data) return <Loading />;
  const assign: Record<string, string> = { owner: 'prowadzący kontrahenta / opiekun projektu', creator: 'operator, który wywołał zdarzenie', operator: 'wskazany operator' };
  return (
    <div style={{ maxWidth: 1100 }}>
      <p className="small muted">Reguła: zdarzenie → szablon zadania → opóźnienie. Przy zdarzeniu system tworzy zadanie z terminem przesuniętym o podaną liczbę dni. W tytule i opisie można użyć: {'{{kontrahent}}'}, {'{{kontrahent_pelna}}'}, {'{{projekt}}'}, {'{{numer}}'}, {'{{data}}'}.</p>
      <div className="row mb8"><button className="btn primary" onClick={() => setForm({ name: '', event: 'contractor.created', delay_days: 3, time_of_day: '10:00', duration_min: 30, title_tpl: '', description_tpl: '', assign_to: 'owner', operator_id: null, priority: 2, remind_before_min: 15, active: true })}><Plus size={14} /> Nowa reguła</button></div>
      <table className="grid">
        <thead><tr><th>Nazwa</th><th>Zdarzenie</th><th>Zadanie</th><th>Po</th><th>Dla</th><th className="num">Utworzono zadań</th><th>Aktywna</th><th /></tr></thead>
        <tbody>
          {d.data.rules.map((r: any) => <tr key={r.id}><td>{r.name}</td><td>{d.data.events[r.event]}</td><td className="small">{r.title_tpl}</td><td className="nowrap">{r.delay_days} dn., {r.time_of_day}</td><td className="small">{r.assign_to === 'operator' ? r.operator_name : assign[r.assign_to]}</td><td className="num">{r.created_tasks}</td><td>{r.active ? 'tak' : 'nie'}</td>
            <td className="nowrap"><button className="btn sm" onClick={() => setForm({ ...r, remind_before_min: r.remind_before_min ?? '' })}>Edytuj</button> <button className="btn sm ghost danger" onClick={async () => { if (await confirm('Usunąć regułę?', { ok: 'Usuń', danger: true })) { await del(`/api/auto-rules/${r.id}`); d.reload(); } }}><Trash2 size={13} /></button></td></tr>)}
        </tbody>
      </table>
      {form && (
        <Modal title="Reguła automatycznego zadania" onClose={() => setForm(null)} width={700} onSubmit={save} footer={<><button type="button" className="btn" onClick={() => setForm(null)}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
          <div className="form-grid">
            <label className="lbl req">Nazwa</label><div className="span3"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <label className="lbl req">Zdarzenie</label><div className="span3"><Select value={form.event} onChange={(x) => setForm({ ...form, event: x })} empty={null} options={Object.entries(d.data.events).map(([k, l]) => ({ value: k, label: l as string }))} /></div>
            <label className="lbl req">Po ilu dniach</label><Input type="number" min={0} value={form.delay_days} onChange={(e) => setForm({ ...form, delay_days: Number(e.target.value) })} />
            <label className="lbl req">O godzinie</label><Input type="time" value={form.time_of_day} onChange={(e) => setForm({ ...form, time_of_day: e.target.value })} />
            <label className="lbl">Czas trwania [min]</label><Input type="number" min={5} value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })} />
            <label className="lbl">Priorytet</label><Select value={form.priority} onChange={(x) => setForm({ ...form, priority: x })} empty={null} options={Object.entries(PRIORITIES).map(([k, l]) => ({ value: Number(k), label: l }))} />
            <label className="lbl req">Tytuł zadania</label><div className="span3"><Input value={form.title_tpl} onChange={(e) => setForm({ ...form, title_tpl: e.target.value })} placeholder="Kontakt z nowym kontrahentem: {{kontrahent}}" /></div>
            <label className="lbl">Opis zadania</label><div className="span3"><Textarea rows={3} value={form.description_tpl ?? ''} onChange={(e) => setForm({ ...form, description_tpl: e.target.value })} /></div>
            <label className="lbl req">Przypisz do</label><Select value={form.assign_to} onChange={(x) => setForm({ ...form, assign_to: x })} empty={null} options={Object.entries(assign).map(([k, l]) => ({ value: k, label: l }))} />
            {form.assign_to === 'operator' ? (<><label className="lbl req">Operator</label><OperatorSelect value={form.operator_id} onChange={(x) => setForm({ ...form, operator_id: x })} /></>) : <><span /><span /></>}
            <label className="lbl">Przypomnienie [min przed]</label><Input type="number" min={0} value={form.remind_before_min ?? ''} onChange={(e) => setForm({ ...form, remind_before_min: e.target.value })} placeholder="puste = brak" />
            <label className="lbl">Aktywna</label><Check checked={!!form.active} onChange={(c) => setForm({ ...form, active: c })}>reguła działa</Check>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Smtp() {
  const { toast, reloadStatus } = useApp();
  const d = useApi<any>('/api/settings/smtp');
  const [v, setV] = useState<any>(null);
  const [to, setTo] = useState('');
  const [result, setResult] = useState<any>(null);
  useEffect(() => { if (d.data) setV({ ...d.data, password: '' }); }, [d.data]);
  if (!v) return <Loading />;
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x?.target ? x.target.value : x }));
  const save = async () => {
    try {
      const r = await put('/api/settings/smtp', v);
      toast(r.configured ? 'Zapisano konfigurację SMTP.' : 'Zapisano. Konfiguracja jest niekompletna (wymagane: serwer, port, adres nadawcy).', r.configured ? 'ok' : 'warn');
      d.reload();
      reloadStatus();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <div style={{ maxWidth: 720 }}>
      <Notice kind={d.data.configured ? 'ok' : 'warn'}>{d.data.configured ? 'Serwer SMTP skonfigurowany. Wiadomości z aplikacji są wysyłane.' : 'Serwer SMTP nie jest skonfigurowany. Wysyłane wiadomości czekają w kolejce „oczekuje na konfigurację”.'}</Notice>
      <form onSubmit={(e) => (e.preventDefault(), save())} className="mt12">
        <div className="form-grid">
          <label className="lbl req">Serwer SMTP</label><Input value={v.host} onChange={set('host')} placeholder="smtp.firma.pl" />
          <label className="lbl req">Port</label><Input type="number" value={v.port} onChange={set('port')} />
          <label className="lbl">Szyfrowanie</label><Select value={v.secure ? 1 : 0} onChange={(x) => set('secure')(!!x)} empty={null} options={[{ value: 0, label: 'STARTTLS / brak (port 587, 25)' }, { value: 1, label: 'SSL/TLS (port 465)' }]} />
          <label className="lbl">Ignoruj błędy certyfikatu</label><Check checked={!!v.ignore_tls_errors} onChange={set('ignore_tls_errors')}>tylko dla serwerów wewnętrznych</Check>
          <label className="lbl">Login</label><Input value={v.user} onChange={set('user')} autoComplete="off" />
          <label className="lbl">Hasło</label>
          <div>
            <Input type="password" value={v.password} onChange={set('password')} autoComplete="new-password" placeholder={d.data.has_password ? '•••••• (zapisane — wpisz, aby zmienić)' : ''} />
            {d.data.has_password && <Check checked={!!v.clear_password} onChange={set('clear_password')}>usuń zapisane hasło</Check>}
          </div>
          <label className="lbl req">Adres nadawcy</label><Input value={v.from_email} onChange={set('from_email')} placeholder="crm@firma.pl" />
          <label className="lbl">Nazwa nadawcy</label><Input value={v.from_name} onChange={set('from_name')} />
        </div>
        <div className="row mt12"><button className="btn primary"><Save size={14} /> Zapisz</button></div>
      </form>
      <p className="small muted mt8">Hasło jest przechowywane w bazie w postaci zaszyfrowanej i nie jest odsyłane do przeglądarki.</p>
      <div className="section-title">Wiadomość testowa</div>
      <div className="row"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="adres odbiorcy" style={{ width: 280 }} /><button className="btn" onClick={async () => { try { setResult(await post('/api/settings/smtp/test', { to })); } catch (e: any) { setResult({ ok: false, info: e.message }); } }}>Wyślij test</button></div>
      {result && <div className="mt8"><Notice kind={result.ok ? 'ok' : 'error'}>{result.info}</Notice></div>}
    </div>
  );
}

function Sms() {
  const { toast, reloadStatus } = useApp();
  const d = useApi<any>('/api/settings/sms');
  const [v, setV] = useState<any>(null);
  const [to, setTo] = useState('');
  const [result, setResult] = useState<any>(null);
  useEffect(() => { if (d.data) setV({ ...d.data, token: '' }); }, [d.data]);
  if (!v) return <Loading />;
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x?.target ? x.target.value : x }));
  const save = async () => {
    try {
      await put('/api/settings/sms', v);
      toast('Zapisano konfigurację bramki SMS.');
      d.reload();
      reloadStatus();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <div style={{ maxWidth: 820 }}>
      <Notice kind={d.data.configured ? 'ok' : 'warn'}>{d.data.configured ? 'Bramka SMS skonfigurowana.' : 'Bramka SMS nie jest skonfigurowana. SMS-y (przypomnienia, korespondencja) czekają w kolejce „oczekuje na konfigurację”.'}</Notice>
      <form onSubmit={(e) => (e.preventDefault(), save())} className="mt12">
        <div className="form-grid">
          <label className="lbl req">Bramka</label><Select value={v.provider} onChange={set('provider')} empty={null} options={[{ value: 'none', label: 'brak (wyłączone)' }, { value: 'smsapi', label: 'SMSAPI.pl (REST)' }, { value: 'http', label: 'dowolna bramka HTTP' }]} />
          <label className="lbl">Nadawca (pole „od”)</label><Input value={v.sender} onChange={set('sender')} />
          <label className="lbl">Klucz / token API</label>
          <div className="span3">
            <Input type="password" value={v.token} onChange={set('token')} autoComplete="new-password" placeholder={d.data.has_token ? '•••••• (zapisany — wpisz, aby zmienić)' : ''} />
            {d.data.has_token && <Check checked={!!v.clear_token} onChange={set('clear_token')}>usuń zapisany klucz</Check>}
          </div>
          {v.provider === 'smsapi' && (<><label className="lbl">Adres API</label><div className="span3"><Input value={v.smsapi_url} onChange={set('smsapi_url')} /></div></>)}
          {v.provider === 'http' && (
            <>
              <label className="lbl req">Adres URL</label><div className="span3"><Input value={v.http_url} onChange={set('http_url')} placeholder="https://bramka.example/api/send?to={{numer}}" /></div>
              <label className="lbl">Metoda</label><Select value={v.http_method} onChange={set('http_method')} empty={null} options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }]} />
              <label className="lbl">Content-Type</label><Input value={v.http_content_type} onChange={set('http_content_type')} />
              <label className="lbl">Treść żądania</label><div className="span3"><Textarea rows={3} value={v.http_body} onChange={set('http_body')} style={{ fontFamily: 'monospace' }} /></div>
              <label className="lbl">Tekst potwierdzenia</label><div className="span3"><Input value={v.http_success_text} onChange={set('http_success_text')} placeholder="np. OK — pusty: wystarczy kod HTTP 2xx" /></div>
              <div className="span4 small muted">Zmienne: {'{{numer}}'}, {'{{tresc}}'}, {'{{nadawca}}'}, {'{{token}}'}.</div>
            </>
          )}
        </div>
        <div className="row mt12"><button className="btn primary"><Save size={14} /> Zapisz</button></div>
      </form>
      <div className="section-title">SMS testowy</div>
      <div className="row"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="numer telefonu, np. 48600100200" style={{ width: 280 }} /><button className="btn" onClick={async () => { try { setResult(await post('/api/settings/sms/test', { to })); } catch (e: any) { setResult({ ok: false, info: e.message }); } }}>Wyślij test</button></div>
      {result && <div className="mt8"><Notice kind={result.ok ? 'ok' : 'error'}>{result.info}</Notice></div>}
    </div>
  );
}

function Company() {
  const { toast } = useApp();
  const d = useApi<any>('/api/settings/company');
  const [v, setV] = useState<any>(null);
  const [logoKey, setLogoKey] = useState(0);
  useEffect(() => { if (d.data) setV(d.data); }, [d.data]);
  if (!v) return <Loading />;
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x.target.value }));
  return (
    <div style={{ maxWidth: 760 }}>
      <p className="small muted">Dane firmy tworzą wspólny nagłówek i stopkę dokumentów generowanych z szablonów oraz raportów PDF.</p>
      <form onSubmit={async (e) => { e.preventDefault(); try { await put('/api/settings/company', v); toast('Zapisano dane firmy.'); } catch (er: any) { toast(er.message, 'error'); } }}>
        <div className="form-grid">
          <label className="lbl">Nazwa firmy</label><div className="span3"><Input value={v.name} onChange={set('name')} /></div>
          <label className="lbl">Adres</label><div className="span3"><Input value={v.address} onChange={set('address')} /></div>
          <label className="lbl">NIP</label><Input value={v.nip} onChange={set('nip')} />
          <label className="lbl">Telefon</label><Input value={v.phone} onChange={set('phone')} />
          <label className="lbl">E-mail</label><Input value={v.email} onChange={set('email')} />
          <label className="lbl">WWW</label><Input value={v.www} onChange={set('www')} />
          <label className="lbl">Rachunek bankowy</label><div className="span3"><Input value={v.bank_account} onChange={set('bank_account')} /></div>
          <label className="lbl">Stopka dokumentów</label><div className="span3"><Input value={v.footer} onChange={set('footer')} placeholder="np. Sąd Rejonowy…, KRS…, kapitał zakładowy…" /></div>
        </div>
        <div className="row mt12"><button className="btn primary"><Save size={14} /> Zapisz</button></div>
      </form>
      <div className="section-title">Logo (PNG lub JPG)</div>
      <div className="row">
        {v.logo_file_id ? <img key={logoKey} src={`/api/settings/logo?k=${logoKey}`} alt="Logo" style={{ maxHeight: 50, border: '1px solid var(--line)' }} /> : <span className="muted small">brak logo</span>}
        <input type="file" accept="image/png,image/jpeg" onChange={async (e) => { if (!e.target.files?.length) return; try { await upload('/api/settings/company/logo', e.target.files); toast('Zapisano logo.'); d.reload(); setLogoKey(logoKey + 1); } catch (er: any) { toast(er.message, 'error'); } }} aria-label="Logo" />
        {v.logo_file_id && <button className="btn sm" onClick={async () => { await del('/api/settings/company/logo'); d.reload(); }}>Usuń logo</button>}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { isAdmin } = useApp();
  const [tab, setTab] = useState('operators');
  if (!isAdmin)
    return (
      <div className="page">
        <div className="page-head"><h1>Ustawienia</h1></div>
        <div className="page-scroll"><Notice kind="info">Ustawienia systemu (operatorzy, słowniki, pola dodatkowe, reguły, poczta, SMS, dane firmy) są dostępne dla administratora. Hasło zmienisz przyciskiem z nazwą użytkownika na górnym pasku.</Notice></div>
      </div>
    );
  const tabs = [
    { key: 'operators', label: 'Operatorzy' },
    { key: 'departments', label: 'Działy' },
    { key: 'dicts', label: 'Słowniki' },
    { key: 'fields', label: 'Pola dodatkowe' },
    { key: 'rules', label: 'Reguły zadań' },
    { key: 'smtp', label: 'Poczta SMTP' },
    { key: 'sms', label: 'Bramka SMS' },
    { key: 'company', label: 'Dane firmy' },
  ];
  return (
    <div className="page">
      <div className="page-head"><h1>Ustawienia</h1></div>
      <Tabs active={tab} onChange={setTab} tabs={tabs} />
      <div className="page-scroll">
        {tab === 'operators' && <Operators />}
        {tab === 'departments' && <Departments />}
        {tab === 'dicts' && <Dictionaries />}
        {tab === 'fields' && <CustomFields />}
        {tab === 'rules' && <Rules />}
        {tab === 'smtp' && <Smtp />}
        {tab === 'sms' && <Sms />}
        {tab === 'company' && <Company />}
      </div>
    </div>
  );
}
export { get };
