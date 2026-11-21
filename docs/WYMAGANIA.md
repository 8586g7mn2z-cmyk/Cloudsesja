# Wymagania klienta — stan realizacji

Legenda stanu:

- **działa, sprawdzone testem** — pokryte testem automatycznym (`npm test` — Vitest, backend; `npm run test:e2e` — Playwright, przeglądarka),
- **działa, sprawdzone w przeglądarce** — sprawdzone ręcznie / skryptem w przeglądarce (zrzuty w `docs/zrzuty/`), bez dedykowanego testu automatycznego,
- **działa, wymaga konfiguracji** — zbudowane do końca, sprawdzone na lokalnym zamienniku; do pracy produkcyjnej potrzebne dane od klienta,
- **częściowo** / **niezrobione** — opis braków w kolumnie „Uwagi”.

Stan na: 21.11.2026. Testy: 32 testy backendu (6 plików) i 1 test przeglądarkowy głównej ścieżki — wszystkie przechodzą.

## Wspólna podstawa

| Wymaganie | Gdzie w aplikacji | Stan | Jak sprawdzono / uwagi |
|---|---|---|---|
| Logowanie, hasła haszowane, sesje po stronie serwera | ekran logowania; `server/src/auth.ts` (scrypt, tabela `sessions`, ciasteczko httpOnly) | działa, sprawdzone testem | `auth.test.ts`, e2e (złe hasło, poprawne logowanie) |
| Konto administratora przy pierwszym uruchomieniu, wymuszona zmiana hasła | start serwera; ekran „Zmiana hasła startowego” | działa, sprawdzone testem | `auth.test.ts`, e2e, uruchomienie w Dockerze |
| Operatorzy, role (administrator, kierownik, handlowiec), przełożeni, działy (grupy uprawnień) | Ustawienia → Operatorzy, Działy | działa, sprawdzone w przeglądarce | zrzut 36; role egzekwowane na serwerze — `auth.test.ts` |
| Uprawnienia egzekwowane na backendzie | wszystkie trasy API | działa, sprawdzone testem | `auth.test.ts` (handlowiec: konfiguracja, operatorzy, słowniki, reguły → 403), `documents.test.ts` |
| Uniwersalny rejestr: filtry, sortowanie, wybór kolumn, grupowanie po kilku kolumnach z licznikami i sumami, licznik rekordów, eksport XLSX/CSV, wydruk | `client/src/components/DataTable.tsx`, używany we wszystkich rejestrach | działa, sprawdzone w przeglądarce | zrzuty 02, 03, 22; skrypt przeglądarkowy: eksport XLSX i CSV pobrane, wydruk otwiera okno z nagłówkami grup; e2e: grupa „KRAKÓW ilość: 1” |
| Płynna praca przy kilku tysiącach rekordów | wirtualizacja wierszy w rejestrze | działa, sprawdzone w przeglądarce | 5064 kontrahentów: wczytanie z grupowaniem ok. 0,6 s, wyszukiwanie ok. 25 ms, drugi poziom grupowania ok. 0,3 s, w DOM ok. 30 wierszy |
| Słowniki edytowalne przez administratora (typy, statusy, grupy i podgrupy, grupy cenowe, źródła kontaktu, tematy i rodzaje korespondencji, typy dokumentów, statusy zadań, statusy projektów i zamówień) | Ustawienia → Słowniki; segregatory w Rejestrze dokumentów | działa, sprawdzone w przeglądarce | zrzut 37; pozycje systemowe (np. „Zrealizowane”, „E-mail”) można przemianować, nie usunąć; używane pozycje są dezaktywowane zamiast usuwane |
| Pola dodatkowe (tekst, liczba, data, lista, tak/nie) w kartotece, filtrach i kolumnach rejestru | Ustawienia → Pola dodatkowe; kartoteka → Szczegóły; rejestr kontrahentów (wybór kolumn) | działa, sprawdzone w przeglądarce | zrzuty 04, 38; walidacja typów na serwerze; import pól dodatkowych — `import-reports.test.ts` |

## Kontrahenci

