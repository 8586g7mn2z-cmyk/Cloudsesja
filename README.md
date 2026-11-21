# DIAGNOS CRM

Webowy system CRM dla firmy DIAGNOS: rejestr kontrahentów z kartoteką, korespondencja (także e-mail, seryjna, wewnętrzna i SMS), zadania z kalendarzem, przypomnieniami i zadaniami cyklicznymi, projekty, zamówienia, sprzedaż, rejestr dokumentów z wersjami i uprawnieniami, szablony dokumentów PDF oraz raporty z wysyłką automatyczną.

Aplikacja działa jako jeden proces Node.js: serwer API, zbudowany interfejs i zadania w tle (przypomnienia, zadania cykliczne, kolejka wysyłki, raporty automatyczne). Dane trzyma w bazie SQLite, a pliki (załączniki, dokumenty) w katalogu danych.

Zestawienie wymagań klienta ze stanem realizacji: [`docs/WYMAGANIA.md`](docs/WYMAGANIA.md). Format plików importu: [`docs/IMPORT.md`](docs/IMPORT.md). Zrzuty ekranów: [`docs/zrzuty/`](docs/zrzuty/).

## Wymagania

- Node.js 22.13 lub nowszy (wbudowany moduł `node:sqlite`), npm 10.
- Albo Docker z Docker Compose.
- Przeglądarka: aktualny Chrome, Edge lub Firefox; ekran od 1366 px szerokości.

## Uruchomienie lokalne

```bash
npm install
npm run build          # buduje interfejs (dist/client) i serwer (dist/server)
npm start              # http://localhost:3000
```

