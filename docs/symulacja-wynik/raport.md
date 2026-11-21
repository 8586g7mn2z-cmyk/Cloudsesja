# Symulacja pracy firmy w DIAGNOS CRM

**Wynik: bez zastrzeżeń.** Wszystkie 26211 sprawdzeń zgodne z niezależną księgą symulacji.

Okres: 33 dni od 2026-03-02 do 2026-04-03 (czas firmy), ziarno losowości 7, czas wykonania 84 s, żądań do API: 10273.

## Co się wydarzyło w symulowanej firmie

| Wielkość | Liczba |
|---|---:|
| Operatorzy | 7 |
| Kontrahenci | 141 |
| Osoby kontaktowe | 205 |
| Pozycje korespondencji | 501 |
| Zadania (w tym cykliczne i automatyczne) | 385 |
| Przypomnienia, które zadziałały | 224 |
| Zamówienia | 42 |
| Dokumenty sprzedaży | 109 |
| Sprzedaż netto [zł] | 3050881.84 |
| Projekty | 19 |
| Dokumenty w rejestrze | 69 |
| Wiadomości wewnętrzne | 42 |
| E-maile odebrane przez testowy serwer poczty | 207 |
| SMS-y odebrane przez testową bramkę | 28 |

Najważniejsze zdarzenia:

- 2026-03-02 07:30  Założono firmę: 7 kont, pola dodatkowe, reguły, harmonogramy raportów, 3 serie zadań cyklicznych.
- 2026-03-03 10:00  Import: 30 kontrahentów, 20 osób, 3 towary, 12 dokumentów sprzedaży; ponowny import bez duplikatów.
- 2026-03-04 11:00  Dokumenty: sprawdzono uprawnienia segregatora i dokumentu, wersje, rejestr zmian, pliki z aktywną treścią.
- 2026-03-05 10:30  Korespondencja seryjna do grupy Handel: 35 wiadomości.
- 2026-03-10 10:00  Awaria serwera poczty i bramki SMS (10:00–13:00).
- 2026-03-10 13:00  Po awarii ponowiono 2 wysyłek.

## Wyniki sprawdzeń wg obszaru

| Obszar | Sprawdzeń | Niezgodności |
|---|---:|---:|
| Bezpieczeństwo plików | 3 | 0 |
| Dokumenty | 1055 | 0 |
| E-mail | 614 | 0 |
| Import | 75 | 0 |
| Interfejs | 171 | 0 |
| Kontrahenci | 367 | 0 |
| Korespondencja seryjna | 44 | 0 |
| Korespondencja wewnętrzna | 5817 | 0 |
| Korespondencja | 349 | 0 |
| Logowanie i sesje | 28 | 0 |
| Projekty | 19 | 0 |
| Przypomnienia | 815 | 0 |
| Raporty automatyczne | 11 | 0 |
| Raporty | 224 | 0 |
| Rejestry | 152 | 0 |
| SMS | 79 | 0 |
| Spójność danych | 10 | 0 |
| Stabilność | 9288 | 0 |
| Uprawnienia do dokumentów | 15 | 0 |
| Uprawnienia | 846 | 0 |
| Zadania automatyczne | 183 | 0 |
| Zadania cykliczne | 116 | 0 |
| Zadania | 5571 | 0 |
| Zamówienia i sprzedaż | 320 | 0 |
| Załączniki | 39 | 0 |

## Pełna lista sprawdzeń

**Bezpieczeństwo plików**

- ✓ plik HTML/SVG lub z fałszywym typem nie jest wykonywany w przeglądarce (pobieranie zamiast podglądu, nosniff, sandbox) (3/3)

**Dokumenty**