| Wymaganie | Gdzie | Stan | Jak sprawdzono / uwagi |
|---|---|---|---|
| Rejestr z szybkim wyszukiwaniem po nazwie, NIP, telefonie, e-mailu, osobie | Kontrahenci; wyszukiwarka na górnym pasku | działa, sprawdzone w przeglądarce | e2e: wyszukanie po NIP w górnej wyszukiwarce; wyszukiwanie obejmuje osoby kontaktowe i cyfry telefonu |
| Filtry jak na zrzucie 01, grupowanie (miasto, status, grupa…), panel podglądu z osobami | Kontrahenci | działa, sprawdzone w przeglądarce | zrzuty 02, 03; dodatkowe filtry: tylko kluczowi, bez kontaktu od N dni, nieaktywni |
| Kartoteka z zakładkami: szczegóły, adresy (siedziba, korespondencyjny, dostawy), osoby, korespondencja, zadania, projekty, zamówienia, sprzedaż, załączniki, notatki, grupy, WWW, lokalizacja | Kontrahenci → kartoteka | działa, sprawdzone w przeglądarce | zrzuty 04–10; lokalizacja: odnośniki do OpenStreetMap i Map Google z adresu |
| Dane rejestracyjne (NIP, REGON, KRS, urząd skarbowy), typ, status, grupa/podgrupa, grupa cenowa, źródło, prowadzący, limit kredytu, polecony przez, centrala, nr umowy, uprawnienia | kartoteka → Szczegóły | działa, sprawdzone w przeglądarce | zrzut 04; podgrupa sprawdzana względem grupy na serwerze |
| Notatki i komentarze w kartotece | kartoteka → Notatki | działa, sprawdzone w przeglądarce | |
| Osoby kontaktowe (stanowisko, telefony, e-mail, uwagi), wiele na kontrahenta | kartoteka → Osoby | działa, sprawdzone testem | e2e (dodanie osoby i wybór jako adresata korespondencji) |
| Załączniki z podziałem wg źródła (kartoteka, korespondencja, projekty, rejestr dokumentów) | kartoteka → Załączniki | działa, sprawdzone testem | `documents.test.ts` (dokument z szablonu widoczny w kartotece), e2e („Z rejestru dokumentów (1)”) |
| Walidacja NIP i REGON (suma kontrolna), ostrzeżenie o duplikacie NIP | formularz kontrahenta (na żywo) i serwer | działa, sprawdzone testem | `util.test.ts`, e2e (komunikat o błędnym NIP); duplikat: ostrzeżenie i ponowne potwierdzenie zapisu |
| Import kontrahentów i osób z XLSX/CSV: mapowanie, podgląd, raport (dodane/zaktualizowane/odrzucone z powodem) | Narzędzia → Import danych | działa, sprawdzone testem | `import-reports.test.ts` (błędne wiersze, podgląd bez zapisu, ponowny import bez duplikatów); format: `docs/IMPORT.md` |
| Import z programu fakturującego (kontrahenci, osoby, towary, transakcje) | Import danych (źródło plikowe) | działa, sprawdzone testem — import plikowy | Program klienta to enova365; **integracja z enova365 zaplanowana na kolejny etap**, obecnie import plikowy (eksport XLSX/CSV). Rekordy mają `external_source` i `external_id`, ponowny import aktualizuje po nich (kontrahenci zapasowo po NIP); logika importu oddzielona od źródła (`importCore.ts`) |

## Korespondencja

