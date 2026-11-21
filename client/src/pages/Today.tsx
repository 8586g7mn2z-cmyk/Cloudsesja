import { useMemo, useState } from 'react';
import { Plus, Trash2, Check as CheckIcon } from 'lucide-react';
import { del, patch, post, put, qs } from '../lib/api';
import { addDays, addMinutes, fmtDateTime, longDate, today, weekdayIdx, WEEKDAYS } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { CalendarGrid, MiniCalendar } from '../components/CalendarGrid';
import { Input, Select } from '../components/ui';
import { TaskForm } from './TaskForm';

export function TodayPage() {
  const { user, toast } = useApp();
  const [day, setDay] = useState(today());
  const [step, setStep] = useState(15);
  const [form, setForm] = useState<{ id?: number; start?: string } | null>(null);
  const days7 = Array.from({ length: 7 }, (_, i) => addDays(today(), i));
  const from = day < today() ? day : today();
  const tasks = useApi<any[]>(`/api/tasks${qs({ mine: 1, from: addDays(from, -1), to: addDays(day > days7[6] ? day : days7[6], 1) })}`, [day]);
  const open = useApi<any[]>(`/api/tasks${qs({ mine: 1, open: 1 })}`);
  const notes = useApi<any[]>('/api/quick-notes');
  const [note, setNote] = useState('');
  const dayTasks = (tasks.data ?? []).filter((t) => t.start_at.slice(0, 10) <= day && t.end_at.slice(0, 10) >= day);
  const marked = useMemo(() => new Set((open.data ?? []).map((t) => t.start_at.slice(0, 10))), [open.data]);
  const overdue = (open.data ?? []).filter((t) => t.overdue);
  const upcoming = (open.data ?? []).filter((t) => !t.overdue && t.start_at.slice(0, 10) <= addDays(today(), 3));
  const reload = () => (tasks.reload(), open.reload());
  const move = async (t: any, start: string) => {
    try {
      await patch(`/api/tasks/${t.id}/move`, { start_at: start });
      toast(`Przeniesiono „${t.title}” na ${fmtDateTime(start)}.`);
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    const body = note;
    setNote(''); // od razu, żeby drugi klik lub Enter nie dodał notatki ponownie
    await post('/api/quick-notes', { body }).catch((e) => (setNote(body), toast(e.message, 'error')));
    notes.reload();
  };
  return (
    <div className="page">
      <div className="page-head">
        <h1>Moje zadania na dziś</h1>
        <span className="muted">{user?.name}</span>
        <div className="grow" />
        <span className="fl small muted row gap4">
          Siatka
          <Select value={step} onChange={setStep} empty={null} options={[5, 15, 30, 60].map((s) => ({ value: s, label: `${s} min` }))} />
        </span>
        <button className="btn primary" onClick={() => setForm({ start: `${day}T${day === today() ? new Date().toTimeString().slice(0, 2) : '09'}:00` })}>
          <Plus size={14} /> Nowe zadanie
        </button>
      </div>
      <div className="tabs" role="tablist">
        {days7.map((d) => (
          <button key={d} className={`tab ${d === day ? 'active' : ''}`} onClick={() => setDay(d)}>
            {d === today() ? 'Dziś' : WEEKDAYS[weekdayIdx(d)]} {d.slice(8, 10)}.{d.slice(5, 7)}
          </button>
        ))}
        {!days7.includes(day) && <button className="tab active">{longDate(day)}</button>}
      </div>
      <div className="split">
        <div className="left">
          {dayTasks.length === 0 && !tasks.loading && <div className="notice info" style={{ margin: 8 }}>Brak zadań na {day === today() ? 'dziś' : longDate(day)}. Dwuklik w siatce tworzy nowe zadanie.</div>}
          <CalendarGrid days={[day]} tasks={dayTasks} step={step} onOpen={(t) => setForm({ id: t.id })} onCreate={(s) => setForm({ start: s })} onMove={move} />
          <div className="dt-status">Zadań w dniu: {dayTasks.length}</div>
        </div>
        <aside className="side-panel" style={{ width: 330 }}>
          <div className="sp-body">
            <h2 style={{ color: 'var(--navy)', marginBottom: 8 }}>{longDate(day)}</h2>
            <MiniCalendar value={day} onChange={setDay} marked={marked} />
            <div className="section-title">Szybka notatka</div>
            <div className="row">
              <Input placeholder="Wpisz treść notatki…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
              <button className="btn icon" onClick={addNote} title="Dodaj notatkę"><Plus size={14} /></button>
            </div>
            <ul className="list-plain mt8">
              {(notes.data ?? []).map((n) => (
                <li key={n.id} className="row small" style={{ padding: '3px 0' }}>
                  <button className="btn sm ghost icon" title={n.done ? 'Przywróć' : 'Oznacz jako zrobione'} onClick={() => put(`/api/quick-notes/${n.id}`, { done: !n.done }).then(notes.reload)}>
                    <CheckIcon size={12} color={n.done ? 'var(--ok)' : 'var(--text-3)'} />
                  </button>
                  <span className="grow" style={{ textDecoration: n.done ? 'line-through' : undefined, color: n.done ? 'var(--text-3)' : undefined }}>{n.body}</span>
                  <button className="btn sm ghost icon danger" title="Usuń" onClick={() => del(`/api/quick-notes/${n.id}`).then(notes.reload)}><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
            <div className="section-title">Zaległe ({overdue.length})</div>
            <div className="urgent-list">
              {overdue.map((t) => (
                <div key={t.id} className="it overdue" onClick={() => setForm({ id: t.id })}>
                  <b>{t.contractor_short || t.contractor_name || ''}</b> {t.title}
                  <div className="xs muted">termin: {fmtDateTime(t.end_at)} · {t.progress}%</div>
                </div>
              ))}
              {!overdue.length && <div className="small muted">Brak zaległych zadań.</div>}
            </div>
            <div className="section-title">Najbliższe (3 dni)</div>
            <div className="urgent-list">
              {upcoming.map((t) => (
                <div key={t.id} className={`it ${t.priority >= 4 ? 'urgent' : ''}`} onClick={() => setForm({ id: t.id })}>
                  <b>{t.contractor_short || t.contractor_name || ''}</b> {t.title}
                  <div className="xs muted">{fmtDateTime(t.start_at)} · {t.priority_label} · {t.progress}%</div>
                </div>
              ))}
              {!upcoming.length && <div className="small muted">Brak zadań w najbliższych dniach.</div>}
            </div>
          </div>
        </aside>
      </div>
      {form && <TaskForm id={form.id} defaults={form.start ? { start_at: form.start, end_at: addMinutes(form.start, 30) } : undefined} onClose={() => setForm(null)} onSaved={() => (setForm(null), reload())} />}
    </div>
  );
}
