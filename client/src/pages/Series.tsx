import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { del, post, put } from '../lib/api';
import { fmtDate, PRIORITIES, today, WEEKDAYS } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable, type Column } from '../components/DataTable';
import { Check, ContractorPicker, Input, Modal, MultiOperator, Notice, Select, Textarea } from '../components/ui';

const FREQ: Record<string, string> = { daily: 'codziennie', weekly: 'co tydzień', monthly: 'co miesiąc', every_n_days: 'co N dni' };

export function describeSeries(s: any) {
  if (s.freq === 'daily') return s.interval_n > 1 ? `co ${s.interval_n} dni` : 'codziennie';
  if (s.freq === 'every_n_days') return `co ${s.interval_n} dni`;
  if (s.freq === 'weekly') return `${s.interval_n > 1 ? `co ${s.interval_n} tyg.` : 'co tydzień'}: ${(s.weekdays ?? []).map((d: number) => WEEKDAYS[d - 1].slice(0, 3)).join(', ')}`;
  if (s.freq === 'monthly') return `${s.interval_n > 1 ? `co ${s.interval_n} mies.` : 'co miesiąc'}, ${s.month_day}. dnia`;
  return '';
}

function SeriesForm({ s, onClose, onSaved }: { s?: any; onClose: () => void; onSaved: () => void }) {
  const { user, toast, confirm } = useApp();
  const [v, setV] = useState<any>(
    s ?? { title: '', description: '', operator_ids: [user!.id], priority: 2, contractor_id: null, freq: 'weekly', interval_n: 1, weekdays: [1], month_day: 1, start_date: today(), end_date: '', time_from: '09:00', time_to: '09:30', remind_before_min: 15, remind_inapp: 1, remind_email: 0, remind_sms: 0, active: 1 },
  );
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: any) => setV((p: any) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    setError(null);
    try {
      if (s) await put(`/api/task-series/${s.id}`, v);
      else {
        const r = await post('/api/task-series', v);
        toast(`Utworzono zadanie cykliczne; liczba zaplanowanych wystąpień na najbliższe 60 dni: ${r.generated}.`);
      }
      if (s) toast('Zapisano zadanie cykliczne.');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal
      title={s ? 'Zadanie cykliczne' : 'Nowe zadanie cykliczne'}
      onClose={onClose}
      width={760}
      onSubmit={save}
      footer={
        <>
          <div className="left">
            {s && (
              <button type="button" className="btn danger" onClick={async () => { if (await confirm('Usunąć zadanie cykliczne? Przyszłe, nierozpoczęte wystąpienia zostaną usunięte.', { ok: 'Usuń', danger: true })) { await del(`/api/task-series/${s.id}`); onSaved(); } }}>
                <Trash2 size={14} /> Usuń
              </button>
            )}
          </div>
          <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          <button className="btn primary">Zapisz</button>
        </>
      }
    >
      {error && <div className="mb8"><Notice kind="error">{error}</Notice></div>}
      {s && <div className="mb8"><Notice kind="info">Zmiana definicji przelicza przyszłe, nierozpoczęte wystąpienia. Wystąpienia rozpoczęte lub zrealizowane pozostają bez zmian.</Notice></div>}
      <div className="form-grid">
        <label className="lbl req">Tytuł</label>
        <div className="span3"><Input value={v.title} onChange={set('title')} /></div>
        <label className="lbl">Opis</label>
        <div className="span3"><Textarea rows={2} value={v.description} onChange={set('description')} /></div>
        <label className="lbl">Wykonawcy</label>
        <div className="span3"><MultiOperator value={v.operator_ids} onChange={set('operator_ids')} /></div>
        <label className="lbl">Kontrahent</label>
        <ContractorPicker value={v.contractor_id} onChange={set('contractor_id')} />
        <label className="lbl">Priorytet</label>
        <Select value={v.priority} onChange={set('priority')} empty={null} options={Object.entries(PRIORITIES).map(([k, l]) => ({ value: Number(k), label: l }))} />
        <label className="lbl req">Powtarzanie</label>
        <Select value={v.freq} onChange={set('freq')} empty={null} options={Object.entries(FREQ).map(([k, l]) => ({ value: k, label: l }))} />
        <label className="lbl">{v.freq === 'weekly' ? 'Co ile tygodni' : v.freq === 'monthly' ? 'Co ile miesięcy' : 'Co ile dni'}</label>
        <Input type="number" min={1} value={v.interval_n} onChange={(e) => set('interval_n')(Number(e.target.value))} />
        {v.freq === 'weekly' && (
          <>
            <label className="lbl">Dni tygodnia</label>
            <div className="span3 row wrap">
              {WEEKDAYS.map((d, i) => (
                <Check key={d} checked={v.weekdays.includes(i + 1)} onChange={(c) => set('weekdays')(c ? [...v.weekdays, i + 1].sort() : v.weekdays.filter((x: number) => x !== i + 1))}>{d}</Check>
              ))}
            </div>
          </>
        )}
        {v.freq === 'monthly' && (
          <>
            <label className="lbl">Dzień miesiąca</label>
            <Input type="number" min={1} max={31} value={v.month_day} onChange={(e) => set('month_day')(Number(e.target.value))} />
            <span className="small muted span3" style={{ gridColumn: 'span 2' }}>Dla krótszych miesięcy: ostatni dzień miesiąca.</span>
          </>
        )}
        <label className="lbl req">Od dnia</label>
        <Input type="date" value={v.start_date} onChange={set('start_date')} />
        <label className="lbl">Do dnia (koniec)</label>
        <Input type="date" value={v.end_date ?? ''} onChange={set('end_date')} />
        <label className="lbl req">Godzina od</label>
        <Input type="time" value={v.time_from} onChange={set('time_from')} />
        <label className="lbl req">do</label>
        <Input type="time" value={v.time_to} onChange={set('time_to')} />
        <label className="lbl">Przypomnienie</label>
        <Select value={v.remind_before_min ?? ''} onChange={(x) => set('remind_before_min')(x ?? '')} empty={null} options={[{ value: '', label: 'bez przypomnienia' }, { value: 0, label: 'w chwili rozpoczęcia' }, { value: 15, label: '15 min wcześniej' }, { value: 60, label: '1 godz. wcześniej' }, { value: 1440, label: '1 dzień wcześniej' }]} />
        <div className="row wrap" style={{ gridColumn: 'span 2' }}>
          <Check checked={!!v.remind_inapp} onChange={set('remind_inapp')}>komunikat</Check>
          <Check checked={!!v.remind_email} onChange={set('remind_email')}>e-mail</Check>
          <Check checked={!!v.remind_sms} onChange={set('remind_sms')}>SMS</Check>
        </div>
        <label className="lbl">Aktywne</label>
        <Check checked={!!v.active} onChange={set('active')}>generuj kolejne wystąpienia</Check>
      </div>
    </Modal>
  );
}

