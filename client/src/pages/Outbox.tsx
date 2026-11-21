import { RefreshCw, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { DataTable, type Column } from '../components/DataTable';
import { Notice } from '../components/ui';

const cols: Column<any>[] = [
  { key: 'created_at', label: 'Utworzono', type: 'datetime', width: 125 },
  { key: 'channel', label: 'Kanał', width: 70, filter: 'select', value: (r) => (r.channel === 'email' ? 'e-mail' : 'SMS') },
  { key: 'recipient', label: 'Odbiorca', width: 200 },
  { key: 'subject', label: 'Temat', width: 260 },
  {
    key: 'status_label',
    label: 'Stan',
    width: 170,
    filter: 'select',
    render: (r) => <span className={`pill ${r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'danger' : r.status === 'cancelled' ? '' : 'warn'}`}>{r.status === 'awaiting_config' ? (r.channel === 'sms' ? 'oczekuje na konfigurację bramki' : 'oczekuje na konfigurację SMTP') : r.status_label}</span>,
  },
  { key: 'source', label: 'Źródło', width: 140, filter: 'select', value: (r) => (r.campaign_recipient_id ? 'korespondencja seryjna' : r.reminder_id ? 'przypomnienie' : r.report_schedule_id ? 'raport automatyczny' : r.correspondence_id ? 'korespondencja' : 'inne') },
  { key: 'corr_number', label: 'Nr korespondencji', width: 140 },
  { key: 'attempts', label: 'Próby', type: 'int', width: 55 },
  { key: 'sent_at', label: 'Wysłano', type: 'datetime', width: 125 },
  { key: 'last_error', label: 'Ostatni błąd', width: 260 },
  { key: 'created_by_name', label: 'Operator', width: 130, filter: 'select', hidden: true },
];

export function OutboxPage() {
  const { toast, status, isAdmin } = useApp();
  const nav = useNavigate();
  const list = useApi<any[]>('/api/outbox');
  const [sel, setSel] = useState<any>(null);
  const act = async (what: string) => {
    try {
      if (what === 'process') {
        const r = await post('/api/outbox/process');
        toast(`Przetworzono pozycji: ${r.processed}.`);
      } else await post(`/api/outbox/${sel.id}/${what}`);
      list.reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <h1>Kolejka wysyłki</h1>
        <span className="small muted">Wszystkie e-maile i SMS-y wysyłane przez system wraz ze stanem.</span>
      </div>
      {(!status.smtp_configured || !status.sms_configured) && (
        <div style={{ padding: '8px 12px 0' }}>
          <Notice kind="warn">
            {!status.smtp_configured && 'Serwer SMTP nie jest skonfigurowany — e-maile czekają w kolejce. '}
            {!status.sms_configured && 'Bramka SMS nie jest skonfigurowana — SMS-y czekają w kolejce. '}
            {isAdmin && <a href="/ustawienia" onClick={(e) => (e.preventDefault(), nav('/ustawienia'))}>Przejdź do ustawień</a>}
          </Notice>
        </div>
      )}
      <DataTable
        id="outbox"
        title="Kolejka wysyłki"
        columns={cols}
        rows={list.data}
        loading={list.loading}
        error={list.error}
        selectedKey={sel?.id}
        onSelect={setSel}
        defaultSort={[{ key: 'created_at', dir: -1 }]}
        toolbar={
          <>
            <button className="btn" onClick={() => act('process')}><RefreshCw size={14} /> Wyślij oczekujące teraz</button>
            <button className="btn" disabled={!sel || sel.status === 'sent'} onClick={() => act('retry')}><RotateCcw size={14} /> Ponów</button>
            <button className="btn" disabled={!sel || ['sent', 'cancelled'].includes(sel.status)} onClick={() => act('cancel')}><X size={14} /> Anuluj wysyłkę</button>
          </>
        }
        emptyText="Kolejka jest pusta."
      />
    </div>
  );
}
