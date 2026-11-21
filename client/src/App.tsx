import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  CalendarDays, CalendarClock, Building2, MessagesSquare, Mails, Inbox, ListChecks, FolderKanban, Package, ShoppingCart, Receipt, FileText,
  FileStack, BarChart3, Upload, Settings, LogOut, Bell, KeyRound, Search, Repeat, Send,
} from 'lucide-react';
import { AppProvider, useApp } from './lib/store';
import { get, post, setUnauthorizedHandler } from './lib/api';
import { fmtDateTime, longDate, today } from './lib/format';
import { Modal, Input, Notice } from './components/ui';
import { LoginPage, ChangePasswordPage, ChangePasswordDialog } from './pages/Login';
import { TodayPage } from './pages/Today';
import { ContractorsPage } from './pages/Contractors';
import { ContractorCard } from './pages/ContractorCard';
import { CorrespondencePage } from './pages/Correspondence';
import { CampaignsPage } from './pages/Campaigns';
import { InternalPage } from './pages/Internal';
import { TasksPage } from './pages/Tasks';
import { CalendarPage } from './pages/Calendar';
import { SeriesPage } from './pages/Series';
import { ProjectsPage, ProjectCard } from './pages/Projects';
import { ProductsPage } from './pages/Products';
import { OrdersPage } from './pages/Orders';
import { SalesPage } from './pages/Sales';
import { DocumentsPage } from './pages/Documents';
import { TemplatesPage } from './pages/Templates';
import { ReportsPage } from './pages/Reports';
import { ImportPage } from './pages/Import';
import { SettingsPage } from './pages/Settings';
import { OutboxPage } from './pages/Outbox';
import { TaskForm } from './pages/TaskForm';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const h = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(h);
  }, []);
  return (
    <span className="clock">
      {longDate(today())}, {now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

function GlobalSearch() {
  const { contractors } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [contacts, setContacts] = useState<any[]>([]);
  const loaded = useRef(false);
  const res = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const digits = s.replace(/\D/g, '');
    const c = contractors
      .filter((x) => `${x.name} ${x.short_name ?? ''} ${x.city ?? ''} ${x.email ?? ''}`.toLowerCase().includes(s) || (digits.length >= 3 && `${x.nip ?? ''} ${(x.phone ?? '').replace(/\D/g, '')}`.includes(digits)))
      .slice(0, 12)
      .map((x) => ({ id: x.id, label: x.name, sub: [x.city, x.nip ? `NIP ${x.nip}` : ''].filter(Boolean).join(' · ') }));
    const p = contacts
      .filter((x) => `${x.first_name ?? ''} ${x.last_name} ${x.email ?? ''}`.toLowerCase().includes(s) || (digits.length >= 3 && `${x.phone ?? ''}${x.mobile ?? ''}`.replace(/\D/g, '').includes(digits)))
      .slice(0, 6)
      .map((x) => ({ id: x.contractor_id, label: `${x.first_name ?? ''} ${x.last_name}`.trim(), sub: `osoba · ${x.contractor_name}` }));
    return [...c, ...p];
  }, [q, contractors, contacts]);
  const go = (id: number) => {
    setQ('');
    nav(`/kontrahenci/${id}`);
  };
  return (
    <div className="search">
      <Search size={13} />
      <input
        placeholder="Szukaj kontrahenta: nazwa, NIP, telefon, e-mail, osoba…"
        value={q}
        onFocus={() => {
          if (!loaded.current) {
            loaded.current = true;
            get('/api/contacts').then(setContacts).catch(() => undefined);
          }
        }}
        onChange={(e) => (setQ(e.target.value), setHi(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setHi(Math.min(res.length - 1, hi + 1));
          if (e.key === 'ArrowUp') setHi(Math.max(0, hi - 1));
          if (e.key === 'Enter' && res[hi]) go(res[hi].id);
          if (e.key === 'Escape') setQ('');
        }}
        onBlur={() => setTimeout(() => setQ(''), 200)}
      />
      {q.trim().length >= 2 && (
        <div className="search-results">
          {res.length === 0 && <div className="muted">Brak wyników</div>}
          {res.map((r, i) => (
            <div key={`${r.id}-${i}`} className={i === hi ? 'active' : ''} onMouseDown={() => go(r.id)}>
              <div>{r.label}</div>
              <div className="xs muted">{r.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Komunikaty o przypomnieniach i nowych wiadomościach wewnętrznych (odpytywane co 30 s). */
function Notifications({ onCount }: { onCount: (n: { messages: number; outbox: number }) => void }) {
  const { toast } = useApp();
  const [data, setData] = useState<any>(null);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const seen = useRef<Set<number>>(new Set());
  const load = async () => {
    try {
      const d = await get('/api/notifications');
      setData(d);
      onCount({ messages: d.messages.length, outbox: d.outbox_problems });
      for (const m of d.messages) {
        if (!seen.current.has(m.id)) {
          seen.current.add(m.id);
          toast(`Nowa wiadomość od ${m.sender}: ${m.subject}`, 'info');
        }
      }
    } catch {
      /* brak sesji lub sieci */
    }
  };
  useEffect(() => {
    load();
    const h = setInterval(load, 30000);
    return () => clearInterval(h);
  }, []);
  const reminders: any[] = data?.reminders ?? [];
  const act = async (id: number, what: 'ack' | 'snooze', minutes?: number) => {
    try {
      await post(`/api/reminders/${id}/${what}`, minutes ? { minutes } : {});
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <>
      {reminders.length > 0 && !openTask && (
        <div className="overlay" style={{ zIndex: 200 }}>
          <div className="modal reminder-modal" style={{ width: 520 }} role="alertdialog" aria-label="Przypomnienie">
            <div className="modal-head">
              <Bell size={16} />
              <h2>Przypomnienie o zadaniu ({reminders.length})</h2>
            </div>
            <div className="modal-body">
              {reminders.map((r) => (
                <div key={r.id} className="reminder-item">
                  <div style={{ fontWeight: 600 }}>{r.title}</div>
                  <div className="small muted">
                    Termin: {fmtDateTime(r.start_at)} – {r.end_at.slice(11, 16)}
                    {r.short_name || r.contractor_name ? ` · ${r.short_name || r.contractor_name}` : ''}
                  </div>
                  <div className="row mt8 wrap">
                    <button className="btn primary sm" autoFocus onClick={() => act(r.id, 'ack')}>
                      Potwierdzam
                    </button>
                    <button className="btn sm" onClick={() => act(r.id, 'snooze', 5)}>
                      Przypomnij za 5 min
                    </button>
                    <button className="btn sm" onClick={() => act(r.id, 'snooze', 15)}>
                      za 15 min
                    </button>
                    <button className="btn sm" onClick={() => act(r.id, 'snooze', 60)}>
                      za 1 godz.
                    </button>
                    <button className="btn sm ghost" onClick={() => setOpenTask(r.task_id)}>
                      Otwórz zadanie
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {openTask && <TaskForm id={openTask} onClose={() => setOpenTask(null)} onSaved={() => (setOpenTask(null), load())} />}
    </>
  );
}

const NAV: { sec: string; items: { to: string; label: string; icon: any; manager?: boolean; admin?: boolean }[] }[] = [
  { sec: 'Praca', items: [
    { to: '/', label: 'Moje zadania na dziś', icon: CalendarDays },
    { to: '/kalendarz', label: 'Kalendarz zadań', icon: CalendarClock },
    { to: '/zadania', label: 'Rejestr zadań', icon: ListChecks },
    { to: '/zadania-cykliczne', label: 'Zadania cykliczne', icon: Repeat },
  ] },
  { sec: 'Kontrahenci', items: [
    { to: '/kontrahenci', label: 'Kontrahenci', icon: Building2 },
    { to: '/korespondencja', label: 'Korespondencja', icon: MessagesSquare },
    { to: '/korespondencja-seryjna', label: 'Korespondencja seryjna', icon: Mails },
    { to: '/wiadomosci', label: 'Korespondencja wewnętrzna', icon: Inbox },
  ] },
  { sec: 'Handel', items: [
    { to: '/projekty', label: 'Projekty', icon: FolderKanban },
    { to: '/zamowienia', label: 'Zamówienia', icon: ShoppingCart },
    { to: '/sprzedaz', label: 'Sprzedaż', icon: Receipt },
    { to: '/towary', label: 'Kartoteka towarowa', icon: Package },
  ] },
  { sec: 'Dokumenty', items: [
    { to: '/dokumenty', label: 'Rejestr dokumentów', icon: FileText },
    { to: '/szablony', label: 'Szablony dokumentów', icon: FileStack },
  ] },
  { sec: 'Analizy', items: [{ to: '/raporty', label: 'Raporty', icon: BarChart3 }] },
  { sec: 'Narzędzia', items: [
    { to: '/import', label: 'Import danych', icon: Upload, manager: true },
    { to: '/kolejka', label: 'Kolejka wysyłki', icon: Send },
    { to: '/ustawienia', label: 'Ustawienia', icon: Settings },
  ] },
];

function Layout() {
  const { user, setUser } = useApp();
  const nav = useNavigate();
  const [counts, setCounts] = useState({ messages: 0, outbox: 0 });
  const [pw, setPw] = useState(false);
  const logout = async () => {
    await post('/api/auth/logout').catch(() => undefined);
    setUser(null);
    nav('/');
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" /> DIAGNOS CRM
        </div>
        <GlobalSearch />
        <div className="spacer" />
        <Clock />
        <button className="tb-btn" title="Korespondencja wewnętrzna" onClick={() => nav('/wiadomosci')}>
          <Bell size={15} />
          {counts.messages > 0 && <span className="badge-count">{counts.messages}</span>}
        </button>
        {counts.outbox > 0 && (
          <button className="tb-btn" title="Wiadomości oczekujące na konfigurację lub z błędem wysyłki" onClick={() => nav('/kolejka')}>
            <Send size={15} /> <span className="badge-count">{counts.outbox}</span>
          </button>
        )}
        <button className="tb-btn" title="Zmień hasło" onClick={() => setPw(true)}>
          <KeyRound size={15} /> {user?.name}
        </button>
        <button className="tb-btn" title="Wyloguj" onClick={logout}>
          <LogOut size={15} /> Wyloguj
        </button>
      </header>
      <nav className="sidebar" aria-label="Nawigacja">
        {NAV.map((s) => (
          <div key={s.sec}>
            <div className="nav-sec">{s.sec}</div>
            {s.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <i.icon size={15} /> {i.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/kalendarz" element={<CalendarPage />} />
          <Route path="/zadania" element={<TasksPage />} />
          <Route path="/zadania-cykliczne" element={<SeriesPage />} />
          <Route path="/kontrahenci" element={<ContractorsPage />} />
          <Route path="/kontrahenci/:id" element={<ContractorCard />} />
          <Route path="/korespondencja" element={<CorrespondencePage />} />
          <Route path="/korespondencja-seryjna" element={<CampaignsPage />} />
          <Route path="/wiadomosci" element={<InternalPage />} />
          <Route path="/projekty" element={<ProjectsPage />} />
          <Route path="/projekty/:id" element={<ProjectCard />} />
          <Route path="/zamowienia" element={<OrdersPage />} />
          <Route path="/sprzedaz" element={<SalesPage />} />
          <Route path="/towary" element={<ProductsPage />} />
          <Route path="/dokumenty" element={<DocumentsPage />} />
          <Route path="/szablony" element={<TemplatesPage />} />
          <Route path="/raporty" element={<ReportsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/kolejka" element={<OutboxPage />} />
          <Route path="/ustawienia/*" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <Notifications onCount={setCounts} />
      {pw && <ChangePasswordDialog onClose={() => setPw(false)} />}
    </div>
  );
}

function Gate() {
  const { user, setUser } = useApp();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    get('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);
  if (!ready) return <div className="loading">Wczytywanie…</div>;
  if (!user) return <LoginPage />;
  if (user.must_change_password) return <ChangePasswordPage />;
  return <Layout />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Gate />
      </AppProvider>
    </BrowserRouter>
  );
}
export { Modal, Input, Notice };
