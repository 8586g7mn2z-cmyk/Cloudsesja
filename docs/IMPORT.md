# Import danych — format plików

Import znajduje się w menu **Narzędzia → Import danych**. Obsługiwane pliki:

- **XLSX** — czytany jest pierwszy arkusz,
- **CSV** — separator `;`, `,` lub tabulator (wykrywany automatycznie), kodowanie UTF-8 (także z BOM) lub Windows-1250.

Pierwszy wiersz musi zawierać nagłówki kolumn. Kolejność i nazwy kolumn są dowolne — po wgraniu pliku system proponuje mapowanie (rozpoznaje typowe nazwy, np. „Nazwa”, „NIP”, „Miejscowość”), a użytkownik może je zmienić. Przycisk **Szablon CSV z nagłówkami** pobiera pusty plik z nazwami pól.

Przebieg: wgranie pliku → mapowanie kolumn → **Sprawdź bez zapisu** (podgląd wyniku, nic nie jest zapisywane) → **Importuj** → raport: dodane, zaktualizowane, odrzucone (numer wiersza i powód). Historia importów z listą odrzuconych wierszy zostaje w systemie.

## Zasady wspólne

- **Nazwa źródła** (pole na ekranie importu, domyślnie „plik XLSX/CSV”) jest zapisywana przy rekordach jako `external_source`, a kolumna „Identyfikator w systemie źródłowym” jako `external_id`.
- **Ponowny import aktualizuje** istniejące rekordy zamiast tworzyć duplikaty. Kolejność dopasowania:
  - kontrahent: identyfikator zewnętrzny (w obrębie tej samej nazwy źródła) → NIP → (gdy brak obu) pełna nazwa,
  - osoba kontaktowa: identyfikator zewnętrzny → ten sam kontrahent i e-mail lub imię i nazwisko,
  - towar: identyfikator zewnętrzny → indeks,
  - transakcja: identyfikator zewnętrzny → numer dokumentu u tego samego kontrahenta (pozycje są zastępowane).
- Kolumny niezmapowane nie zmieniają danych. Puste pole w zmapowanej kolumnie czyści wartość u kontrahentów i osób kontaktowych; w kartotece towarowej puste pola nie zmieniają zapisanych wartości.
- Liczby: dopuszczalny przecinek lub kropka dziesiętna, spacje tysięcy i dopisek „zł” (`1 234,56 zł`). Daty: `DD.MM.RRRR` lub `RRRR-MM-DD` (także komórki typu data w XLSX).
- Zalecana kolejność: kontrahenci → osoby kontaktowe → kartoteka towarowa → transakcje sprzedaży (osoby i transakcje wskazują kontrahenta, a pozycje transakcji mogą wskazywać towar po indeksie).

## Kontrahenci

| Pole | Wymagane | Uwagi |
|---|---|---|
| Pełna nazwa | tak | |
| Skrót nazwy | | |
| NIP | | sprawdzana suma kontrolna; zapisywany bez kresek; ten sam NIP dwa razy w pliku → drugi wiersz odrzucony |
| REGON | | 9 lub 14 cyfr, sprawdzana suma kontrolna |
| KRS, Urząd skarbowy | | |
| Ulica i numer, Kod pocztowy, Miasto, Województwo, Kraj | | adres siedziby; kraj domyślnie „Polska” |
| Telefon, Telefon 2, E-mail, WWW | | e-mail sprawdzany |
| Typ, Status, Grupa, Podgrupa, Grupa cenowa, Źródło kontaktu | | nazwy pozycji słowników; brakujące pozycje są dopisywane do słowników (można to wyłączyć — wtedy wiersz jest odrzucany); podgrupa wymaga grupy |
| Prowadzący | | login lub imię i nazwisko operatora |
| Limit kredytu | | liczba |
| Nr umowy, Uwagi | | |
| Kluczowy | | `tak` / `nie` (także `1`, `x`) |
| Identyfikator w systemie źródłowym | | np. kod kontrahenta w programie fakturującym |
| Pola dodatkowe | | każde pole zdefiniowane w Ustawieniach → Pola dodatkowe; liczby i daty są walidowane |

Po dodaniu nowego kontrahenta działają reguły automatyczne (np. zadanie „kontakt” dla prowadzącego).

## Osoby kontaktowe

| Pole | Wymagane | Uwagi |
|---|---|---|
| Kontrahent: identyfikator / NIP / nazwa | co najmniej jedno | wskazuje kontrahenta już istniejącego w bazie |
| Identyfikator osoby w systemie źródłowym | | |
| Imię | | |
| Nazwisko | tak | |
| Stanowisko, Telefon, Telefon komórkowy, E-mail, Uwagi | | e-mail sprawdzany |

## Kartoteka towarowa

| Pole | Wymagane | Uwagi |
|---|---|---|
| Indeks | | klucz dopasowania przy ponownym imporcie (gdy brak identyfikatora) |
| Nazwa | tak | |
| Jednostka | | domyślnie `szt.` |
| Cena netto | | liczba ≥ 0 |
| Stawka VAT (%) | | `23`, `23%`, `8`; `zw`/`np` = 0 |
| EAN, Grupa towarowa, Identyfikator w systemie źródłowym | | |

## Transakcje sprzedaży

Jeden wiersz to jedna pozycja dokumentu. Wiersze z tym samym numerem dokumentu są łączone w jedną transakcję.

| Pole | Wymagane | Uwagi |
|---|---|---|
| Numer dokumentu | tak | np. `FV/123/03/2026` |
| Data dokumentu | tak | |
| Kontrahent: identyfikator / NIP / nazwa | co najmniej jedno | |
| Identyfikator dokumentu w systemie źródłowym | | |
| Handlowiec | | login lub imię i nazwisko operatora — źródło raportu skuteczności handlowców |
| Pozycja: nazwa towaru / indeks towaru | | gdy podano tylko indeks, nazwa, cena i VAT są brane z kartoteki towarowej |
| Pozycja: ilość, jednostka, cena netto, stawka VAT | | domyślnie ilość 1, VAT z kartoteki lub 23% |
| Dokument: wartość netto / brutto | | używane, gdy plik nie zawiera pozycji (sam nagłówek dokumentu) |

Przykład (CSV):

```
Numer dokumentu;Data wystawienia;NIP kontrahenta;Handlowiec;Indeks;Ilość;Cena netto;Stawka VAT
FV/1/03/2026;05.03.2026;5261040828;pnowak;DG-0001;2;4890,00;23
FV/1/03/2026;05.03.2026;5261040828;pnowak;DG-0007;4;79,00;23
FV/2/03/2026;06.03.2026;5261040828;pnowak;;;;
```

## enova365

Programem fakturującym klienta jest enova365. **Bezpośrednia integracja z enova365 jest zaplanowana na kolejny etap.** Obecnie dane z enova365 można przenieść przez eksport do XLSX/CSV i ten import (jako nazwę źródła warto wpisać np. `enova365`, a jako identyfikator zewnętrzny — identyfikator kontrahenta/towaru/dokumentu z enova365; wtedy późniejsza integracja zaktualizuje te same rekordy).

Kod importu jest podzielony tak, żeby kolejne źródło było tanie do podłączenia: `server/src/services/importCore.ts` przyjmuje znormalizowane rekordy (kontrahent, osoba, towar, transakcja) i odpowiada za walidację, dopasowanie i zapis; `server/src/services/importer.ts` jest jednym ze źródeł (pliki). Integracja z enova365 ma zbudować takie same rekordy i wywołać `upsertContractor`, `upsertContact`, `upsertProduct`, `upsertSale`.
