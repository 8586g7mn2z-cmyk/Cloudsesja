import { useEffect, useMemo, useRef, useState } from 'react';
import { Repeat, Users } from 'lucide-react';
import { addMinutes, fmtTime, parseIso, today, weekdayIdx, WEEKDAYS } from '../lib/format';

export interface CalTask {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  progress: number;
  status_code: string;
  overdue: number;
  priority: number;
  contractor_short?: string | null;
  contractor_name?: string | null;
  description?: string | null;
  principal_name?: string | null;
  operators_text?: string;
  is_group?: number;
  recurring?: number;
}

const SLOT_PX: Record<number, number> = { 5: 12, 15: 20, 30: 26, 60: 40 };

/** Siatka kalendarza (dzień lub tydzień) z przeciąganiem zadań między terminami. */
export function CalendarGrid({
  days,
  tasks,
  step,
  startHour = 7,
  endHour = 20,
  onOpen,
  onCreate,
  onMove,
}: {
  days: string[];
  tasks: CalTask[];
  step: number;
  startHour?: number;
  endHour?: number;
  onOpen: (t: CalTask) => void;
  onCreate: (startIso: string) => void;
  onMove: (t: CalTask, startIso: string) => void;
}) {
  const slotH = SLOT_PX[step] ?? 20;
  const ppm = slotH / step;
  const [drop, setDrop] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const h = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(h);
  }, []);
  // zakres godzin poszerzany o zadania spoza domyślnych godzin pracy
  const range = useMemo(() => {
    let s = startHour;
    let e = endHour;
    for (const t of tasks) {
      if (!days.includes(t.start_at.slice(0, 10))) continue;
      s = Math.min(s, parseIso(t.start_at).getHours());
      const end = parseIso(t.end_at);
      if (t.end_at.slice(0, 10) === t.start_at.slice(0, 10)) e = Math.max(e, end.getHours() + (end.getMinutes() ? 1 : 0));
    }
    return { s, e: Math.min(24, e) };
  }, [tasks, days, startHour, endHour]);
  const slots = useMemo(() => {
    const out: string[] = [];
    for (let m = range.s * 60; m < range.e * 60; m += step) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    return out;
  }, [range, step]);
  useEffect(() => {
    // przewiń do 8:00 przy pierwszym wyświetleniu
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (8 - range.s) * 60 * ppm - 10);
  }, [step]);

  const layout = useMemo(() => {
    const byDay: Record<string, { t: CalTask; top: number; h: number; lane: number; lanes: number }[]> = {};
    for (const d of days) {
      const list = tasks
        .filter((t) => t.start_at.slice(0, 10) <= d && t.end_at.slice(0, 10) >= d)
        .map((t) => {
          const s = t.start_at.slice(0, 10) < d ? range.s * 60 : parseIso(t.start_at).getHours() * 60 + parseIso(t.start_at).getMinutes();
          const e = t.end_at.slice(0, 10) > d ? range.e * 60 : parseIso(t.end_at).getHours() * 60 + parseIso(t.end_at).getMinutes();
          return { t, s: Math.max(s, range.s * 60), e: Math.max(Math.max(s, range.s * 60) + step, e) };
        })
        .sort((a, b) => a.s - b.s || b.e - a.e);
      const lanesEnd: number[] = [];
      const placed = list.map((x) => {
        let lane = lanesEnd.findIndex((end) => end <= x.s);
        if (lane < 0) {
          lane = lanesEnd.length;
          lanesEnd.push(x.e);
        } else lanesEnd[lane] = x.e;
        return { ...x, lane };
      });
      // liczba torów w obrębie nakładających się grup
      byDay[d] = placed.map((x) => {
        const overl = placed.filter((y) => y.s < x.e && y.e > x.s);
        const lanes = Math.max(...overl.map((y) => y.lane)) + 1;
        return { t: x.t, top: (x.s - range.s * 60) * ppm, h: Math.max(slotH - 2, (x.e - x.s) * ppm - 2), lane: x.lane, lanes };
      });
    }
    return byDay;
  }, [tasks, days, range, ppm, slotH, step]);

  const td = today();
  const nowTop = (now.getHours() * 60 + now.getMinutes() - range.s * 60) * ppm;
  return (
    <div className="cal">
      <div className="cal-days">
        {days.map((d) => {
          const wd = weekdayIdx(d);
          return (
            <div key={d} className={`cal-dayhead ${d === td ? 'today' : ''} ${wd >= 5 && d !== td ? 'weekend' : ''}`}>
              {d.slice(8, 10)}.{d.slice(5, 7)}.{d.slice(0, 4)} <span>{WEEKDAYS[wd]}</span>
            </div>
          );
        })}
      </div>
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-grid">
          <div className="cal-times">
            {slots.map((s) => (
              <div key={s} className={`cal-time ${s.endsWith(':00') ? 'hour' : ''}`} style={{ height: slotH }}>
                {s.endsWith(':00') || step >= 30 ? s : s.slice(3)}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className="cal-col">
              {slots.map((s) => {
                const key = `${d}T${s}`;
                const h = Number(s.slice(0, 2));
                return (
                  <div
                    key={s}
                    className={`cal-slot ${s.endsWith(':00') ? '' : ''} ${(parseInt(s.slice(3)) + step) % 60 === 0 ? 'hour' : ''} ${h < 8 || h >= 17 || weekdayIdx(d) >= 5 ? 'off' : ''} ${drop === key ? 'drop' : ''}`}
                    style={{ height: slotH }}
                    onDoubleClick={() => onCreate(key)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrop(key);
                    }}
                    onDragLeave={() => setDrop((x) => (x === key ? null : x))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrop(null);
                      const id = Number(e.dataTransfer.getData('text/task'));
                      const t = tasks.find((x) => x.id === id);
                      if (t && `${d}T${s}` !== t.start_at.slice(0, 16)) onMove(t, key);
                    }}
                    title={`${s} — dwuklik: nowe zadanie`}
                  />
                );
              })}
              {(layout[d] ?? []).map(({ t, top, h, lane, lanes }) => {
                const cls = t.status_code === 'done' ? 'done' : t.overdue ? 'overdue' : t.priority >= 4 ? 'urgent' : '';
                return (
                  <div
                    key={t.id}
                    className={`cal-ev ${cls}`}
                    style={{ top, height: h, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, right: 'auto' }}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/task', String(t.id))}
                    onClick={() => onOpen(t)}
                    title={`${fmtTime(t.start_at)}–${fmtTime(t.end_at)} ${t.title}${t.contractor_short || t.contractor_name ? ' · ' + (t.contractor_short || t.contractor_name) : ''}\nWykonawcy: ${t.operators_text ?? ''}\nPostęp: ${t.progress}%${t.description ? '\n' + t.description : ''}\nPrzeciągnij, aby zmienić termin.`}
                  >
                    <div className="t ellipsis">
                      {t.recurring ? <Repeat size={10} /> : null} {t.is_group ? <Users size={10} /> : null} {fmtTime(t.start_at)}–{fmtTime(t.end_at)} {t.contractor_short || t.contractor_name ? <b>{t.contractor_short || t.contractor_name}</b> : null}
                      {h < 30 && <span style={{ fontWeight: 400 }}> · {t.title}</span>}
                    </div>
                    {h >= 30 && <div className="ellipsis">{t.title}</div>}
                    {h > 40 && t.description && <div className="ellipsis muted">{t.description}</div>}
                    {h > 52 && t.principal_name && <div className="ellipsis muted">Zlecający: {t.principal_name}</div>}
                    <div className="prog" style={{ width: `${t.progress}%` }} />
                  </div>
                );
              })}
              {d === td && nowTop >= 0 && nowTop <= slots.length * slotH && <div className="cal-now" style={{ top: nowTop }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MiniCalendar({ value, onChange, marked }: { value: string; onChange: (d: string) => void; marked?: Set<string> }) {
  const [month, setMonth] = useState(value.slice(0, 7));
  useEffect(() => setMonth(value.slice(0, 7)), [value]);
  const first = parseIso(`${month}-01`);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - offset);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const shift = (n: number) => {
    const d = parseIso(`${month}-01`);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const td = today();
  const names = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  return (
    <div className="minical">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <button type="button" className="btn sm ghost" onClick={() => shift(-1)} aria-label="Poprzedni miesiąc">‹</button>
        <b>{names[first.getMonth()]} {first.getFullYear()}</b>
        <button type="button" className="btn sm ghost" onClick={() => shift(1)} aria-label="Następny miesiąc">›</button>
      </div>
      <table>
        <thead>
          <tr>{['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((d) => <th key={d}>{d}</th>)}</tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5].map((w) => (
            <tr key={w}>
              {cells.slice(w * 7, w * 7 + 7).map((d, i) => (
                <td key={d} className={`${d.slice(0, 7) !== month ? 'other' : ''} ${d === td ? 'today' : ''} ${d === value ? 'sel' : ''} ${marked?.has(d) ? 'has' : ''} ${i >= 5 ? 'we' : ''}`} onClick={() => onChange(d)}>
                  {Number(d.slice(8))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export { addMinutes };