- ✓ nowa wersja nie kasuje starej: obie wersje pobierają się poprawnie (13/13)
- ✓ dokument po terminie ważności trafia do archiwalnych, ważny pozostaje w aktualnych (1009/1009)
- ✓ nazwa pliku z polskimi znakami zachowana (1/1)
- ✓ rejestr zmian dokumentu notuje dodanie, pobrania i zmiany uprawnień z osobą i datą (1/1)
- ✓ załącznik z wiadomości zapisuje się do rejestru dokumentów przy kontrahencie (1/1)
- ✓ dokument z szablonu jest plikiem PDF i trafia do kartoteki kontrahenta (15/15)
- ✓ numer dokumentu we wzorze DIAGNOS/D/n/RRRRMMDD (15/15)

**E-mail**

- ✓ bez konfiguracji SMTP wiadomość czeka i interfejs nie zgłasza sukcesu (3/3)
- ✓ tej samej wiadomości nie da się wysłać drugi raz (113/113)
- ✓ system zgłasza brak konfiguracji SMTP i SMS (1/1)
- ✓ bez konfiguracji nic nie zostaje wysłane (1/1)
- ✓ hasło SMTP nie wraca do przeglądarki (1/1)
- ✓ wiadomość testowa SMTP dociera (1/1)
- ✓ po skonfigurowaniu kanałów zaległe wiadomości wychodzą z kolejki (1/1)
- ✓ wysyłka z korespondencji kończy się statusem „wysłano” (110/110)
- ✓ w czasie awarii wiadomości nie giną: są w kolejce jako błąd wysyłki lub oczekujące (1/1)
- ✓ nieudana wysyłka ma zapisany opis błędu (1/1)
- ✓ każda wiadomość dociera do adresata dokładnie raz (także po awarii i ponowieniu) (190/190)
- ✓ system nie wysyła wiadomości, których nikt nie zlecił (190/190)
- ✓ na koniec w kolejce nie zostają niewysłane wiadomości (1/1)

**Import**

- ✓ import kontrahentów: 30 dodanych, 2 odrzucone z podaniem przyczyny (1/1)
- ✓ odrzucone wiersze mają opis przyczyny (1/1)
- ✓ zaimportowany kontrahent ma poprawne dane, prowadzącego, słowniki i pole dodatkowe (30/30)
- ✓ liczba kontrahentów po imporcie (1/1)
- ✓ ponowny import: 0 dodanych, 30 zaktualizowanych, bez duplikatów (1/1)
- ✓ liczba kontrahentów po ponownym imporcie bez zmian (1/1)
- ✓ ponowny import aktualizuje dane po identyfikatorze zewnętrznym (1/1)
- ✓ ponowny import nie tworzy drugi raz zadań „kontakt” (1/1)
- ✓ import osób kontaktowych z CSV (średniki, polskie znaki) (1/1)
- ✓ osoba z CSV przypisana do właściwego kontrahenta, z polskimi znakami (20/20)
- ✓ import towarów: 2 nowe, 1 zaktualizowany po indeksie (1/1)
- ✓ cena towaru zaktualizowana importem (1/1)
- ✓ import sprzedaży: 12 dokumentów złożonych z wielu wierszy (1/1)
- ✓ import sprzedaży: żaden wiersz nie został odrzucony (1/1)
- ✓ zaimportowany dokument sprzedaży: kontrahent, handlowiec, data i wartości zgodne z plikiem (12/12)
- ✓ ponowny import sprzedaży nie dubluje dokumentów (1/1)

**Interfejs**

- ✓ logowanie w przeglądarce prowadzi do ekranu „Moje zadania na dziś” (3/3)
- ✓ ekran otwiera się i ma treść (54/54)
- ✓ ekran ładuje się bez błędów skryptu i nieudanych żądań (54/54)
- ✓ licznik rekordów na ekranie zgodny z księgą symulacji (6/6)
- ✓ kartoteka kontrahenta ma komplet zakładek (3/3)
- ✓ zakładka „Korespondencja” kartoteki pokazuje liczbę zgodną z księgą (3/3)
- ✓ zakładka „Osoby” kartoteki pokazuje liczbę zgodną z księgą (3/3)
- ✓ zakładka kartoteki otwiera się bez błędów (39/39)
- ✓ kartoteka projektu otwiera się bez błędów (3/3)
- ✓ grupowanie rejestru po mieście: liczniki grup sumują się do liczby rekordów (1/1)
- ✓ przypomnienie nie wyskakuje przed czasem (1/1)
- ✓ przypomnienie o zadaniu samo wyskakuje na ekranie operatora (w ciągu ok. pół minuty) (1/1)