| Wymaganie | Gdzie | Stan | Jak sprawdzono / uwagi |
|---|---|---|---|
| Zapis kontaktu: rodzaj (telefon, e-mail, SMS, spotkanie, notatka, pismo), kierunek, data i godzina, temat ze słownika i własny, kontrahent, adresat, operator, projekt i etap, kontrahent powiązany, treść, załączniki | formularz korespondencji (Ogólne / Treść / Załączniki) | działa, sprawdzone testem | e2e; zrzut 11 |
| Faktyczny czas trwania: stoper od otwarcia formularza, ręczna korekta | stoper w nagłówku okna, pole „Czas trwania” | działa, sprawdzone testem | e2e (stoper rośnie), `util.test.ts` (zapis czasu); stoper można zatrzymać/wznowić |
| Automatyczny numer `DIAGNOS/n/RRRRMMDD` | pole „Nr” | działa, sprawdzone testem | `util.test.ts`, e2e |
| Rejestr globalny i w kartotece kontrahenta / projektu; kto, kiedy, z kim, w jakiej formie | Korespondencja; zakładki kartotek | działa, sprawdzone w przeglądarce | zrzuty 06, 13, 20 |
| Wysyłka e-mail przez SMTP z ustawień; hasło nie wraca do przeglądarki; wysłana wiadomość = korespondencja wychodząca | „Zapisz i wyślij e-mail”; Ustawienia → Poczta SMTP | działa, wymaga konfiguracji | `messaging.test.ts` na lokalnym serwerze SMTP: wysyłka z załącznikiem, status „wysłano”, test połączenia, zgłaszanie błędu serwera; `auth.test.ts`: hasło zaszyfrowane i niewidoczne. **Potrzebne dane serwera SMTP klienta** |
| Załączniki do e-maila z rejestru dokumentów; zapis załączników korespondencji do rejestru | Załączniki → „Z rejestru dokumentów”, ikona „Zapisz w rejestrze dokumentów” | działa, sprawdzone testem | `documents.test.ts` (dołączenie dokumentu z kontrolą uprawnień); zapis do rejestru sprawdzony w przeglądarce |
| Korespondencja seryjna: grupa kontrahentów lub wynik filtra rejestru, pola podstawiane, podgląd, kolejka, status per odbiorca, wpis korespondencji u każdego | Korespondencja seryjna; „Korespondencja seryjna do wyniku” w rejestrze kontrahentów | działa, wymaga konfiguracji SMTP | `messaging.test.ts` (podstawienia, pominięcie odbiorców bez e-maila, statusy, wpisy korespondencji); zrzut 14 |
| Korespondencja wewnętrzna: do jednej, kilku osób lub wszystkich, termin doręczenia, skrzynka, znacznik przeczytania, powiadomienie | Korespondencja wewnętrzna; dzwonek na górnym pasku | działa, sprawdzone testem | `tasks.test.ts` (doręczenie dopiero o czasie, przeczytanie, licznik powiadomień); zrzut 15 |
| SMS: wymienny adapter bramki, ekran konfiguracji, kolejka „oczekuje na konfigurację bramki” | Ustawienia → Bramka SMS; Kolejka wysyłki | działa, wymaga konfiguracji | `messaging.test.ts` (brak bramki → kolejka; adapter HTTP na lokalnej bramce testowej → wysłano). Adapter SMSAPI.pl napisany wg dokumentacji, **niesprawdzony z prawdziwym kontem** — potrzebna bramka i klucz klienta |
| Interfejs mówi wprost o braku SMTP / bramki | komunikaty w formularzach, kolejka, ikona na pasku | działa, sprawdzone w przeglądarce | zrzuty 14, 34 |

## Zadania i kalendarz

| Wymaganie | Gdzie | Stan | Jak sprawdzono / uwagi |
|---|---|---|---|
| Zadanie: tytuł, opis, termin od–do, wykonawca, zlecający, priorytet, status, stopień wykonania %, powiązania (kontrahent, osoba, korespondencja, projekt i etap), zadania grupowe, przepracowany czas | formularz zadania (Ogólne / Czas pracy / Załączniki) | działa, sprawdzone testem | e2e (postęp 30%), `tasks.test.ts`, `import-reports.test.ts` (ewidencja czasu) |
| Ekran startowy „Moje zadania na dziś”: kalendarz dnia z zakładkami kolejnych dni, mini-kalendarz, szybka notatka, zaległe i najbliższe | strona startowa po zalogowaniu | działa, sprawdzone w przeglądarce | zrzut 01 |
| Kalendarz dzienny i tygodniowy, siatka 5/15/30/60 min, przeciąganie zadań, filtry (operator, kontrahent, status, temat/projekt/miasto, zrealizowane, archiwalne, grupowe, przeterminowane) | Kalendarz zadań | działa, sprawdzone w przeglądarce | zrzut 16; przeciągnięcie zadania na inny dzień i godzinę sprawdzone skryptem przeglądarkowym (także na pole zajęte przez inne zadanie) |
| Rejestr zadań z filtrami | Rejestr zadań | działa, sprawdzone w przeglądarce | zrzut 17 |
| Zadania cykliczne (codziennie, co tydzień w wybrane dni, co miesiąc, co N dni, data końca) | Zadania cykliczne | działa, sprawdzone testem | `tasks.test.ts` (dni tygodnia, co 2 tygodnie, 31. dzień → ostatni dzień miesiąca, co N dni, zmiana czasu, idempotencja, przeliczenie po zmianie). Wystąpienia tworzone z wyprzedzeniem 60 dni, uzupełniane co godzinę |
| Zadania generowane automatycznie wg reguł (zdarzenie → szablon → opóźnienie), m.in. nowy kontrahent → „kontakt” po N dniach | Ustawienia → Reguły zadań | działa, sprawdzone testem | `tasks.test.ts` (nowy kontrahent, zamówienie), e2e; zdarzenia: nowy kontrahent, zamówienie, projekt, korespondencja przychodząca |
| Przypomnienia z wyprzedzeniem: komunikat wymagający potwierdzenia lub odłożenia, e-mail, SMS | formularz zadania → Przypomnienie; okno przypomnienia | działa, sprawdzone testem (e-mail/SMS wymagają konfiguracji) | `tasks.test.ts` (moment, odłożenie, potwierdzenie, e-mail tylko raz, kolejka bez SMTP); okno przypomnienia sprawdzone w przeglądarce. Komunikat odświeżany co 30 s |
| Kierownik widzi zadania pracowników i stan wykonania | Rejestr zadań, Kalendarz (filtr operatora), raport „Statystyka zadań” | działa, sprawdzone testem | `auth.test.ts` (widoczność kierownik/handlowiec) |
| Ewidencja czasu: sumy per operator, kontrahent, projekt | raport „Czas pracy”; zakładka „Czas pracy” w zadaniu i projekcie | działa, sprawdzone testem | `import-reports.test.ts` |

