import { useState } from 'react';
import { Printer, FileDown, FileSpreadsheet, Play, Plus, Trash2 } from 'lucide-react';
import { del, download, get, post, put, qs } from '../lib/api';
import { addDays, fmtDate, fmtDateTime, today } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { BarChart } from '../components/BarChart';
import { fmtValue } from '../components/DataTable';
import { Check, DictSelect, Input, Loading, Modal, Notice, OperatorSelect, Select, Tabs } from '../components/ui';

const TYPE_MAP: Record<string, any> = { int: 'int', money: 'money', percent: 'percent', hours: 'number', number: 'number', date: 'date', datetime: 'datetime', text: 'text' };

function ReportParams({ type, p, set }: { type: string; p: any; set: (k: string, v: any) => void }) {
  const { isManager } = useApp();
  if (type === 'inactivity')
    return (
      <>
        <span className="fl">Brak kontaktu od <Input type="number" min={1} value={p.days} onChange={(e) => set('days', e.target.value)} style={{ width: 70 }} /> dni</span>
        <span className="fl" style={{ width: 200 }}>Status <DictSelect dict="contractor_status" value={p.status_id} onChange={(v) => set('status_id', v)} empty="(wszystkie)" /></span>
        <span className="fl" style={{ width: 200 }}>Grupa <DictSelect dict="contractor_group" value={p.group_id} onChange={(v) => set('group_id', v)} empty="(wszystkie)" /></span>
        <span className="fl" style={{ width: 220 }}>Prowadzący <OperatorSelect value={p.owner_id} onChange={(v) => set('owner_id', v)} empty="(wszyscy)" /></span>
        <Check checked={!!p.only_key} onChange={(v) => set('only_key', v)}>tylko kluczowi</Check>
      </>
    );
  return (
    <>
      <span className="fl">Okres od <Input type="date" value={p.from} onChange={(e) => set('from', e.target.value)} style={{ width: 140 }} /></span>
      <span className="fl">do <Input type="date" value={p.to} onChange={(e) => set('to', e.target.value)} style={{ width: 140 }} /></span>
      {(isManager || type === 'activity') && (
        <span className="fl" style={{ width: 230 }}>Operator <OperatorSelect value={p.operator_id} onChange={(v) => set('operator_id', v)} empty={type === 'activity' ? '(ja)' : '(wszyscy widoczni)'} /></span>
      )}
      {type === 'time' && <span className="fl">Wg <Select value={p.group_by} onChange={(v) => set('group_by', v)} empty={null} options={[{ value: 'operator', label: 'operatora' }, { value: 'contractor', label: 'kontrahenta' }, { value: 'project', label: 'sprawy' }]} /></span>}
    </>
  );
}

