import { ArrowDownLeft, ArrowUpRight, Paperclip, Repeat, Users } from 'lucide-react';
import type { Column } from '../components/DataTable';
import { Progress, StatusDot } from '../components/ui';

export const correspondenceColumns: Column<any>[] = [
  {
    key: 'direction_label',
    label: 'Kierunek',
    width: 110,
    filter: 'select',
    render: (r) => (
      <span className="row gap4">
        {r.direction === 'out' ? <ArrowUpRight size={13} color="var(--navy-3)" /> : <ArrowDownLeft size={13} color="var(--ok)" />}
        {r.direction_label}
      </span>
    ),
  },
  { key: 'kind_name', label: 'Rodzaj', width: 90, filter: 'select' },
  { key: 'event_at', label: 'Data zdarzenia', type: 'datetime', width: 125 },
  { key: 'subject', label: 'Temat korespondencji', width: 220 },
  { key: 'topic_name', label: 'Temat (słownik)', width: 140, filter: 'select', hidden: true },
  { key: 'contractor_short', label: 'Kontrahent', width: 150, value: (r) => r.contractor_short || r.contractor_name || '' },
  { key: 'contact_name', label: 'Osoba', width: 140 },
  { key: 'operator_name', label: 'Operator', width: 130, filter: 'select' },
  { key: 'number', label: 'Nr', width: 150 },
  { key: 'duration_sec', label: 'Czas trwania', type: 'duration', width: 90, sum: true },
  { key: 'email_to', label: 'E-mail zewnętrzny', width: 160 },
  { key: 'project_name', label: 'Sprawa', width: 140, hidden: true, filter: 'select' },
  { key: 'stage_name', label: 'Etap', width: 120, hidden: true },
  { key: 'related_name', label: 'Kontrahent powiązany', width: 150, hidden: true },
  { key: 'contractor_city', label: 'Miasto', width: 110, hidden: true, filter: 'select' },
  { key: 'send_status_label', label: 'Wysyłka', width: 140, filter: 'select', render: (r) => (r.send_status ? <span className={`pill ${r.send_status === 'sent' ? 'ok' : r.send_status === 'failed' ? 'danger' : 'warn'}`}>{r.send_status_label}</span> : null) },
  { key: 'attachments_count', label: 'Zał.', type: 'int', width: 50, render: (r) => (r.attachments_count ? <span className="row gap4"><Paperclip size={12} />{r.attachments_count}</span> : null) },
];

export const taskColumns: Column<any>[] = [
  { key: 'start_at', label: 'Termin od', type: 'datetime', width: 120 },
  { key: 'end_at', label: 'Termin do', type: 'datetime', width: 120 },
  {
    key: 'title',
    label: 'Zadanie',
    width: 260,
    render: (r) => (
      <span className="row gap4 ellipsis" title={r.title}>
        {r.recurring ? <Repeat size={12} color="var(--text-3)" /> : null}
        {r.is_group ? <Users size={12} color="var(--text-3)" /> : null}
        <span className="ellipsis">{r.title}</span>
      </span>
    ),
  },
  { key: 'progress', label: 'Postęp', type: 'percent', width: 110, render: (r) => <span className="row" style={{ width: '100%' }}><Progress value={r.progress} /><span className="xs" style={{ width: 32, textAlign: 'right' }}>{r.progress}%</span></span> },
  { key: 'status_name', label: 'Status', width: 110, filter: 'select', render: (r) => <span className="ellipsis"><StatusDot color={r.status_color} />{r.status_name}</span> },
  { key: 'priority_label', label: 'Priorytet', width: 80, filter: 'select' },
  { key: 'operators_text', label: 'Wykonawcy', width: 150, filter: 'select' },
  { key: 'principal_name', label: 'Zlecający', width: 130, filter: 'select' },
  { key: 'contractor_short', label: 'Kontrahent', width: 150, value: (r) => r.contractor_short || r.contractor_name || '' },
  { key: 'contact_name', label: 'Osoba', width: 120, hidden: true },
  { key: 'project_name', label: 'Sprawa', width: 140, filter: 'select' },
  { key: 'correspondence_number', label: 'Korespondencja', width: 140, hidden: true },
  { key: 'contractor_city', label: 'Miasto', width: 110, hidden: true, filter: 'select' },
  { key: 'planned_minutes', label: 'Plan', type: 'minutes', width: 70, sum: true, hidden: true },
  { key: 'worked_minutes', label: 'Przepracowano', type: 'minutes', width: 100, sum: true },
  { key: 'overdue', label: 'Przeterminowane', type: 'bool', width: 100, filter: 'select' },
  { key: 'is_group', label: 'Grupowe', type: 'bool', width: 70, hidden: true, filter: 'select' },
  { key: 'recurring', label: 'Cykliczne', type: 'bool', width: 70, hidden: true, filter: 'select' },
  { key: 'auto', label: 'Automatyczne', type: 'bool', width: 90, hidden: true, filter: 'select' },
  { key: 'description', label: 'Opis', width: 200, hidden: true },
];

