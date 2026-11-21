# Zlecenie: panel CRM dla firmy DIAGNOS

## O co chodzi

Budujesz od zera webowy panel CRM dla firmy DIAGNOS. Klient przysłał maila z opisem funkcji, których oczekuje, oraz osiem zrzutów ekranu ze starego desktopowego programu (GoNet CRM), na którym się wzoruje. Chce dostać nowoczesny odpowiednik tego programu działający w przeglądarce, pod własną marką DIAGNOS.

Wynik tej pracy idzie bezpośrednio do klienta. To ma być działająca aplikacja z prawdziwą bazą danych, logowaniem i trwałym zapisem, a nie makieta ani demo na danych w pamięci. Każdy przycisk widoczny w interfejsie ma coś robić. Jeśli czegoś nie da się zrobić bez danych od klienta (np. dane serwera SMTP), funkcja ma być zbudowana do końca i czekać tylko na konfigurację, a w raporcie końcowym ma być jasno napisane, czego brakuje.

Priorytet na tym etapie: **funkcjonalność i zgodność z wymaganiami klienta**. Wygląd ma być czysty i profesjonalny (wytyczne niżej), ale nie poświęcaj czasu na dopieszczanie wizualne kosztem działających funkcji. Dopracowanie wyglądu będzie osobnym etapem.

## Materiały