function ScheduleForm({ s, reports, periods, freqs, onClose, onSaved }: any) {
  const { toast, user } = useApp();
  const [v, setV] = useState<any>(s ?? { name: '', report_type: 'sales', period: 'current_month', frequency: 'month_last_day', weekday: 1, time_of_day: '18:00', recipients: user?.email ?? '', params: {}, active: 1 });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x?.target ? x.target.value : x }));
  const save = async () => {
    try {
      if (s) await put(`/api/report-schedules/${s.id}`, v);
      else await post('/api/report-schedules', v);
      toast('Zapisano harmonogram.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal title={s ? 'Raport automatyczny' : 'Nowy raport automatyczny'} onClose={onClose} width={640} onSubmit={save} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary">Zapisz</button></>}>
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      <div className="form-grid one">
        <label className="lbl req">Nazwa</label><Input value={v.name} onChange={set('name')} placeholder="np. Sprzedaż — koniec miesiąca" />
        <label className="lbl req">Raport</label><Select value={v.report_type} onChange={set('report_type')} empty={null} options={Object.entries(reports).map(([k, l]) => ({ value: k, label: l as string }))} />
        {v.report_type === 'inactivity' && (<><label className="lbl">Dni bez kontaktu</label><Input type="number" value={v.params.days ?? 30} onChange={(e) => setV((p: any) => ({ ...p, params: { ...p.params, days: Number(e.target.value) } }))} /></>)}
        {v.report_type === 'time' && (<><label className="lbl">Grupowanie</label><Select value={v.params.group_by ?? 'operator'} onChange={(g) => setV((p: any) => ({ ...p, params: { ...p.params, group_by: g } }))} empty={null} options={[{ value: 'operator', label: 'operator' }, { value: 'contractor', label: 'kontrahent' }, { value: 'project', label: 'projekt' }]} /></>)}
        <label className="lbl req">Okres danych</label><Select value={v.period} onChange={set('period')} empty={null} options={Object.entries(periods).map(([k, l]) => ({ value: k, label: l as string }))} />
        <label className="lbl req">Kiedy wysyłać</label><Select value={v.frequency} onChange={set('frequency')} empty={null} options={Object.entries(freqs).map(([k, l]) => ({ value: k, label: l as string }))} />
        {v.frequency === 'weekly' && (<><label className="lbl">Dzień tygodnia</label><Select value={v.weekday} onChange={set('weekday')} empty={null} options={['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'].map((d, i) => ({ value: i + 1, label: d }))} /></>)}
        <label className="lbl req">Godzina</label><Input type="time" value={v.time_of_day} onChange={set('time_of_day')} />
        <label className="lbl req">Odbiorcy (e-mail)</label><Input value={v.recipients} onChange={set('recipients')} placeholder="adres1@firma.pl, adres2@firma.pl" />
        <label className="lbl">Aktywny</label><Check checked={!!v.active} onChange={set('active')}>wysyłaj automatycznie</Check>
      </div>
    </Modal>
  );
}

function Schedules() {
  const { toast, status, confirm } = useApp();
  const meta = useApi<any>('/api/reports');
  const list = useApi<any[]>('/api/report-schedules');
  const [form, setForm] = useState<any>(null);
  const run = async (s: any) => {
    try {
      const r = await post(`/api/report-schedules/${s.id}/run`);
      toast(r.info, r.ok ? (r.info.includes('czeka') ? 'warn' : 'ok') : 'error');
      list.reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  if (!meta.data) return <Loading />;
  return (
    <div className="page-scroll">
      {!status.smtp_configured && <div className="mb8"><Notice kind="warn">Serwer SMTP nie jest skonfigurowany: raporty będą generowane, ale e-maile pozostaną w kolejce „oczekuje na konfigurację”.</Notice></div>}
      <div className="row mb8"><button className="btn primary" onClick={() => setForm({})}><Plus size={14} /> Nowy raport automatyczny</button></div>
      <table className="grid">
        <thead><tr><th>Nazwa</th><th>Raport</th><th>Okres</th><th>Kiedy</th><th>Odbiorcy</th><th>Następne uruchomienie</th><th>Ostatnie</th><th>Wynik</th><th /></tr></thead>
        <tbody>
          {(list.data ?? []).map((s) => (
            <tr key={s.id}>
              <td>{s.name}{!s.active && <span className="pill" style={{ marginLeft: 4 }}>wyłączony</span>}</td><td>{meta.data.reports[s.report_type]}</td><td>{meta.data.periods[s.period]}</td>
              <td>{meta.data.frequencies[s.frequency]} {s.time_of_day}</td><td className="small">{s.recipients}</td><td className="nowrap">{fmtDateTime(s.next_run_at)}</td><td className="nowrap">{fmtDateTime(s.last_run_at)}</td><td className="small">{s.last_status}</td>
              <td className="nowrap">
                <button className="btn sm" onClick={() => run(s)} title="Wygeneruj i wyślij teraz"><Play size={12} /> Uruchom teraz</button>
                <button className="btn sm ghost" onClick={() => setForm(s)}>Edytuj</button>
                <button className="btn sm ghost danger" title="Usuń harmonogram" onClick={async () => { if (await confirm(`Usunąć harmonogram „${s.name}”?`, { ok: 'Usuń', danger: true })) { await del(`/api/report-schedules/${s.id}`); list.reload(); } }}><Trash2 size={12} /></button>
              </td>
            </tr>
          ))}
          {!(list.data ?? []).length && <tr><td colSpan={9} className="muted">Brak raportów automatycznych.</td></tr>}
        </tbody>
      </table>
      {form && <ScheduleForm s={form.id ? form : undefined} reports={meta.data.reports} periods={meta.data.periods} freqs={meta.data.frequencies} onClose={() => setForm(null)} onSaved={() => (setForm(null), list.reload())} />}
    </div>
  );
}

export function ReportsPage() {
  const { toast, status } = useApp();
  const [tab, setTab] = useState('inactivity');
  const [params, setParams] = useState<Record<string, any>>({
    inactivity: { days: 30, only_key: false },
    sales: { from: `${today().slice(0, 8)}01`, to: today() },
    tasks: { from: `${today().slice(0, 8)}01`, to: today() },
    activity: { from: addDays(today(), -365), to: today() },
    time: { from: `${today().slice(0, 8)}01`, to: today(), group_by: 'operator' },
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = params[tab] ?? {};
  const q = qs(p);
  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult({ type: tab, ...(await get(`/api/reports/${tab}${q}`)) });
    } catch (e: any) {
      setError(e.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };
  const tabs = [
    { key: 'inactivity', label: 'Brak aktywności' },
    ...(status.modules?.sales ? [{ key: 'sales', label: 'Skuteczność handlowców' }] : []),
    { key: 'tasks', label: 'Statystyka zadań' },
    { key: 'activity', label: 'Aktywność operatora' },
    { key: 'time', label: 'Czas pracy' },
    { key: 'auto', label: 'Raporty automatyczne' },
  ];
  const r = result?.type === tab ? result : null;
  return (
    <div className="page">
      <div className="page-head no-print"><h1>Raporty</h1></div>
      <Tabs active={tab} onChange={(t) => setTab(t)} tabs={tabs} />
      {tab === 'auto' ? (
        <Schedules />
      ) : (
        <>
          <div className="dt-filters no-print">
            <ReportParams type={tab} p={p} set={(k, v) => setParams((x) => ({ ...x, [tab]: { ...x[tab], [k]: v } }))} />
            <button className="btn primary" onClick={run} disabled={loading}>{loading ? 'Liczenie…' : 'Generuj raport'}</button>
            {r && (
              <>
                <button className="btn" onClick={() => window.print()}><Printer size={14} /> Drukuj</button>
                <a className="btn" href={`/api/reports/${tab}/pdf${q}`} target="_blank" rel="noreferrer"><FileDown size={14} /> PDF</a>
                <button className="btn" onClick={() => download(`/api/reports/${tab}/xlsx${q}`).catch((e) => toast(e.message, 'error'))}><FileSpreadsheet size={14} /> XLSX</button>
              </>
            )}
          </div>
          <div className="page-scroll">
            {error && <Notice kind="error">{error}</Notice>}
            {!r && !error && <div className="empty">Ustaw parametry i kliknij „Generuj raport”.</div>}
            {r && (
              <div style={{ maxWidth: 1100 }}>
                <div style={{ borderBottom: '2px solid var(--navy)', paddingBottom: 6, marginBottom: 10 }}>
                  <h2 style={{ fontSize: 15, color: 'var(--navy)' }}>{r.title}</h2>
                  {r.subtitle && <div className="small muted">{r.subtitle}</div>}
                </div>
                {r.rows.length === 0 ? <div className="empty">Brak danych dla wybranych parametrów.</div> : (
                  <table className="grid">
                    <thead><tr>{r.columns.map((c: any) => <th key={c.key} className={['int', 'money', 'percent', 'hours', 'number'].includes(c.type) ? 'num' : ''}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {r.rows.map((row: any, i: number) => (
                        <tr key={i}>{r.columns.map((c: any) => <td key={c.key} className={['int', 'money', 'percent', 'hours', 'number'].includes(c.type) ? 'num' : ''}>{c.type === 'hours' ? Number(row[c.key] ?? 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 }) : fmtValue(TYPE_MAP[c.type ?? 'text'], row[c.key])}</td>)}</tr>
                      ))}
                    </tbody>
                    {r.totals && <tfoot><tr>{r.columns.map((c: any) => <td key={c.key} className={['int', 'money', 'percent', 'hours', 'number'].includes(c.type) ? 'num' : ''}>{c.type === 'hours' ? Number(r.totals[c.key] ?? 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 }) : fmtValue(TYPE_MAP[c.type ?? 'text'], r.totals[c.key])}</td>)}</tr></tfoot>}
                  </table>
                )}
                {r.chart && r.rows.length > 0 && r.chart.labels.length > 0 && (
                  <div className="mt12">
                    <BarChart labels={r.chart.labels} series={r.chart.series} unit={r.chart.unit} />
                  </div>
                )}
                <div className="xs muted mt8">DIAGNOS · wygenerowano {fmtDate(today())} {new Date().toTimeString().slice(0, 5)}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