**Kontrahenci**

- ✓ kartoteka zwraca dokładnie zapisane dane (w tym pola dodatkowe) (111/111)
- ✓ data ostatniego kontaktu w rejestrze = najnowsza korespondencja (256/256)

**Korespondencja seryjna**

- ✓ podgląd: liczba odbiorców = liczba aktywnych kontrahentów grupy (1/1)
- ✓ każdy odbiorca z adresem ma status „wysłano” (1/1)
- ✓ odbiorcy bez adresu są pominięci z informacją (1/1)
- ✓ każdy odbiorca dostaje własną wiadomość z podstawionymi polami (35/35)
- ✓ u każdego odbiorcy powstaje wpis korespondencji wychodzącej (1/1)
- ✓ tryb „wszystkie osoby kontaktowe”: wiadomość do każdej osoby z adresem, z załącznikiem z rejestru dokumentów (4/4)
- ✓ liczba wpisów korespondencji = liczba wysłanych wiadomości (1/1)

**Korespondencja wewnętrzna**

- ✓ adresat widzi wiadomość dopiero od wyznaczonego terminu (i tylko nieprzeczytane) (5775/5775)
- ✓ system rozróżnia wiadomość natychmiastową i zaplanowaną (42/42)

**Korespondencja**

- ✓ numer nadawany automatycznie we wzorze DIAGNOS/n/RRRRMMDD (323/323)
- ✓ numery korespondencji są unikalne (25/25)
- ✓ równoczesne zapisy dostają różne numery (1/1)

**Logowanie i sesje**

- ✓ bez zalogowania API odpowiada 401 (10/10)
- ✓ zakodowany lub zniekształcony adres nie omija logowania (6/6)
- ✓ logowanie hasłem startowym wymaga zmiany hasła (1/1)
- ✓ przed zmianą hasła startowego API jest zablokowane (1/1)
- ✓ słabe hasło jest odrzucane (1/1)
- ✓ stare hasło przestaje działać (1/1)
- ✓ nowy operator musi zmienić hasło przy pierwszym logowaniu (6/6)
- ✓ po 5 błędnych hasłach konto jest chwilowo blokowane (1/1)
- ✓ sesja wygasa po nocy bezczynności i operator loguje się ponownie (1/1)

**Projekty**

- ✓ projekt zapisuje etapy (19/19)

**Przypomnienia**

- ✓ przypomnienie pojawia się w porę i czeka na potwierdzenie (366/366)
- ✓ nie pojawia się przypomnienie, którego nie powinno być (przed czasem, po potwierdzeniu, do zamkniętego zadania) (366/366)
- ✓ odłożone przypomnienie znika do wyznaczonej pory (83/83)

**Raporty automatyczne**

- ✓ raport tygodniowy wysłany w każdy piątek, po jednym (1/1)
- ✓ raport miesięczny wysłany ostatniego dnia miesiąca do obu odbiorców (1/1)
- ✓ wiadomość z raportem ma załącznik PDF (7/7)
- ✓ raport miesięczny obejmuje okres od 1. do ostatniego dnia miesiąca (2/2)

**Raporty**