- Pełna treść wymagań klienta jest w sekcji „Wymagania klienta" poniżej. To jest źródło prawdy; czytaj je dosłownie.
- Zrzuty ekranu od klienta leżą w `docs/referencje/`. Obejrzyj wszystkie narzędziem Read, zanim zaczniesz projektować ekrany. Pokazują, jakiego układu informacji i jakiej gęstości danych klient się spodziewa:
  - `01-rejestr-kontrahentow.jpg` — lista kontrahentów: nad tabelą pasek filtrów (grupa, podgrupa, status, źródło kontaktu, typ, adres, miasto, województwo, projekt, NIP, osoba, telefon, e-mail, nr umowy, uwagi, prowadzący), tabela pogrupowana po mieście z licznikami („KRAKÓW ilość: 9"), po prawej panel podglądu zaznaczonego kontrahenta z osobami kontaktowymi, na dole licznik rekordów.
  - `02-kartoteka-kontrahenta-szczegoly.jpg` — kartoteka kontrahenta z zakładkami: Szczegóły, Adres, Projekty, Korespondencja, Zamówienia, Zadania, Osoby, Załączniki, Grupy, WWW, Lokalizacja. W szczegółach: pełna nazwa, skrót, status, typ, podgrupa, źródło informacji, nr umowy, grupa cenowa, prowadzący, NIP/REGON, uprawnienia, polecony przez, centrala, limit kredytu; sekcja pól dodatkowych; po prawej lista zadań z paskiem postępu w procentach.
  - `03-kartoteka-zakladka-korespondencja.jpg` — zakładka Korespondencja: kierunek (wychodząca/przychodząca), rodzaj (telefon, e-mail, spotkanie), data zdarzenia, temat, osoba, operator, numer, e-mail; po prawej treść wybranej pozycji i lista załączników.
  - `04-formularz-korespondencji.jpg` — okno nowej korespondencji z zakładkami Ogólne / Treść / Załączniki / Korespondencja seryjna. Pola: rodzaj, kierunek, data, godzina, temat (ze słownika), numer nadawany automatycznie (wzór `GONET/50/20140417`), kontrahent, adresat (osoba kontaktowa z telefonami), projekt, kontrahent powiązany, data i godzina wysłania. W tytule okna biegnie stoper czasu trwania (`00:00:39`).
  - `05-moje-zadania-na-dzis.jpg` — ekran startowy „Moje zadania na dziś": kalendarz dzienny z siatką co 15 minut i zakładkami kolejnych dni, po prawej mini-kalendarz miesiąca, zegar, pole szybkiej notatki i lista pilnych/zaległych zadań wyróżnionych kolorem.
  - `06-kalendarz-zadan-tydzien.jpg` — rejestr zadań w widoku tygodniowym z filtrami (kontrahent, kontakt, status, zakres dat, temat, operator, projekt, miasto; przełączniki: zrealizowane, archiwalne, grupowe, przeterminowane; widok dzień/tydzień, gęstość siatki).
  - `07-rejestr-dokumentow.jpg` — rejestr dokumentów: numer, data publikacji, nazwa, rozszerzenie, rozmiar, segregator, edycja (wersja), data utworzenia, autor; filtry po segregatorze, typie, operatorze, treści; przełączniki aktualne/archiwalne; suma rozmiarów w stopce.
  - `08-raport-aktywnosci-operatora.jpg` — raport aktywności operatora za okres: tabela rodzaj korespondencji × wychodząca/przychodząca/razem z wierszem sumy oraz wykres słupkowy.

Zrzuty pokazują układ i zakres danych, nie styl. Nie kopiuj wyglądu Windowsa z 2014 roku ani logo czy nazwy GoNet. Produkt nazywa się po prostu „DIAGNOS CRM", numeracja dokumentów zaczyna się od `DIAGNOS/…`.

## Stos technologiczny

Rekomendowany, bo da się go postawić jednym poleceniem i oddać klientowi jako jeden kontener:

- TypeScript w całości. Frontend: React + Vite. Backend: Node.js (Fastify lub Express) z REST API. Baza: SQLite z migracjami (w kontenerze jest Node 22; możesz użyć `better-sqlite3` albo wbudowanego `node:sqlite`). Model danych pisz tak, żeby późniejsze przejście na PostgreSQL nie wymagało przepisywania logiki.
- Pliki (załączniki, dokumenty) na dysku w katalogu danych, metadane w bazie.
- Backend serwuje zbudowany frontend, więc w produkcji działa jeden proces. Dodaj `Dockerfile` i `docker-compose.yml` z wolumenem na bazę i pliki.
- Zadania cykliczne w tle (przypomnienia, zadania cykliczne, wiadomości z odroczonym terminem, automatyczne raporty) jako scheduler wewnątrz procesu backendu.

Możesz odejść od tej rekomendacji, jeśli masz konkretny powód; zapisz go wtedy w README. Nie dodawaj zależności od płatnych usług zewnętrznych.

Cały interfejs po polsku, z poprawnymi polskimi znakami, datami w formacie `DD.MM.RRRR`, kwotami w złotych, tygodniem od poniedziałku.

## Zakres funkcjonalny

Poniżej wymagania klienta przełożone na moduły. Jeśli coś tu pominąłem, a jest w mailu klienta, obowiązuje mail.

### Wspólna podstawa

- **Logowanie i operatorzy.** Konta operatorów (pracowników), role i grupy uprawnień (co najmniej: administrator, kierownik, handlowiec; grupy/działy do uprawnień na dokumentach). Hasła haszowane, sesje po stronie serwera. Konto administratora tworzone przy pierwszym uruchomieniu, z wymuszoną zmianą hasła po pierwszym logowaniu. Uprawnienia egzekwowane na backendzie, nie tylko ukrywaniem przycisków.
- **Uniwersalny rejestr (tabela danych).** Klient pisze, że „panel do grupowania" jest dostępny w każdym rejestrze. Zbuduj jeden komponent tabeli używany przez wszystkie rejestry (kontrahenci, korespondencja, zadania, dokumenty, zamówienia, projekty, sprzedaż), który ma: pasek filtrów, sortowanie po kolumnach, wybór widocznych kolumn, **grupowanie po dowolnej kolumnie lub kilku kolumnach naraz** z licznikami i sumami w nagłówkach grup, licznik rekordów w stopce, eksport do XLSX/CSV i wydruk. To jest najważniejszy element interfejsu; warto go zrobić porządnie raz. Musi działać płynnie przy kilku tysiącach rekordów.
- **Słowniki** edytowalne przez administratora: typy kontrahentów, statusy, grupy i podgrupy, grupy cenowe, źródła kontaktu, tematy korespondencji, rodzaje korespondencji, segregatory i typy dokumentów, statusy zadań.
- **Pola dodatkowe.** Administrator definiuje własne pola (tekst, liczba, data, lista wyboru, znacznik tak/nie) dla kontrahentów; pola pojawiają się w kartotece, w filtrach i jako kolumny rejestru.

### Kontrahenci

- Rejestr z szybkim wyszukiwaniem po nazwie, NIP-ie, numerze telefonu, e-mailu, osobie; filtry jak na zrzucie 01; grupowanie np. po mieście, statusie, grupie; panel podglądu po prawej.
- Kartoteka z zakładkami jak na zrzucie 02: dane podstawowe, adresy (wiele: siedziba, korespondencyjny, dostawy), dane rejestracyjne (NIP, REGON, urząd skarbowy), typ, status, grupa/podgrupa, grupa cenowa, źródło kontaktu, prowadzący, limit kredytu, polecony przez, centrala, WWW, lokalizacja na mapie (link do mapy z adresu wystarczy), pola dodatkowe, notatki i komentarze.
- Osoby kontaktowe (stanowisko, telefony, e-mail, uwagi), wiele na kontrahenta.
- Zakładki powiązań: projekty, korespondencja, zadania, zamówienia, sprzedaż, załączniki (z podziałem wg źródła: dodane wprost, z korespondencji, z rejestru dokumentów), grupy.
- Walidacja NIP i REGON (suma kontrolna), ostrzeżenie o duplikacie NIP.
- **Import** kontrahentów i osób kontaktowych z pliku XLSX/CSV: wgranie pliku, mapowanie kolumn na pola, podgląd, raport z importu (dodane, zaktualizowane, odrzucone z powodem). Bez tego klient nie przeniesie swojej bazy z Excela.
- **Import z programów fakturujących.** Klient nie podał, z jakiego programu korzysta. Zbuduj import plikowy (XLSX/CSV z mapowaniem) dla kontrahentów, osób, kartotek towarowych i historii transakcji sprzedaży oraz udokumentuj oczekiwany format. Integrację z konkretnym programem wpisz do raportu końcowego jako rzecz do ustalenia z klientem.

### Korespondencja

- Zapis każdego kontaktu: rodzaj (telefon, e-mail, SMS, spotkanie, notatka), kierunek, data i godzina zdarzenia, **faktyczny czas trwania** (stoper uruchamiany przy otwarciu formularza, z możliwością ręcznej korekty), temat ze słownika i temat własny, automatyczny numer, kontrahent, adresat (osoba kontaktowa), operator, powiązanie z projektem i etapem projektu, kontrahent powiązany, treść, załączniki.
- Rejestr korespondencji globalny i w kartotece kontrahenta/projektu; widać kto, kiedy, z kim i w jakiej formie się kontaktował.
- **Wysyłka e-mail** z poziomu aplikacji przez SMTP skonfigurowany w ustawieniach (host, port, login, hasło, nadawca; hasło przechowywane tak, żeby nie wracało do przeglądarki). Wysłana wiadomość zapisuje się jako korespondencja wychodząca. Załączniki można dodawać do wiadomości z rejestru dokumentów i zapisywać załączniki korespondencji do rejestru.
- **Korespondencja seryjna:** jedna wiadomość do zdefiniowanej grupy odbiorców (grupa kontrahentów lub wynik filtra rejestru), z polami podstawianymi (nazwa firmy, imię i nazwisko osoby itp.), podglądem przed wysyłką, kolejką wysyłki i statusem per odbiorca; u każdego kontrahenta powstaje wpis korespondencji.
- **Korespondencja wewnętrzna:** wiadomości tekstowe między operatorami (do jednej osoby, kilku lub wszystkich) z terminem doręczenia. Adresat dostaje ją dopiero o wskazanej porze; ma skrzynkę odebranych, znacznik przeczytania i widoczne powiadomienie.
- **SMS:** zbuduj warstwę wysyłki z wymiennym adapterem bramki i ekranem konfiguracji. Bez podanej bramki wiadomości trafiają do widocznej kolejki „oczekuje na konfigurację bramki". Nie udawaj wysyłki.

Tam, gdzie SMTP lub bramka SMS nie są skonfigurowane, interfejs ma to mówić wprost, a nie zgłaszać sukces.

### Zadania i kalendarz

- Zadanie: tytuł, opis, termin od–do (data i godzina), operator wykonujący, zlecający, priorytet, status, **stopień wykonania w procentach**, powiązanie z kontrahentem, osobą, korespondencją lub projektem, zadania grupowe (dla kilku operatorów), przepracowany czas.
- **Ekran startowy „Moje zadania na dziś"** jak na zrzucie 05: kalendarz dzienny zalogowanego operatora, mini-kalendarz, szybka notatka, lista zadań zaległych i najbliższych. Po zalogowaniu operator widzi swoje zadania do wykonania.
- Kalendarz dzienny i tygodniowy z siatką czasu (5/15/30/60 min) jak na zrzucie 06, przeciąganie zadań między terminami, widok listy w rejestrze z filtrami (zrealizowane, archiwalne, grupowe, przeterminowane).
- **Zadania cykliczne** (codziennie, co tydzień w wybrane dni, co miesiąc, co N dni; z datą końca).
- **Zadania generowane automatycznie** według reguł ustawianych przez administratora. Co najmniej: po dodaniu nowego kontrahenta zadanie „kontakt" dla prowadzącego po N dniach. Zrób to jako prosty mechanizm reguł (zdarzenie → szablon zadania → opóźnienie), żeby dało się dodać kolejne.
- **Przypomnienia** z wyprzedzeniem ustawianym na zadaniu: wyraźny komunikat w aplikacji (nie do przeoczenia, wymaga potwierdzenia lub odłożenia), e-mail, SMS (przez warstwy opisane wyżej).
- Kierownik widzi zadania swoich pracowników i stan ich wykonania.
- **Ewidencja czasu:** czas z korespondencji i zadań sumuje się per operator, kontrahent i projekt.

### Projekty, zamówienia, sprzedaż

Klient wymienia je jako zakładki kartoteki i jako powiązania, więc muszą istnieć jako działające rejestry, choć w prostszej formie niż moduły powyżej:

- **Projekty** z etapami, kontrahentem, opiekunem, terminami, statusem; w kartotece projektu korespondencja, zadania, załączniki.
- **Kartoteka towarowa** (nazwa, indeks, jednostka, cena netto, VAT).
- **Zamówienia** z pozycjami, wartością, statusem, historią per kontrahent.
- **Sprzedaż** (transakcje: data, dokument, kontrahent, handlowiec, pozycje, wartość) wprowadzana ręcznie lub z importu; to jest źródło danych do raportu skuteczności handlowców.

### Dokumenty

- „Wirtualna szafa": segregatory, typy, dokumenty w dowolnym formacie (pdf, doc, xls, obrazy…), numer nadawany automatycznie, opis, autor, data publikacji.
- **Wersjonowanie** (kolumna „Edycja" na zrzucie 07): nowa wersja nie kasuje starej, historia wersji z autorem i datą.
- **Okres ważności** (ważny od–do); po terminie dokument przechodzi do archiwalnych; przełącznik aktualne/archiwalne.
- **Uprawnienia** do dokumentu lub segregatora per grupa i per operator (podgląd / edycja), egzekwowane także przy pobieraniu pliku. Rejestr zmian: kto i kiedy dodał, zmienił, pobrał. Klient powołuje się na zgodność z ISO, a to w praktyce znaczy: kontrola dostępu, wersje, historia.
- Przypisanie dokumentu do kontrahenta i projektu; widoczność w ich kartotekach.
- **Szablony dokumentów** (oferta, zamówienie, faktura pro forma): szablon z polami podstawianymi i wspólną szatą graficzną firmy, generowanie dokumentu PDF dla wybranego kontrahenta/zamówienia i zapis do rejestru oraz do kartoteki kontrahenta.
- Wyszukiwanie po nazwie, opisie, numerze; podgląd PDF i obrazów w przeglądarce.

### Raporty

- **Brak aktywności:** kontrahenci, z którymi nie było kontaktu od N dni, z filtrami (status, grupa, prowadzący, np. tylko kluczowi).
- **Skuteczność handlowców:** sprzedaż per handlowiec w okresie (wartość, liczba transakcji, liczba klientów).
- **Statystyka zadań:** zadania wykonane, w toku i przeterminowane per pracownik w okresie.
- **Aktywność operatora** jak na zrzucie 08: rodzaj korespondencji × kierunek, z sumami i wykresem słupkowym.
- **Czas pracy:** godziny per operator, kontrahent, projekt; udział kontrahenta w czasie pracy firmy.
- Każdy raport: parametry (okres, operator…), tabela, wykres tam, gdzie ma sens, **wydruk i zapis do PDF**, eksport XLSX.
- **Raporty automatyczne:** harmonogram (np. ostatni dzień miesiąca) i wysyłka PDF na wskazany adres e-mail.

## Wygląd

Kolorystyka biało-granatowa: białe tło robocze, granat jako kolor marki (nawigacja, nagłówki, akcje główne), szarości neutralne do linii i tekstu pomocniczego, jeden oszczędnie używany kolor akcentu dla stanów (zaległe, pilne). Kolory statusów mają znaczyć zawsze to samo.

To jest narzędzie pracy, w którym ktoś spędza osiem godzin dziennie. Ma wyglądać jak solidne oprogramowanie biznesowe zaprojektowane przez człowieka, a nie jak wygenerowany szablon. Konkretnie:

- Gęsty, czytelny układ: zwarte tabele, dużo danych na ekranie, małe odstępy, wyrównanie do siatki. Liczby wyrównane do prawej, cyfry tabelaryczne.
- Bez gradientów, bez fioletów, bez szklanych efektów, bez wielkich zaokrągleń i cieni pod każdym elementem, bez emoji w roli ikon, bez dekoracyjnych kafelków ze statystykami, które niczemu nie służą, bez pustych sloganów i ekranów powitalnych.
- Jeden zestaw ikon liniowych, jedna rodzina krojów pisma, spójna skala typografii, stała wysokość wierszy i kontrolek.
- Etykiety konkretne i po polsku, zgodne ze słownictwem klienta (kontrahent, kartoteka, korespondencja, operator, segregator, rejestr).
- Puste stany, błędy walidacji i komunikaty pisane rzeczowo; każdy stan ładowania i błędu obsłużony.
- Obsługa klawiaturą tam, gdzie liczy się szybkość wprowadzania danych (Enter zapisuje, Esc zamyka, focus w pierwszym polu).
- Docelowo praca na monitorze biurowym (od 1366 px szerokości); na węższych ekranach ma się nie rozsypywać, ale nie optymalizuj pod telefon.

Nie ma zainstalowanego dodatkowego skilla do designu, więc kieruj się powyższym.

## Plan działania

Pracuj etapami w tej kolejności. Po każdym etapie uruchom aplikację, sprawdź nowe funkcje w przeglądarce, zrób commit i `git push -u origin claude/diagnos-crm-panel-q18s3r`. Dzięki temu praca nie przepadnie, jeśli sesja się urwie.

1. **Fundament:** struktura repo, backend, baza z migracjami, logowanie, operatorzy i role, układ aplikacji z nawigacją, słowniki, komponent uniwersalnego rejestru z filtrowaniem, sortowaniem i grupowaniem.
2. **Kontrahenci:** rejestr, kartoteka z zakładkami, osoby kontaktowe, pola dodatkowe, notatki, załączniki, import XLSX/CSV.
3. **Korespondencja:** formularz ze stoperem, rejestr, numeracja, załączniki, konfiguracja SMTP i wysyłka e-mail, korespondencja seryjna, korespondencja wewnętrzna, warstwa SMS.
4. **Zadania:** rejestr, ekran „Moje zadania na dziś", kalendarz dzień/tydzień, postęp, cykliczność, reguły automatyczne, przypomnienia, scheduler.
5. **Projekty, towary, zamówienia, sprzedaż** oraz ich zakładki w kartotece kontrahenta; import towarów i transakcji.
6. **Dokumenty:** szafa, wersje, ważność, uprawnienia, rejestr zmian, szablony i generowanie PDF.
7. **Raporty:** pięć raportów, wydruk/PDF/XLSX, harmonogram z wysyłką e-mail.
8. **Odbiór:** dane przykładowe, testy, przegląd całości względem wymagań, dokumentacja, kontener.

Jeśli zabraknie czasu lub kontekstu, lepiej oddać mniej modułów w pełni działających niż wszystkie w połowie. W takim przypadku napisz to jasno w raporcie.

## Weryfikacja

Nie uznawaj funkcji za gotową, dopóki nie zobaczysz jej działającej.

- Testy automatyczne backendu dla logiki, w której łatwo o błąd: uprawnienia (w tym do dokumentów), generowanie wystąpień zadań cyklicznych, reguły automatyczne, przypomnienia i doręczanie wiadomości z terminem, numeracja, import (w tym błędne wiersze), obliczenia raportów, walidacja NIP/REGON.
- Test przeglądarkowy (Playwright jest zainstalowany w kontenerze razem z Chromium; nie instaluj przeglądarki ponownie) przechodzący główną ścieżkę: logowanie → dodanie kontrahenta → osoba kontaktowa → korespondencja → zadanie → dokument → raport.
- Wysyłkę e-mail sprawdź na lokalnym serwerze SMTP do testów uruchomionym w kontenerze (np. prosty serwer przechwytujący wiadomości), łącznie z korespondencją seryjną i raportem automatycznym.
- Na koniec przejdź w przeglądarce każdy ekran, zrób zrzuty ekranu do `docs/zrzuty/` i obejrzyj je: czy nic się nie rozjeżdża, czy polskie znaki są poprawne, czy nie ma martwych przycisków.
- Dane przykładowe (seed, uruchamiany osobnym poleceniem, nie automatycznie w produkcji): kilkudziesięciu fikcyjnych polskich kontrahentów z osobami, korespondencją, zadaniami, dokumentami i sprzedażą, żeby klient zobaczył wypełniony system. Dane w całości zmyślone, NIP-y z poprawną sumą kontrolną.

## Co ma powstać w repo

- Działająca aplikacja z `README.md` po polsku: wymagania, uruchomienie lokalne, uruchomienie w Dockerze, pierwsze logowanie, konfiguracja SMTP/SMS, kopie zapasowe bazy i plików.
- `docs/WYMAGANIA.md`: tabela wymaganie klienta → gdzie jest w aplikacji → stan (działa i sprawdzone / działa, wymaga konfiguracji / niezrobione) → jak sprawdzono. Wypełniaj uczciwie; ten plik posłuży do odbioru z klientem.
- `docs/zrzuty/` ze zrzutami ekranów gotowej aplikacji.
- Żadnych haseł, kluczy ani prawdziwych danych osobowych w repo.

Commity rób na gałęzi `claude/diagnos-crm-panel-q18s3r` i tylko na nią wypychaj. Nie twórz pull requesta. W komunikatach commitów i w kodzie nie wpisuj nazw modeli AI.

## Raport końcowy

Na koniec odpisz krótko i konkretnie, zaczynając od stanu całości:

1. Co działa i zostało sprawdzone (z rozróżnieniem: sprawdzone testem / sprawdzone ręcznie w przeglądarce).
2. Co jest zbudowane, ale czeka na dane od klienta (SMTP, bramka SMS, program fakturujący, logo i dane firmy do szablonów).
3. Czego nie zrobiono lub co działa częściowo, i dlaczego.
4. Jak uruchomić aplikację i jak się zalogować.
5. Pytania do klienta, na które odpowiedź zmieniłaby rozwiązanie.

Jeśli test nie przechodzi albo coś działa tylko częściowo, napisz to wprost. Uczciwa lista braków jest dla mnie cenniejsza niż raport, w którym wszystko jest „gotowe".

## Wymagania klienta (pełna treść maila)

> **Rejestr kontrahentów.** Informacje o kliencie są to wszystkie dane, które mogą przydać się podczas współpracy z danym kontrahentem takie jak: dane teleadresowe (adresy, telefony, osoby kontaktowe, ...); dane rejestracyjne (NIP, REGON, Urząd Skarbowy, ...); typ kontrahenta (klient, dostawca, partner, …); status (klient aktywny, stały klient, ...); grupa, podgrupa (np. podział ze względu na branżę); oraz inne specyficzne dla danej branży np. grupa cenowa, źródło kontaktu itp.
>
> Elastyczność systemu pozwala również na stworzenie własnych pól dodatkowych, gdzie można przechowywać informacje, których brakuje w domyślnej konfiguracji.
>
> Dzięki intuicyjnemu interfejsowi użytkownika wprowadzenie danych do systemu jest bardzo szybkie i proste. Istnieje również możliwość importu danych z innych programów, np. można szybko wczytać dane z zakupionej lub gromadzonej wcześniej bazy Excel-a.
>
> Wszystkie zgromadzone w systemie informacje mogą być wyszukiwane i zaprezentowane w określony sposób. Na przykład można: szybko wyszukać konkretnego kontrahenta np. po nazwie, NIP-ie, numerze telefonu; pokazać kontrahentów z danej grupy np. aktualnych klientów, źródło kontaktu; pogrupować kontrahentów według kilku kryteriów, np. statusu, adresu lub wyświetlić klientów do których nie było kontaktu w ostatnim miesiącu, a są kluczowymi kontrahentami firmy.
>
> Do kartoteki każdego kontrahenta aplikacja daje możliwość dopisywania notatek, komentarzy oraz dodawania informacji w postaci dokumentów elektronicznych - załączników.
>
> Z poziomu kartoteki kontrahenta użytkownik ma dostęp do wszystkich informacji zapisanych w bazie danych i powiązanych z danym kontrahentem, takich jak: kartoteka kontrahenta; projekty; prowadzona korespondencja; zadania; osoby kontaktowe; sprzedaż; grupy, do których należy kontrahent; historia składanych zamówień.
>
> Ważną cechą systemu jest to, że współpracuje on z zewnętrznymi programami fakturującymi, umożliwiając import zawartych w nich danych, obejmujących dostępne informacje o kontrahentach, osobach kontaktowych, kartotekach towarowych i historii wszystkich transakcji związanych z kontrahentem.
>
> **Korespondencja.** Podczas bieżącej pracy z klientem istotne jest, aby pamiętać o wszystkich kluczowych ustaleniach. Funkcja korespondencji umożliwia zapisywanie przy każdym kontrahencie takich informacji jak: notatek ze spotkań; ustaleń telefonicznych; wiadomości SMS lub e-mail; spotkania.
>
> Dzięki systematycznie wprowadzanym danym, bardzo szybko można sprawdzić co, kiedy i w jakiej formie było ustalone z danym kontrahentem. Można również ustalić który pracownik się kontaktował oraz z kim rozmawiał u kontrahenta.
>
> Każdy z typów korespondencji można związać z kontrahentem zapisanym w bazie, jak również z projektem (etapem projektowym) zdefiniowanym w systemie. Możliwe jest podanie dokładnej daty i godziny zaistnienia korespondencji oraz określenie jej faktycznego czasu trwania. Ponadto, opis każdej korespondencji obejmuje nie tylko możliwość wprowadzenia jej treści, ale również załączenia dokumentów elektronicznych (plików) z nią związanych.
>
> **Korespondencja seryjna.** Aplikacja umożliwia także tworzenie i wysłanie korespondencji seryjnej za pomocą wbudowanego klienta poczty elektronicznej. Pod pojęciem korespondencji seryjnej należy rozumieć możliwość zaadresowania jednej wiadomości do wcześniej zdefiniowanej grupy odbiorców.
>
> **Korespondencja wewnętrzna.** Moduł umożliwiający wysyłanie informacji tekstowych do wszystkich użytkowników systemu. W momencie tworzenia takiej "korespondencji" określa się termin kiedy adresat ma ją dostać. Dzięki temu możliwe jest np. przypominanie o zadaniach do wykonania czy szybkie raportowanie wykonania zadania.
>
> **Zadania.** Organizacja czasu pracy jest dużym wyzwaniem w każdej firmie. Do najważniejszych funkcjonalności należą, możliwość: dodawania zadań powiązanych z danym kontrahentem, korespondencją lub konkretnym projektem; przeglądania zadań przy pomocy intuicyjnego graficznego widoku (np. moje zadania na dziś); tworzenia zadań cyklicznych – zadania cykliczne pozwalają na wyświetlanie ich treści co pewien określony interwał czasowy. Zdefiniowane zadania wyświetlane są po każdorazowym uruchomieniu aplikacji - każdy z zalogowanych operatorów widzi swoje zadania do wykonania; automatycznego generowania zadań przez system (np. po dodaniu nowego klienta do bazy zadanie przypominające o kontakcie po kilku dniach); stworzenia przypomnienia o zadaniu, które będzie ostrzegało o zbliżającym się zadaniu (np. poprzez rzucający się w oczy komunikat, SMS lub e-mail); określania stanu wykonania zadania (np. przy zadaniach wykonanych częściowo).
>
> System zadań i przypomnień ułatwia pracę zadaniową w firmie, dzięki czemu wykorzystanie czasu staje się bardziej efektywne. Zarząd firmy zyskuje również bardzo dokładne narzędzie służące do monitorowania zadań wykonywanych przez poszczególnych pracowników.
>
> **Raportowanie i kontrola wykonania zadań.** Praca zadaniowa CRM umożliwia precyzyjne planowanie działań poszczególnych pracowników i zespołów, a przy tym sprzyja wywiązywaniu się z nich w terminie. Dzięki ustalonym datom realizacji zadań, tworzy się harmonogram prac codziennych i długoterminowych. Polecenia można grupować według projektów, klientów czy korespondencji.
>
> Moduł zadaniowy w pewnym sensie odciąża pamięć pracowników. Po dodaniu nowych kontrahentów sam ustala podstawowe cele i przypomina o konieczności wykonania ich. Generuje też prace cykliczne. Po każdorazowym rozpoczęciu danej kwestii system informuje o dotychczasowym stopniu wykonania tego punktu. Zawarte w nim dane są porządkowane i synchronizowane.
>
> **Najważniejsze informacje w jednym miejscu.** System CRM ogranicza prace administracyjne do minimum, zapewniając doskonały przepływ informacji w firmie. Program dostarcza niezbędnych wiadomości o kliencie i przeprowadzonej z nim korespondencji. Swoje osiągnięcia można opisywać w nim w formie raportu, dzięki czemu nie potrzeba już do tego kolejnego narzędzia. Oczywiście integracja z innymi aplikacjami i systemami jest możliwa.
>
> **Kontrola czasu pracy.** Umiejętne zarządzanie zadaniami wymaga ustalenia, ile czasu potrzeba na ich realizację. Dzięki modułowi zadaniowemu, pracodawca otrzymuje klarowną informację o tym, ile godzin na swoje zadania potrzebują poszczególne osoby. Pokazuje on też, jaki procent czasu pracy firmy należy poświęcić na współpracę z konkretnym klientem i czy jest to opłacalne. Analiza terminów pomaga podjąć decyzję, jaka liczba osób powinna zostać zaangażowana do poszczególnych projektów. Ewidencja godzinowa jest też źródłem informacji dla pracownika na temat jego zaangażowania.
>
> **Dokumenty.** Współpraca z wieloma firmami powoduje powstawanie dużej ilości dokumentacji. Rejestr dokumentów służy ujednoliceniu wzorców dokumentów w obrębie firmy, dzięki czemu wszystkie oferty trafiające do klientów, niezależnie od osoby je przygotowującej, będą miały np. identyczną szatę graficzną. Podstawowa funkcjonalność systemu pozwala między innymi na: stworzenie „wirtualnej szafy” z dokumentami do których mają dostęp wszyscy uprawnieni pracownicy (np. cenniki, instrukcje, katalogi); zapisywanie plików niezależnie od formatu (np. doc, pdf, xls); przypisywanie dokumentów do konkretnego kontrahenta, co ułatwia późniejsze odnajdywanie np. wysłanych ofert; tworzenie spójnych i atrakcyjnych wizualnie dokumentów na podstawie przygotowanych wcześniej szablonów (np. ofert, zamówień, faktur pro forma); określanie czasu ważności poszczególnych plików (np. oferta promocyjna ważna od, do); określenie grup uprawnień do poszczególnych dokumentów (różne działy lub poszczególni pracownicy mogą mieć wgląd np. do dokumentów swojego działu); dodawanie i zapisywanie załączników bezpośrednio do/z wiadomości e-mail.
>
> Wszystkie procedury zarządzania dokumentami są zgodne ze standardem ISO. Pozwala to firmom, które posiadają certyfikaty ISO na przeniesienie obiegu dokumentów do systemu. Zgodnie z procedurami ISO dostęp do dokumentów jest nadawany za pomocą uprawnień. Załączniki można także przeglądać z poziomu kartotek kontrahenta i projektu. Znajdziemy tam ogół dokumentów związanych z współpracą z daną firmą, podzielonych wg źródła pochodzenia.
>
> **Raporty.** Przykładowe raporty, które mogą przydać się w każdej firmie: raport braku aktywności, generujący listę np. klientów do których nie było kontaktu przez określony czas; skuteczność handlowców – czyli raport w którym pokazane jest zestawienie sprzedaży przez poszczególnych pracowników działu sprzedaży; statystyka zadań – pokazuje ile zadań wykonał dany pracownik w określonym przedziale czasowym.
>
> Wszystkie wygenerowane raporty mogą być wydrukowane lub zapisane do pliku np. PDF. Dodatkowo istnieje możliwość automatycznego generowania raportów (np. pod koniec każdego miesiąca), a także automatyczne wysłanie go na wskazany adres e-mail.
>
> Oprócz tego, system został wyposażony w bardzo funkcjonalny mechanizm, tzw. panel do grupowania. Dostępny on jest w każdym rejestrze i pozwala na dowolne grupowanie danych, zestawianie ich według najróżniejszych kryteriów i tworzenie tym samym bardzo rozbudowanych analiz i raportów.
