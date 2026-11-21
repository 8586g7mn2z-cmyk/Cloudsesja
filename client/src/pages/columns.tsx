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
  { key: 'project_name', label: 'Projekt', width: 140, hidden: true, filter: 'select' },
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
  { key: 'project_name', label: 'Projekt', width: 140, filter: 'select' },
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

export const projectColumns: Column<any>[] = [
  { key: 'number', label: 'Numer', width: 140 },
  { key: 'name', label: 'Nazwa projektu', width: 240 },
  { key: 'contractor_short', label: 'Kontrahent', width: 160, value: (r) => r.contractor_short || r.contractor_name || '' },
  { key: 'manager_name', label: 'Opiekun', width: 130, filter: 'select' },
  { key: 'status_name', label: 'Status', width: 110, filter: 'select' },
  { key: 'start_date', label: 'Rozpoczęcie', type: 'date', width: 100 },
  { key: 'end_date', label: 'Zakończenie', type: 'date', width: 100 },
  { key: 'stages', label: 'Etapy', width: 80, value: (r) => (r.stages_count ? `${r.stages_done}/${r.stages_count}` : '') },
  { key: 'budget', label: 'Budżet', type: 'money', width: 110, sum: true },
  { key: 'tasks_count', label: 'Zadania', type: 'int', width: 70 },
  { key: 'corr_count', label: 'Korespondencja', type: 'int', width: 100 },
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
  { key: 'project_name', label: 'Projekt', width: 140, hidden: true },
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
  { key: 'number', label: 'Nr', width: 160 },
  { key: 'published_at', label: 'Data publikacji', type: 'date', width: 105 },
  { key: 'name', label: 'Nazwa dokumentu', width: 260 },
  { key: 'ext', label: 'Roz.', width: 55, filter: 'select' },
  { key: 'size', label: 'Rozmiar', type: 'number', width: 90, sum: true, value: (r) => Math.round((r.size / 1024) * 100) / 100, render: (r) => <span className="v" style={{ textAlign: 'right' }}>{(r.size / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kB</span> },
  { key: 'folder_name', label: 'Segregator', width: 150, filter: 'select' },
  { key: 'type_name', label: 'Typ', width: 110, filter: 'select' },
  { key: 'current_version', label: 'Edycja', type: 'int', width: 60 },
  { key: 'created_at', label: 'Data utworzenia', type: 'date', width: 105 },
  { key: 'author_name', label: 'Utworzył', width: 130, filter: 'select' },
  { key: 'contractor_short', label: 'Kontrahent', width: 150, value: (r) => r.contractor_short || r.contractor_name || '' },
  { key: 'project_name', label: 'Projekt', width: 130, hidden: true },
  { key: 'valid_from', label: 'Ważny od', type: 'date', width: 95, hidden: true },
  { key: 'valid_to', label: 'Ważny do', type: 'date', width: 95 },
  { key: 'validity', label: 'Stan', width: 120, filter: 'select', render: (r) => <span className={`pill ${r.validity === 'aktualny' ? 'ok' : r.validity === 'jeszcze nieważny' ? 'navy' : 'warn'}`}>{r.validity}</span> },
  { key: 'description', label: 'Opis', width: 200, hidden: true },
  { key: 'level', label: 'Uprawnienie', width: 90, hidden: true, filter: 'select', value: (r) => (r.level === 'edit' ? 'edycja' : 'podgląd') },
];