- ✓ aktywność operatora: liczby wg rodzaju i kierunku oraz czas zgodne z księgą (35/35)
- ✓ aktywność operatora: wiersz sumy (35/35)
- ✓ skuteczność handlowców: transakcje, klienci, netto i brutto zgodne z księgą (7/7)
- ✓ skuteczność handlowców: suma netto (7/7)
- ✓ handlowiec widzi w raporcie sprzedaży tylko siebie (7/7)
- ✓ kierownik widzi w raporcie sprzedaży tylko swój zespół (7/7)
- ✓ statystyka zadań: wszystkie / wykonane / w terminie / w toku / przeterminowane / anulowane zgodne z księgą (7/7)
- ✓ czas pracy wg operatora: korespondencja + ewidencja zadań zgodne z księgą (7/7)
- ✓ czas pracy wg kontrahenta: ta sama suma godzin co wg operatora (7/7)
- ✓ czas pracy: udziały kontrahentów sumują się do 100% (7/7)
- ✓ brak aktywności: lista kontrahentów bez kontaktu od N dni zgodna z księgą (14/14)
- ✓ brak aktywności: filtr „tylko kluczowi” (14/14)
- ✓ raport zapisuje się do PDF (35/35)
- ✓ raport eksportuje się do XLSX (35/35)

**Rejestry**

- ✓ liczba kontrahentów w rejestrze zgodna z księgą (25/25)
- ✓ rejestr domyślnie pokazuje tylko aktywnych kontrahentów (25/25)
- ✓ liczba pozycji korespondencji zgodna z księgą (25/25)
- ✓ liczba dokumentów sprzedaży zgodna z księgą (25/25)
- ✓ liczba zamówień zgodna z księgą (25/25)
- ✓ liczba projektów zgodna z księgą (25/25)
- ✓ eksport rejestru do XLSX zachowuje polskie znaki (1/1)
- ✓ eksport nie zamienia tekstu zaczynającego się od „=” w formułę (1/1)

**SMS**

- ✓ bez skonfigurowanej bramki SMS czeka w kolejce (1/1)
- ✓ wysyłka SMS kończy się statusem „wysłano” (21/21)
- ✓ każdy SMS trafia do bramki dokładnie raz (28/28)
- ✓ system nie wysyła SMS-ów, których nikt nie zlecił (28/28)
- ✓ SMS ma ustawionego nadawcę i polskie znaki (1/1)

**Spójność danych**

- ✓ baza przechodzi kontrolę integralności (1/1)
- ✓ brak naruszonych powiązań między tabelami (1/1)
- ✓ każdy załącznik wskazuje istniejący obiekt (1/1)
- ✓ przypomnienia nie wiszą przy usuniętych zadaniach (1/1)
- ✓ każde zadanie ma co najmniej jednego wykonawcę (1/1)
- ✓ zadania wykonane mają 100% i datę wykonania (1/1)
- ✓ każdy plik z bazy istnieje na dysku (1/1)
- ✓ numery dokumentów, korespondencji i zamówień są unikalne (3/3)

**Stabilność**

- ✓ poprawna operacja operatora zostaje przyjęta (9288/9288)

**Uprawnienia do dokumentów**

- ✓ pracownik uprawnionego działu pobiera dokument (1/1)
- ✓ uprawnienie „wgląd” nie pozwala edytować dokumentu (1/1)
- ✓ uprawnienie „wgląd” nie pozwala dodać nowej wersji (1/1)
- ✓ bez uprawnienia „edycja” nie można dodać dokumentu do segregatora (1/1)
- ✓ operator spoza uprawnionych nie otworzy: kartę dokumentu (1/1)
- ✓ operator spoza uprawnionych nie otworzy: plik dokumentu (1/1)
- ✓ operator spoza uprawnionych nie otworzy: starszą wersję pliku (1/1)
- ✓ operator spoza uprawnionych nie otworzy: uprawnienia dokumentu (1/1)
- ✓ dokument bez uprawnień nie pojawia się w rejestrze (1/1)
- ✓ dokument bez uprawnień nie pojawia się w załącznikach kartoteki kontrahenta (1/1)
- ✓ chroniony dokument dołączony do korespondencji nie daje się pobrać bez uprawnień (1/1)
- ✓ nie można dołączyć jako załącznik dokumentu, do którego nie ma się dostępu (1/1)
- ✓ uprawnienie imienne daje dostęp do pojedynczego dokumentu (1/1)
- ✓ uprawnienia dokumentu zastępują uprawnienia segregatora (1/1)
- ✓ nie można rozesłać dokumentu, do którego nie ma się dostępu (1/1)