const cols: Column<any>[] = [
  { key: 'title', label: 'Zadanie', width: 240 },
  { key: 'rule', label: 'Powtarzanie', width: 200, value: (r) => describeSeries(r) },
  { key: 'hours', label: 'Godziny', width: 100, value: (r) => `${r.time_from}–${r.time_to}` },
  { key: 'start_date', label: 'Od', type: 'date', width: 95 },
  { key: 'end_date', label: 'Do', type: 'date', width: 95 },
  { key: 'operators_text', label: 'Wykonawcy', width: 180 },
  { key: 'contractor_name', label: 'Kontrahent', width: 160 },
  { key: 'next_at', label: 'Najbliższe wystąpienie', type: 'datetime', width: 140 },
  { key: 'occurrences', label: 'Wystąpień', type: 'int', width: 80 },
  { key: 'active', label: 'Aktywne', type: 'bool', width: 70, filter: 'select' },
];

export function SeriesPage() {
  const list = useApi<any[]>('/api/task-series');
  const [form, setForm] = useState<any>(null);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Zadania cykliczne</h1>
        <span className="small muted">System tworzy wystąpienia z wyprzedzeniem 60 dni; każde wystąpienie to zwykłe zadanie z własnym postępem.</span>
      </div>
      <DataTable id="series" title="Zadania cykliczne" columns={cols} rows={list.data} loading={list.loading} error={list.error} onOpen={(r) => setForm(r)} toolbar={<button className="btn primary" onClick={() => setForm({})}><Plus size={14} /> Nowe zadanie cykliczne</button>} emptyText="Brak zadań cyklicznych." />
      {form && <SeriesForm s={form.id ? { ...form, end_date: form.end_date ?? '', remind_before_min: form.remind_before_min ?? '' } : undefined} onClose={() => setForm(null)} onSaved={() => (setForm(null), list.reload())} />}
    </div>
  );
}
export { fmtDate };