export const CASE_KINDS: Record<string, string> = { zapytanie: 'Zapytanie ofertowe', przetarg: 'Przetarg', projekt: 'Projekt' };
export const CASE_RESULTS = ['wygrane', 'przegrane', 'unieważnione', 'rezygnacja'];
/** Liczba dni do terminu składania ofert (ujemna = po terminie); null, gdy sprawa nie ma terminu lub jest rozstrzygnięta. */
export function daysToDeadline(r: any): number | null {
  if (!r.submit_deadline || r.result) return null;
  const d = new Date(`${r.submit_deadline.slice(0, 10)}T00:00:00`).getTime();
  const t = new Date(new Date().toDateString()).getTime();
  return Math.round((d - t) / 86400000);
}
export const projectColumns: Column<any>[] = [
  { key: 'number', label: 'Numer', width: 150 },
  { key: 'kind', label: 'Rodzaj', width: 130, filter: 'select', value: (r) => CASE_KINDS[r.kind] ?? r.kind },
  { key: 'name', label: 'Przedmiot', width: 280 },
  { key: 'contractor_short', label: 'Kontrahent / zamawiający', width: 170, value: (r) => r.contractor_short || r.contractor_name || '' },
  { key: 'ref_no', label: 'Znak sprawy', width: 130 },
  { key: 'status_name', label: 'Status', width: 120, filter: 'select' },
  { key: 'received_date', label: 'Data wpływu', type: 'date', width: 100 },
  { key: 'submit_deadline', label: 'Termin ofert', type: 'datetime', width: 125 },
  {
    key: 'days_left',
    label: 'Do terminu',
    width: 95,
    type: 'int',
    value: (r) => daysToDeadline(r) ?? '',
    render: (r) => {
      const d = daysToDeadline(r);
      return d == null ? <span className="v" /> : <span className={`v ${d <= 3 ? 'deadline-soon' : ''}`} style={{ textAlign: 'right' }}>{d < 0 ? `${-d} dni po` : d === 0 ? 'dziś' : `${d} dni`}</span>;
    },
  },
  { key: 'result', label: 'Wynik', width: 110, filter: 'select', value: (r) => r.result ?? '' },
  { key: 'manager_name', label: 'Opiekun', width: 130, filter: 'select' },
  { key: 'budget', label: 'Wartość', type: 'money', width: 110, sum: true },
  { key: 'docs_count', label: 'Dokumenty', type: 'int', width: 85 },
  { key: 'corr_count', label: 'Korespondencja', type: 'int', width: 105 },
  { key: 'tasks_count', label: 'Zadania', type: 'int', width: 70, hidden: true },
  { key: 'source', label: 'Źródło', width: 140, hidden: true, filter: 'select' },
  { key: 'stages', label: 'Etapy', width: 70, hidden: true, value: (r) => (r.stages_count ? `${r.stages_done}/${r.stages_count}` : '') },
  { key: 'result_date', label: 'Rozstrzygnięcie', type: 'date', width: 110, hidden: true },
];