## Projekty, towary, zamówienia, sprzedaż

| Wymaganie | Gdzie | Stan | Jak sprawdzono / uwagi |
|---|---|---|---|
| Projekty z etapami, kontrahentem, opiekunem, terminami, statusem; w kartotece korespondencja, zadania, załączniki | Projekty → kartoteka projektu | działa, sprawdzone w przeglądarce | zrzuty 19, 20 |
| Kartoteka towarowa (nazwa, indeks, jednostka, cena netto, VAT) | Kartoteka towarowa | działa, sprawdzone w przeglądarce | zrzut 23; import — `import-reports.test.ts` |
| Zamówienia z pozycjami, wartością, statusem, historią per kontrahent | Zamówienia; kartoteka → Zamówienia | działa, sprawdzone testem | `tasks.test.ts` (wartości netto/brutto, numer `DIAGNOS/ZAM/n/RRRR`); zrzut 21 |
| Sprzedaż (data, dokument, kontrahent, handlowiec, pozycje, wartość), ręcznie lub z importu | Sprzedaż; kartoteka → Sprzedaż | działa, sprawdzone testem | `import-reports.test.ts` (import, łączenie pozycji, ponowny import), zrzut 22 |

## Dokumenty

| Wymaganie | Gdzie | Stan | Jak sprawdzono / uwagi |
|---|---|---|---|
| „Wirtualna szafa”: segregatory, typy, pliki w dowolnym formacie, numer automatyczny, opis, autor, data publikacji | Rejestr dokumentów | działa, sprawdzone testem | e2e (dodanie dokumentu, numer `DIAGNOS/D/1/…`), zrzut 24 |
| Wersjonowanie bez kasowania starych wersji, historia z autorem i datą | panel dokumentu → Wersje | działa, sprawdzone testem | `documents.test.ts` (pobranie wersji 0 i 1) |
| Okres ważności; po terminie dokument archiwalny; przełącznik aktualne/archiwalne | Rejestr dokumentów | działa, sprawdzone testem | `documents.test.ts` |
| Uprawnienia per grupa (dział) i per operator (podgląd/edycja), dla dokumentu lub segregatora, egzekwowane przy pobieraniu | panel dokumentu → Uprawnienia; tarcza przy segregatorze | działa, sprawdzone testem | `documents.test.ts` (dział, operator, nadpisanie segregatora przez dokument, 403 przy pobieraniu, także dla załącznika pochodzącego z dokumentu) |
| Rejestr zmian: kto i kiedy dodał, zmienił, pobrał | panel dokumentu → Rejestr zmian | działa, sprawdzone testem | `documents.test.ts`, zrzut 25 |
| Przypisanie do kontrahenta i projektu, widoczność w kartotekach | pola dokumentu | działa, sprawdzone testem | e2e, `documents.test.ts` |
| Szablony (oferta, zamówienie, faktura pro forma) z polami podstawianymi i wspólną szatą graficzną, PDF dla kontrahenta/zamówienia, zapis do rejestru i kartoteki | Szablony dokumentów; „Dokument z szablonu” w kartotece i zamówieniu | działa, wymaga konfiguracji | `documents.test.ts` (PDF zapisany i widoczny w kartotece); PDF obejrzany. **Potrzebne logo, dane firmy i docelowe treści szablonów od klienta** (Ustawienia → Dane firmy) |
| Wyszukiwanie po nazwie, opisie, numerze; podgląd PDF i obrazów w przeglądarce | Rejestr dokumentów | działa, sprawdzone w przeglądarce | podgląd otwiera plik w nowej karcie (PDF, obrazy, tekst); obrazy także w panelu |