**Uprawnienia**

- ✓ operator widzi w rejestrze zadań dokładnie zadania swoje / zespołu (administrator wszystkie) (125/125)
- ✓ handlowiec nie zakłada kont (25/25)
- ✓ handlowiec nie nadaje sobie roli administratora (25/25)
- ✓ handlowiec nie czyta konfiguracji SMTP (25/25)
- ✓ handlowiec nie zmienia konfiguracji SMS (25/25)
- ✓ handlowiec nie zmienia słowników (25/25)
- ✓ handlowiec nie zmienia reguł automatycznych (25/25)
- ✓ handlowiec nie czyta dziennika zmian (25/25)
- ✓ handlowiec nie zmienia cen w kartotece towarowej (25/25)
- ✓ handlowiec nie importuje danych (25/25)
- ✓ pracownik uprawnionego działu widzi uprawnienia segregatora (25/25)
- ✓ operator bez dostępu nie odczyta uprawnień segregatora (25/25)
- ✓ kierownik nie zakłada kont (25/25)
- ✓ kierownik nie zmienia konfiguracji SMTP (25/25)
- ✓ handlowiec nie pobiera raportu innego handlowca (25/25)
- ✓ operator spoza zespołu nie pobiera raportu kierownika (25/25)
- ✓ handlowiec nie usuwa kontrahentów (25/25)
- ✓ kontrahenta z historią nie da się usunąć (nawet kierownikowi) (25/25)
- ✓ handlowiec nie edytuje cudzej korespondencji (25/25)
- ✓ handlowiec nie usuwa cudzej korespondencji (25/25)
- ✓ operator nie odczyta po identyfikatorze prywatnego zadania innej osoby (25/25)
- ✓ operator nie zmieni postępu cudzego zadania (25/25)
- ✓ operator nie usunie cudzego zadania (25/25)
- ✓ operator nie ponowi cudzej wysyłki (25/25)
- ✓ wysłanej wiadomości nie da się wysłać ponownie z kolejki (25/25)
- ✓ wysłanej wiadomości nie da się „anulować” (25/25)
- ✓ w skrzynce odbiorczej są wyłącznie wiadomości adresowane do operatora (25/25)
- ✓ handlowiec nie przypisze sobie cudzej sprzedaży (24/24)
- ✓ operator nie wycofa cudzej wiadomości (24/24)
- ✓ handlowiec nie wyśle cudzej korespondencji (23/23)

**Zadania automatyczne**

- ✓ nowy kontrahent → jedno zadanie „kontakt” dla prowadzącego za 3 dni o 10:00 (141/141)
- ✓ reguła administratora: zamówienie → zadanie dla autora następnego dnia 08:30 (42/42)

**Zadania cykliczne**

- ✓ seria ma dokładnie oczekiwane wystąpienia (bez braków i duplikatów) na 60 dni naprzód (75/75)
- ✓ wystąpienie ma właściwe godziny i wykonawców (także po zmianie czasu) (41/41)

**Zadania**

- ✓ w systemie nie ma zadań, których nikt nie utworzył (5369/5369)
- ✓ zmiana postępu ustawia właściwy procent i status (165/165)
- ✓ przesunięcie w kalendarzu zachowuje czas trwania (37/37)

**Zamówienia i sprzedaż**

- ✓ wartość netto sprzedaży = suma pozycji (97/97)
- ✓ wartość brutto sprzedaży = suma pozycji z VAT (97/97)
- ✓ wartość netto zamówienia = suma pozycji (42/42)
- ✓ wartość brutto zamówienia = suma pozycji z VAT (42/42)
- ✓ numer zamówienia we wzorze DIAGNOS/ZAM/n/RRRR (42/42)

**Załączniki**

- ✓ załącznik korespondencji pobiera się w niezmienionej postaci i pod właściwą nazwą (39/39)

## Etap w przeglądarce

Przejrzano 96 ekranów na danych z symulacji; zrzuty: 21 plików w katalogu `ekrany/`.
