// Samouczek: prowadzi operatora krok po kroku po ekranach panelu, podświetlając omawiany element.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, X } from 'lucide-react';

interface Step {
  route: string;
  /** Element do podświetlenia; bez niego karta pojawia się na środku ekranu. */
  target?: string;
  title: string;
  text: string;
  /** Krok tylko dla administratora. */
  admin?: boolean;
  /** Krok tylko przy włączonym module. */
  module?: string;
}

const STEPS: Step[] = [
  { route: '/', title: 'Witamy w panelu DIAGNOS', text: 'Ten samouczek w kilka minut pokaże, gdzie co jest i jak wygląda codzienna praca: zapytania i przetargi, ich dokumentacja i historia, kontrahenci, korespondencja oraz zadania. Możesz go przerwać w każdej chwili i wrócić do niego przyciskiem „Samouczek” w górnym pasku.' },
  { route: '/', target: '.sidebar', title: 'Nawigacja', text: 'Menu po lewej jest podzielone na obszary pracy. „Praca” to Twój plan dnia i kalendarz, „Sprawy” to zapytania i przetargi, kontrahenci oraz korespondencja, dalej dokumenty i raporty.' },
  { route: '/', target: '.topbar .search', title: 'Szybkie wyszukiwanie', text: 'Wpisz fragment nazwy, NIP, numer telefonu, adres e-mail albo nazwisko osoby kontaktowej. Wynik otwiera od razu kartotekę kontrahenta, z dowolnego ekranu.' },
  { route: '/', target: '.main', title: 'Moje zadania na dziś', text: 'Ekran startowy: Twój plan dnia w siatce godzin. Dwuklik w wolne pole tworzy zadanie na tę godzinę. Po prawej są najbliższe terminy składania ofert, mini-kalendarz, szybkie notatki oraz zadania zaległe.' },
  { route: '/projekty', target: '.dt-toolbar', title: 'Zapytania i przetargi', text: 'Tu rejestrujesz każde zapytanie ofertowe i każdy przetarg: przedmiot, zamawiającego, znak sprawy, datę wpływu i termin składania ofert. Po podaniu terminu opiekun dostaje zadanie z przypomnieniem dzień wcześniej.' },
  { route: '/projekty', target: '.dt-filters', title: 'Co jest w toku, co pilne', text: 'Filtr „Pokaż” przełącza między sprawami w toku, tymi z terminem ofert w ciągu 14 dni i rozstrzygniętymi. Kolumna „Do terminu” pokazuje liczbę dni, a sprawy po terminie są wyróżnione kolorem.' },
  { route: '/projekty', target: '.dt-body', title: 'Kartoteka sprawy', text: 'Dwuklik otwiera kartotekę zapytania lub przetargu. Zakładka „Dokumentacja” zbiera pliki sprawy (treść zapytania, specyfikację, ofertę) z wersjami. Zakładka „Historia” pokazuje po kolei wszystko, co się wydarzyło: korespondencję, zadania, dokumenty i zmiany statusu.' },
  { route: '/projekty', target: 'select[aria-label="Grupuj według"]', title: 'Panel grupowania', text: 'Wybierz kolumnę, a rejestr pogrupuje się według niej, z licznikami w nagłówkach grup, np. według statusu, opiekuna albo zamawiającego. Możesz dodać kolejne poziomy. Grupowanie działa w każdym rejestrze i jest zapamiętywane.' },
  { route: '/kontrahenci', target: '.dt-toolbar', title: 'Rejestr kontrahentów', text: 'Tu dodasz nowego kontrahenta. Ikony po prawej to: filtry, wybór widocznych kolumn, eksport do CSV i XLSX oraz wydruk. Taki sam pasek ma każdy rejestr w systemie.' },
  { route: '/kontrahenci', target: '.dt-frow', title: 'Filtry w kolumnach', text: 'Pod nagłówkiem każdej kolumny jest pole filtra: wpisz tekst albo wybierz wartość z listy. Kliknięcie nagłówka sortuje. Nad tabelą są filtry szczególne, m.in. „tylko kluczowi” i „bez kontaktu od”.' },
  { route: '/kontrahenci', target: '.dt-body', title: 'Kartoteka kontrahenta', text: 'Pojedyncze kliknięcie pokazuje podgląd po prawej, dwuklik otwiera kartotekę. W zakładkach jest wszystko o firmie: dane, osoby kontaktowe, jej zapytania i przetargi, korespondencja, zadania, załączniki oraz pełna historia współpracy.' },
  { route: '/korespondencja', target: '.dt-toolbar', title: 'Korespondencja', text: 'Każdy kontakt zapisujesz jako korespondencję: telefon, e-mail, spotkanie lub notatkę, i wiążesz go z kontrahentem oraz sprawą. Formularz sam mierzy czas rozmowy i nadaje numer. Wpis trafia do historii sprawy i kontrahenta.' },
  { route: '/korespondencja-seryjna', target: '.main', title: 'Korespondencja seryjna', text: 'Jedna wiadomość do całej grupy kontrahentów albo do wyniku filtra z rejestru. W treści możesz użyć pól takich jak nazwa firmy czy imię osoby; przed wysyłką zobaczysz podgląd, a po niej status dla każdego odbiorcy.', module: 'mailing' },
  { route: '/kalendarz', target: '.main', title: 'Kalendarz zadań', text: 'Widok dnia lub tygodnia z wybraną gęstością siatki. Zadania przeciągasz między terminami. Przy zadaniu ustawisz przypomnienie: komunikat na ekranie, e-mail lub SMS, oraz stopień wykonania w procentach.' },
  { route: '/zadania-cykliczne', target: '.main', title: 'Zadania cykliczne', text: 'Zadanie cykliczne powtarza się codziennie, w wybrane dni tygodnia, co miesiąc albo co kilka dni.', module: 'task_tools' },
  { route: '/wiadomosci', target: '.main', title: 'Korespondencja wewnętrzna', text: 'Wiadomości między operatorami. Przy wysyłaniu możesz podać termin doręczenia, wtedy adresat zobaczy wiadomość dopiero o tej porze.', module: 'internal' },
  { route: '/dokumenty', target: '.main', title: 'Rejestr dokumentów', text: 'Wirtualna szafa firmy: segregatory po lewej, dokumenty po prawej. Trafiają tu także dokumenty dodane w kartotekach spraw. Każdy dokument ma wersje, okres ważności i historię zmian, a dostęp nadaje się działom lub poszczególnym osobom.' },
  { route: '/raporty', target: '.main', title: 'Raporty', text: 'Brak aktywności, statystyka zadań, aktywność operatora i czas pracy. Każdy raport można wydrukować, zapisać do PDF lub XLSX, a także ustawić automatyczną wysyłkę e-mailem, np. ostatniego dnia miesiąca.' },
  { route: '/ustawienia', target: '.main', title: 'Ustawienia', text: 'Operatorzy i działy, słowniki, własne pola dodatkowe kontrahenta, reguły zadań automatycznych, konfiguracja poczty i SMS. W zakładce „Moduły” włącza się dodatkowe części systemu, np. sprzedaż i zamówienia.', admin: true },
  { route: '/', title: 'To wszystko', text: 'Znasz już najważniejsze miejsca w panelu. Samouczek możesz uruchomić ponownie w każdej chwili przyciskiem „Samouczek” w górnym pasku.' },
];

