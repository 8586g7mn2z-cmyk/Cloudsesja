import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { patch, qs } from '../lib/api';
import { addDays, addMinutes, fmtDate, fmtDateTime, today, weekStart } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { CalendarGrid } from '../components/CalendarGrid';
import { Check, ContractorPicker, DictSelect, Input, OperatorSelect, Select } from '../components/ui';
import { TaskForm } from './TaskForm';

export function CalendarPage() {
  const { toast, isManager, user } = useApp();
  const [view, setView] = useState<'day' | 'week'>('week');
  const [date, setDate] = useState(today());
  const [step, setStep] = useState(30);
  const [op, setOp] = useState<number | null>(isManager ? null : user!.id);
  const [contractor, setContractor] = useState<number | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(true);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyGroup, setOnlyGroup] = useState(false);
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState<{ id?: number; start?: string } | null>(null);
  const days = view === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  const list = useApi<any[]>(`/api/tasks${qs({ from: days[0], to: days[days.length - 1], operator_id: op, archived: archived ? 1 : '' })}`, [days[0], view, op, archived]);
  const tasks = useMemo(
    () =>
      (list.data ?? []).filter(
        (t) =>
          (showDone || t.is_open) &&
          (!onlyOverdue || t.overdue) &&
          (!onlyGroup || t.is_group) &&
          (!contractor || t.contractor_id === contractor) &&
          (!status || t.status_id === status) &&
          (!text || `${t.title} ${t.description ?? ''} ${t.project_name ?? ''} ${t.contractor_city ?? ''}`.toLowerCase().includes(text.toLowerCase())),
      ),
    [list.data, showDone, onlyOverdue, onlyGroup, contractor, status, text],
  );
  const move = async (t: any, start: string) => {
    try {
      await patch(`/api/tasks/${t.id}/move`, { start_at: start });
      toast(`Przeniesiono „${t.title}” na ${fmtDateTime(start)}.`);
      list.reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const shift = (n: number) => setDate(addDays(date, view === 'day' ? n : 7 * n));
  return (
    <div className="page">
      <div className="page-head">
        <h1>Kalendarz zadań</h1>
        <div className="btn-group">
          <button className={`btn ${view === 'day' ? 'active' : ''}`} onClick={() => setView('day')}>Dzień</button>
          <button className={`btn ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>Tydzień</button>
        </div>
        <div className="btn-group">
          <button className="btn icon" onClick={() => shift(-1)} title="Poprzedni"><ChevronLeft size={14} /></button>
          <button className="btn" onClick={() => setDate(today())}>Dziś</button>
          <button className="btn icon" onClick={() => shift(1)} title="Następny"><ChevronRight size={14} /></button>
        </div>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 140 }} aria-label="Data" />
        <b>{view === 'day' ? fmtDate(date) : `${fmtDate(days[0])} – ${fmtDate(days[6])}`}</b>
        <div className="grow" />
        <span className="small muted row gap4">Siatka <Select value={step} onChange={setStep} empty={null} options={[5, 15, 30, 60].map((s) => ({ value: s, label: `${s} min` }))} /></span>
        <button className="btn primary" onClick={() => setForm({ start: `${date}T09:00` })}><Plus size={14} /> Nowe zadanie</button>
      </div>
      <div className="dt-filters">
        <span className="fl" style={{ width: 220 }}>Operator <OperatorSelect value={op} onChange={setOp} empty={isManager ? '(wszyscy widoczni)' : null} /></span>
        <span className="fl" style={{ width: 280 }}>Kontrahent <ContractorPicker value={contractor} onChange={setContractor} /></span>
        <span className="fl" style={{ width: 200 }}>Status <DictSelect dict="task_status" value={status} onChange={setStatus} empty="(wszystkie)" /></span>
        <span className="fl">Temat / sprawa / miasto <Input value={text} onChange={(e) => setText(e.target.value)} style={{ width: 160 }} /></span>
        <Check checked={showDone} onChange={setShowDone}>zrealizowane</Check>
        <Check checked={archived} onChange={setArchived}>archiwalne</Check>
        <Check checked={onlyGroup} onChange={setOnlyGroup}>tylko grupowe</Check>
        <Check checked={onlyOverdue} onChange={setOnlyOverdue}>tylko przeterminowane</Check>
      </div>
      <CalendarGrid days={days} tasks={tasks} step={step} onOpen={(t) => setForm({ id: t.id })} onCreate={(s) => setForm({ start: s })} onMove={move} />
      <div className="dt-status">Zadań: {tasks.length}{list.loading ? ' · wczytywanie…' : ''} · przeciągnij zadanie, aby zmienić termin; dwuklik w pustym polu tworzy zadanie</div>
      {form && <TaskForm id={form.id} defaults={form.start ? { start_at: form.start, end_at: addMinutes(form.start, step >= 30 ? step : 30), operator_ids: op ? [op] : undefined } : undefined} onClose={() => setForm(null)} onSaved={() => (setForm(null), list.reload())} />}
    </div>
  );
}
