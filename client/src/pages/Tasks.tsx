import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { patch, qs } from '../lib/api';
import { addDays, today } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable } from '../components/DataTable';
import { Check, Input, OperatorSelect } from '../components/ui';
import { taskColumns } from './columns';
import { TaskForm } from './TaskForm';

export function TasksPage() {
  const { isManager, toast } = useApp();
  const [from, setFrom] = useState(addDays(today(), -30));
  const [to, setTo] = useState(addDays(today(), 60));
  const [op, setOp] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [archived, setArchived] = useState(false);
  const [onlyGroup, setOnlyGroup] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const list = useApi<any[]>(`/api/tasks${qs({ from, to, operator_id: op, archived: archived ? 1 : '' })}`, [from, to, op, archived]);
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState<{ id?: number } | null>(null);
  const rows = useMemo(() => (list.data ?? []).filter((t) => (showDone || t.is_open) && (!onlyGroup || t.is_group) && (!onlyOverdue || t.overdue)), [list.data, showDone, onlyGroup, onlyOverdue]);
  const markDone = async () => {
    if (!sel) return;
    try {
      await patch(`/api/tasks/${sel.id}/progress`, { progress: 100 });
      toast('Oznaczono zadanie jako zrealizowane.');
      list.reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <h1>Rejestr zadań</h1>
        {isManager && <span className="small muted">Jako kierownik widzisz zadania swoich pracowników; wybierz operatora, aby zobaczyć stan jego zadań.</span>}
      </div>
      <DataTable
        id="tasks"
        title="Zadania"
        columns={taskColumns}
        rows={rows}
        loading={list.loading}
        error={list.error}
        onReload={list.reload}
        selectedKey={sel?.id}
        onSelect={setSel}
        onOpen={(r) => setForm({ id: r.id })}
        defaultSort={[{ key: 'start_at', dir: 1 }]}
        rowClass={(r) => (r.overdue ? 'alert' : !r.is_open ? 'muted-row' : '')}
        toolbar={
          <>
            <button className="btn primary" onClick={() => setForm({})}><Plus size={14} /> Nowe zadanie</button>
            <button className="btn" disabled={!sel || !sel.is_open} onClick={markDone}>Oznacz jako zrealizowane</button>
          </>
        }
        filters={
          <>
            <span className="fl">Termin od <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} /></span>
            <span className="fl">do <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} /></span>
            <span className="fl" style={{ width: 230 }}>Operator <OperatorSelect value={op} onChange={setOp} empty="(wszyscy widoczni)" /></span>
            <Check checked={showDone} onChange={setShowDone}>zrealizowane</Check>
            <Check checked={archived} onChange={setArchived}>archiwalne</Check>
            <Check checked={onlyGroup} onChange={setOnlyGroup}>tylko grupowe</Check>
            <Check checked={onlyOverdue} onChange={setOnlyOverdue}>tylko przeterminowane</Check>
          </>
        }
      />
      {form && <TaskForm id={form.id} onClose={() => setForm(null)} onSaved={() => (setForm(null), list.reload())} />}
    </div>
  );
}