const doneKey = (userId: number) => `diagnos.samouczek.${userId}`;
export function tourSeen(userId: number): boolean {
  try {
    return !!localStorage.getItem(doneKey(userId));
  } catch {
    return true;
  }
}
export function markTourSeen(userId: number) {
  try {
    localStorage.setItem(doneKey(userId), '1');
  } catch {
    /* pamięć przeglądarki niedostępna */
  }
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function Tour({ isAdmin, modules, onClose }: { isAdmin: boolean; modules: Record<string, boolean>; onClose: () => void }) {
  const steps = STEPS.filter((s) => (!s.admin || isAdmin) && (!s.module || modules[s.module]));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const nav = useNavigate();
  const loc = useLocation();
  const step = steps[i];

  useEffect(() => {
    if (loc.pathname !== step.route) nav(step.route);
  }, [i]);

  // Element pojawia się po wczytaniu danych ekranu, więc szukamy go przez chwilę i śledzimy zmiany układu.
  const measure = useCallback(() => {
    if (!step.target) return setRect(null);
    const el = document.querySelector(step.target);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return setRect(null);
    const pad = 4;
    setRect({ top: Math.max(0, r.top - pad), left: Math.max(0, r.left - pad), width: Math.min(window.innerWidth, r.width + 2 * pad), height: Math.min(window.innerHeight, r.height + 2 * pad) });
  }, [step]);
  useLayoutEffect(() => {
    measure();
    const h = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(h);
      window.removeEventListener('resize', measure);
    };
  }, [measure, loc.pathname]);

  const next = () => (i < steps.length - 1 ? setI(i + 1) : onClose());
  const prev = () => i > 0 && setI(i - 1);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  // Położenie karty: obok podświetlonego elementu, po tej stronie, gdzie jest najwięcej miejsca.
  const W = 380;
  const H = 230;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let pos: { top: number; left: number };
  if (!rect) pos = { top: Math.max(20, vh / 2 - H / 2), left: vw / 2 - W / 2 };
  else {
    const below = vh - (rect.top + rect.height);
    const right = vw - (rect.left + rect.width);
    if (below >= H + 16) pos = { top: rect.top + rect.height + 12, left: rect.left };
    else if (rect.top >= H + 16) pos = { top: rect.top - H - 12, left: rect.left };
    else if (right >= W + 16) pos = { top: rect.top + 24, left: rect.left + rect.width + 12 };
    else if (rect.left >= W + 16) pos = { top: rect.top + 24, left: rect.left - W - 12 };
    else pos = { top: vh - H - 24, left: vw - W - 24 }; // element zajmuje cały ekran: karta w rogu
    pos.left = Math.min(Math.max(12, pos.left), vw - W - 12);
    pos.top = Math.min(Math.max(12, pos.top), vh - H - 12);
  }

  return createPortal(
    <div className="tour" role="dialog" aria-label="Samouczek" aria-modal="true">
      {rect ? <div className="tour-hole" style={rect} /> : <div className="tour-shade" />}
      <div className="tour-card" style={{ ...pos, width: W }}>
        <div className="tour-head">
          <GraduationCap size={15} />
          <span className="tour-step">Krok {i + 1} z {steps.length}</span>
          <button type="button" className="tour-x" title="Zakończ samouczek (Esc)" onClick={onClose}><X size={14} /></button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tour-progress"><span style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
        <div className="tour-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Zakończ</button>
          <span className="grow" />
          {i > 0 && <button type="button" className="btn" onClick={prev}>Wstecz</button>}
          <button type="button" className="btn primary" onClick={next} autoFocus>{i < steps.length - 1 ? 'Dalej' : 'Gotowe'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Zaproszenie dla operatora, który jeszcze nie widział samouczka. Nie zasłania pracy i nie wymaga reakcji. */
export function TourInvite({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <div className="tour-invite" role="note">
      <div className="row"><GraduationCap size={15} /> <b>Pierwszy raz w panelu?</b></div>
      <p>Samouczek w kilka minut pokaże najważniejsze ekrany i sposób pracy.</p>
      <div className="row">
        <button type="button" className="btn primary sm" onClick={onStart}>Uruchom samouczek</button>
        <button type="button" className="btn ghost sm" onClick={onDismiss}>Nie teraz</button>
      </div>
    </div>
  );
}