Tryb deweloperski z automatycznym przeładowaniem: `npm run dev` (serwer na porcie 3000, interfejs Vite na http://localhost:5173).

Najważniejsze zmienne środowiskowe:

| Zmienna | Znaczenie | Domyślnie |
|---|---|---|
| `PORT` | port HTTP | `3000` |
| `DIAGNOS_DATA_DIR` | katalog z bazą `diagnos.sqlite` i plikami `files/` | `./data` |
| `DIAGNOS_SECRET` | klucz do szyfrowania haseł SMTP i kluczy bramki SMS w bazie | generowany do `DATA_DIR/secret.key` |
| `DIAGNOS_ADMIN_PASSWORD` | hasło startowe konta `admin` (tylko przy pierwszym uruchomieniu) | losowe |
| `DIAGNOS_COOKIE_SECURE` | `1` = ciasteczko sesji tylko przez HTTPS (ustaw za serwerem HTTPS) | `0` |
| `DIAGNOS_SCHEDULER_MS` | co ile ms działa harmonogram zadań w tle | `20000` |
| `TZ` | strefa czasowa firmy | `Europe/Warsaw` |

## Uruchomienie w Dockerze

```bash
docker compose up -d --build
docker compose logs diagnos-crm     # tu widać hasło startowe administratora
```

Dane (baza i pliki) trafiają do wolumenu `diagnos-data` (w kontenerze `/data`). Przed uruchomieniem produkcyjnym ustaw `DIAGNOS_SECRET` (np. w pliku `.env` obok `docker-compose.yml`) i nie zmieniaj go później — bez niego zapisane hasło SMTP nie da się odszyfrować. Gdy aplikacja stoi za serwerem HTTPS (np. nginx, Caddy), ustaw też `DIAGNOS_COOKIE_SECURE=1`.

## Pierwsze logowanie

Przy pierwszym uruchomieniu na pustej bazie system tworzy konto **admin** i wypisuje w logu hasło startowe (zapisuje je też w `DATA_DIR/haslo-startowe-admin.txt`). Po zalogowaniu trzeba ustawić własne hasło; plik z hasłem startowym zostaje wtedy usunięty.

Następnie w **Ustawieniach** administrator:

1. zakłada operatorów (role: administrator, kierownik, handlowiec), przypisuje przełożonych i działy,
2. uzupełnia **Dane firmy** i logo (nagłówek dokumentów i raportów PDF),
3. konfiguruje **Pocztę SMTP** i ewentualnie **Bramkę SMS**,
4. przegląda **Słowniki**, **Pola dodatkowe** i **Reguły zadań**.

Role: administrator ma pełny dostęp i konfigurację; kierownik widzi zadania i raporty swoich pracowników (operatorów, dla których jest wpisany jako przełożony), zakłada segregatory i szablony; handlowiec widzi własne zadania i raporty. Uprawnienia są sprawdzane na serwerze.

## Dane przykładowe

Do prezentacji można załadować fikcyjne dane (64 kontrahentów z osobami, korespondencję, zadania, projekty, zamówienia, sprzedaż, dokumenty). Ładuje się je **osobnym poleceniem**, tylko do pustej bazy:

```bash
npm run seed                          # lokalnie (wymaga zależności deweloperskich)
docker compose exec diagnos-crm node dist/server/seed.js   # w kontenerze
```

Polecenie wypisuje hasło wspólne dla operatorów przykładowych (`jkowalska` — kierownik, `pnowak`, `mwisniewska`, `tzielinski`, `akrawczyk` — handlowcy). Hasło można ustalić zmienną `DIAGNOS_SEED_PASSWORD`. Wszystkie nazwy firm, osoby, adresy i numery są zmyślone (NIP-y mają poprawną sumę kontrolną).

## Konfiguracja poczty (SMTP)

Ustawienia → Poczta SMTP: serwer, port, szyfrowanie (STARTTLS dla 587/25 lub SSL/TLS dla 465), login, hasło, adres i nazwa nadawcy. Przycisk „Wyślij test” wysyła wiadomość próbną i pokazuje faktyczną odpowiedź serwera. Hasło jest szyfrowane w bazie i nie wraca do przeglądarki.

Dopóki SMTP nie jest skonfigurowany, każda wiadomość (korespondencja e-mail, korespondencja seryjna, przypomnienia e-mail, raporty automatyczne) trafia do **Kolejki wysyłki** ze stanem „oczekuje na konfigurację SMTP”, a interfejs mówi to wprost. Po skonfigurowaniu serwera kolejka wysyła je automatycznie. Wysyłka ma do 3 prób z rosnącym odstępem; błędy widać w kolejce i w korespondencji.

Do testów jest lokalny serwer przechwytujący pocztę: `npm run smtp-test` (SMTP na porcie 2525, podgląd wiadomości na http://localhost:2526). W ustawieniach podaj wtedy serwer `localhost`, port `2525`, bez szyfrowania.

## Konfiguracja SMS

Ustawienia → Bramka SMS. Warstwa SMS ma wymienne adaptery:

- **SMSAPI.pl** — token API i pole nadawcy,
- **dowolna bramka HTTP** — adres, metoda, treść żądania ze zmiennymi `{{numer}}`, `{{tresc}}`, `{{nadawca}}`, `{{token}}` i opcjonalny tekst potwierdzenia w odpowiedzi.

Bez skonfigurowanej bramki SMS-y czekają w kolejce ze stanem „oczekuje na konfigurację bramki” — system nie udaje wysyłki. Kolejny dostawca to nowy adapter w `server/src/services/messaging.ts`.

## Import danych i programy fakturujące

Narzędzia → Import danych przyjmuje pliki XLSX i CSV z mapowaniem kolumn: kontrahenci, osoby kontaktowe, kartoteka towarowa i transakcje sprzedaży. Przed zapisem można sprawdzić plik bez zapisu (podgląd), a po imporcie dostaje się raport: dodane, zaktualizowane, odrzucone z powodem. Format plików: [`docs/IMPORT.md`](docs/IMPORT.md).

Logika importu jest oddzielona od źródła danych (`server/src/services/importCore.ts` przyjmuje znormalizowane rekordy, `importer.ts` to źródło plikowe). Rekordy zapamiętują nazwę źródła i identyfikator zewnętrzny, a ponowny import aktualizuje istniejące rekordy (dla kontrahentów zapasowo po NIP-ie) zamiast tworzyć duplikaty.

**Integracja z enova365** (programem fakturującym klienta) jest zaplanowana na kolejny etap; obecnie dostępny jest import plikowy, np. z eksportu z enova365 do XLSX/CSV.

## Kopie zapasowe

Wszystkie dane są w katalogu `DIAGNOS_DATA_DIR` (w Dockerze wolumen `/data`):

- `diagnos.sqlite` (+ pliki `-wal`, `-shm`) — baza,
- `files/` — załączniki, wersje dokumentów, wygenerowane PDF-y,
- `secret.key` — klucz szyfrujący (jeśli nie ustawiono `DIAGNOS_SECRET`).

Kopię na działającym systemie (spójna kopia bazy, pliki i klucz) robi skrypt:

```bash
DIAGNOS_DATA_DIR=./data node scripts/kopia.mjs /sciezka/do/kopii         # lokalnie
docker compose exec diagnos-crm node scripts/kopia.mjs /data/kopie/dzis    # w kontenerze
docker compose cp diagnos-crm:/data/kopie/dzis ./kopia-dzis               # skopiowanie z kontenera
```

Skrypt nie zatrzymuje aplikacji (baza jest kopiowana poleceniem `VACUUM INTO`). Kopie trzymaj poza serwerem. Odtworzenie: zatrzymaj aplikację, podmień `diagnos.sqlite`, katalog `files/` i `secret.key` w katalogu danych (usuń stare pliki `diagnos.sqlite-wal` i `-shm`) i uruchom aplikację.

## Testy

```bash
npm test                 # testy backendu (Vitest): uprawnienia, zadania cykliczne, reguły, przypomnienia,
                         # wiadomości z terminem, numeracja, import, raporty, NIP/REGON, wysyłka SMTP/SMS
npm run build && npm run test:e2e   # test przeglądarkowy głównej ścieżki (Playwright, Chromium)
```

Test wysyłki e-mail uruchamia w trakcie testu lokalny serwer SMTP, więc nie wymaga dostępu do sieci. Gdy Chromium jest zainstalowany poza Playwrightem, wskaż go zmienną `PW_CHROMIUM=/ścieżka/do/chromium`.

## Architektura

- `server/src` — TypeScript, Fastify (REST API pod `/api`), `node:sqlite`, nodemailer, pdfkit (PDF z czcionką DejaVu Sans dla polskich znaków), exceljs.
  - `migrations.ts` — schemat bazy i dane startowe słowników; `db.ts` — cienka warstwa dostępu do bazy,
  - `routes/` — API modułów, `services/` — logika (zadania, przypomnienia, reguły, wysyłka, uprawnienia do dokumentów, raporty, PDF, import, harmonogram).
- `client/src` — React + Vite. Wszystkie rejestry korzystają z jednego komponentu `components/DataTable.tsx` (filtry, sortowanie wielokolumnowe, wybór kolumn, grupowanie wielopoziomowe z licznikami i sumami, wirtualizacja wierszy, eksport XLSX/CSV, wydruk).
- Przejście na PostgreSQL: logika korzysta wyłącznie z metod `all/get/run/insert/update/tx` klasy `Db` i standardowego SQL z parametrami `?`; wystarczy druga implementacja tej klasy (zamiana `?` na `$n`, `RETURNING id`) i przeniesienie schematu z `migrations.ts` (typy `INTEGER PRIMARY KEY` → `serial`, `TEXT` z datami ISO → `timestamp`). Daty są zapisywane jako lokalny czas firmy w formacie ISO.
- Wybrany `node:sqlite` zamiast `better-sqlite3`, bo nie wymaga kompilacji modułu natywnego przy instalacji i budowie obrazu. Moduł jest w Node 22 oznaczony jako eksperymentalny (stąd flaga `--disable-warning=ExperimentalWarning` w poleceniu startowym); API, z którego korzysta aplikacja, jest stabilne.