export const orderColumns: Column<any>[] = [
  { key: 'number', label: 'Numer', width: 150 },
  { key: 'order_date', label: 'Data', type: 'date', width: 95 },
  { key: 'contractor_short', label: 'Kontrahent', width: 180, value: (r) => r.contractor_short || r.contractor_name },
  { key: 'contractor_city', label: 'Miasto', width: 110, filter: 'select', hidden: true },
  { key: 'status_name', label: 'Status', width: 110, filter: 'select' },
  { key: 'operator_name', label: 'Handlowiec', width: 130, filter: 'select' },
  { key: 'delivery_date', label: 'Termin dostawy', type: 'date', width: 110 },
  { key: 'items_count', label: 'Pozycji', type: 'int', width: 60 },
  { key: 'net_total', label: 'Wartość netto', type: 'money', width: 120, sum: true },
  { key: 'gross_total', label: 'Wartość brutto', type: 'money', width: 120, sum: true },
  { key: 'project_name', label: 'Sprawa', width: 140, hidden: true },
  { key: 'notes', label: 'Uwagi', width: 200, hidden: true },
];

export const saleColumns: Column<any>[] = [
  { key: 'doc_number', label: 'Dokument', width: 150 },
  { key: 'doc_date', label: 'Data', type: 'date', width: 95 },
  { key: 'month', label: 'Miesiąc', width: 80, hidden: true, value: (r) => r.doc_date?.slice(0, 7) },
  { key: 'contractor_short', label: 'Kontrahent', width: 180, value: (r) => r.contractor_short || r.contractor_name },
  { key: 'contractor_city', label: 'Miasto', width: 110, filter: 'select', hidden: true },
  { key: 'operator_name', label: 'Handlowiec', width: 130, filter: 'select' },
  { key: 'items_count', label: 'Pozycji', type: 'int', width: 60 },
  { key: 'net_total', label: 'Wartość netto', type: 'money', width: 120, sum: true },
  { key: 'gross_total', label: 'Wartość brutto', type: 'money', width: 120, sum: true },
  { key: 'source', label: 'Źródło', width: 90, filter: 'select' },
  { key: 'notes', label: 'Uwagi', width: 200, hidden: true },
];

export const documentColumns: Column<any>[] = [
  { key: 'number', label: 'Nr', width: 180 },
  { key: 'published_at', label: 'Data publikacji', type: 'date', width: 105 },
  { key: 'name', label: 'Nazwa dokumentu', width: 260 },
  { key: 'ext', label: 'Roz.', width: 55, filter: 'select' },
  { key: 'size', label: 'Rozmiar [kB]', type: 'number', width: 100, sum: true, value: (r) => Math.round((r.size / 1024) * 100) / 100, render: (r) => <span className="v" style={{ textAlign: 'right' }}>{(r.size / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kB</span> },
  { key: 'folder_name', label: 'Segregator', width: 150, filter: 'select' },
  { key: 'type_name', label: 'Typ', width: 110, filter: 'select' },
  { key: 'current_version', label: 'Edycja', type: 'int', width: 60 },
  { key: 'created_at', label: 'Data utworzenia', type: 'date', width: 105 },
  { key: 'author_name', label: 'Utworzył', width: 130, filter: 'select' },
  { key: 'contractor_short', label: 'Kontrahent', width: 150, value: (r) => r.contractor_short || r.contractor_name || '' },
  { key: 'project_name', label: 'Sprawa', width: 130, hidden: true },
  { key: 'valid_from', label: 'Ważny od', type: 'date', width: 95, hidden: true },
  { key: 'valid_to', label: 'Ważny do', type: 'date', width: 95 },
  { key: 'validity', label: 'Stan', width: 120, filter: 'select', render: (r) => <span className={`pill ${r.validity === 'aktualny' ? 'ok' : r.validity === 'jeszcze nieważny' ? 'navy' : 'warn'}`}>{r.validity}</span> },
  { key: 'description', label: 'Opis', width: 200, hidden: true },
  { key: 'level', label: 'Uprawnienie', width: 90, hidden: true, filter: 'select', value: (r) => (r.level === 'edit' ? 'edycja' : 'podgląd') },
];