## Raporty

| Wymaganie | Gdzie | Stan | Jak sprawdzono / uwagi |
|---|---|---|---|
| Brak aktywności: brak kontaktu od N dni, filtry (status, grupa, prowadzący, kluczowi) | Raporty → Brak aktywności | działa, sprawdzone testem | `import-reports.test.ts`, zrzut 27 |
| Skuteczność handlowców: wartość, liczba transakcji, liczba klientów w okresie | Raporty → Skuteczność handlowców | działa, sprawdzone testem | `import-reports.test.ts`, zrzut 28 |
| Statystyka zadań: wykonane, w toku, przeterminowane per pracownik | Raporty → Statystyka zadań | działa, sprawdzone testem | `import-reports.test.ts`, zrzut 29 |
| Aktywność operatora: rodzaj × kierunek z sumami i wykresem słupkowym | Raporty → Aktywność operatora | działa, sprawdzone testem | `import-reports.test.ts`, e2e, zrzut 30 |
| Czas pracy: godziny per operator, kontrahent, projekt; udział kontrahenta w czasie firmy | Raporty → Czas pracy | działa, sprawdzone testem | `import-reports.test.ts`, zrzut 31 |
| Każdy raport: parametry, tabela, wykres, wydruk, PDF, XLSX | przyciski Drukuj / PDF / XLSX | działa, sprawdzone testem | PDF i XLSX — `import-reports.test.ts`, e2e; wydruk przez okno drukowania przeglądarki (zapis do PDF także stamtąd) |
| Raporty automatyczne: harmonogram (np. ostatni dzień miesiąca), PDF na wskazany e-mail | Raporty → Raporty automatyczne | działa, wymaga konfiguracji SMTP | `messaging.test.ts` (PDF w załączniku dotarł na lokalny SMTP; termin 18:00 ostatniego dnia miesiąca); „Uruchom teraz” w przeglądarce |
| Panel do grupowania w każdym rejestrze | wszystkie rejestry | działa, sprawdzone w przeglądarce | zrzuty 03, 22 |

## Pozostałe

| Wymaganie | Gdzie | Stan | Jak sprawdzono / uwagi |
|---|---|---|---|
| Interfejs po polsku, daty DD.MM.RRRR, kwoty w zł, tydzień od poniedziałku | cała aplikacja | działa, sprawdzone w przeglądarce | pola dat mają własną maskę DD.MM.RRRR i godziny 24 h (niezależnie od języka przeglądarki) |
| Obsługa klawiaturą: Enter zapisuje, Esc zamyka, fokus w pierwszym polu; strzałki i Enter w rejestrze | okna dialogowe, rejestry | działa, sprawdzone w przeglądarce | w polach wielowierszowych zapis Ctrl+Enter |
| Jeden kontener, wolumen na bazę i pliki | `Dockerfile`, `docker-compose.yml` | działa, sprawdzone ręcznie | obraz zbudowany i uruchomiony, dane przykładowe załadowane w kontenerze, PDF generowany w kontenerze |
| Kopie zapasowe | `scripts/kopia.mjs`, README | działa, sprawdzone ręcznie | kopia na działającej bazie (5064 kontrahentów) i odczyt kopii |
| Dane przykładowe osobnym poleceniem | `npm run seed` / `dist/server/seed.js` | działa, sprawdzone ręcznie | odmawia działania na niepustej bazie |
