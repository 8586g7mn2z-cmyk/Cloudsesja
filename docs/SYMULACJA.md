# Symulacja pracy firmy

Symulacja sprawdza cały system naraz, tak jak będzie używany: przez kilka tygodni „czasu firmy" zespół operatorów pracuje w DIAGNOS CRM, a niezależna księga kontrolna porównuje każdy wynik z tym, co powinno się stać.

## Uruchomienie

```
npm run build        # potrzebne tylko dla etapu w przeglądarce
npm run symulacja
```

Trwa około 4–5 minut. Wynik to kod wyjścia (0 = bez niezgodności) oraz katalog `symulacja/wyniki/<data>/` z plikami `raport.md`, `raport.json` i zrzutami ekranów w `ekrany/`.

| Parametr | Znaczenie | Domyślnie |
|---|---|---|
| `--dni N` | liczba dni kalendarzowych | 33 |
| `--start RRRR-MM-DD` | pierwszy dzień (najlepiej poniedziałek) | 2026-03-02 |
| `--seed N` | ziarno losowości; to samo ziarno daje ten sam przebieg | 7 |
| `--intensywnosc P` | prawdopodobieństwo czynności operatora w kwadransie | 0.3 |
| `--bez-ui` | pomija etap w przeglądarce | — |
| `--zostaw` | zostawia bazę i pliki symulowanej firmy w `wyniki/<data>/dane` | — |

Przykład: `npm run symulacja -- --dni 12 --seed 3 --bez-ui`.

Domyślny okres (2 marca – 3 kwietnia 2026) jest dobrany celowo: obejmuje zmianę czasu na letni (29 marca), koniec miesiąca i pięć piątków.

## Jak to działa

1. **Prawdziwy serwer, pusta baza.** Symulacja uruchamia ten sam kod serwera co produkcja, na nowej bazie w katalogu wyników. Nie dotyka danych w `data/`.
2. **Przesuwany zegar.** Czas aplikacji jest ustawiany przez symulację. Dzień roboczy to kwadranse od 8:00 do 16:00; po każdym kroku uruchamiane są zadania tła (przypomnienia, doręczanie wiadomości, zadania cykliczne, raporty automatyczne, kolejka wysyłki). Weekendy i noce też upływają.
3. **Operatorzy-boty.** Administrator, kierownik, czterech handlowców z jego zespołu i jeden operator z innego działu logują się i pracują przez to samo API, z którego korzysta przeglądarka: dodają kontrahentów i osoby, rejestrują rozmowy i spotkania, wysyłają e-maile i SMS-y, planują i wykonują zadania, wystawiają zamówienia i sprzedaż, dodają dokumenty i ich wersje, piszą do siebie wiadomości.
4. **Zdarzenia zaplanowane.** W określone dni dzieją się rzeczy trudne: praca przed skonfigurowaniem poczty, import bazy z plików, dokumenty z ograniczonym dostępem, dwie korespondencje seryjne, trzygodzinna awaria serwera poczty i bramki SMS, równoczesne zapisy.
5. **Niezależna księga.** Symulacja sama prowadzi zapis tego, co zrobili operatorzy, i sama liczy, co z tego wynika (daty wystąpień zadań cyklicznych, sumy sprzedaży, godziny pracy, listy bez kontaktu). Nie korzysta przy tym z logiki aplikacji, więc błąd w aplikacji nie może „potwierdzić sam siebie".
6. **Lokalna poczta i bramka SMS.** Wiadomości trafiają do serwera SMTP i bramki uruchamianych przez symulację. Dzięki temu można policzyć, czy każda wiadomość doszła dokładnie raz i czy nie wyszło nic, czego nikt nie zlecił.
7. **Etap w przeglądarce.** Na koniec, na danych wytworzonych przez symulację, przeglądarka otwiera każdy ekran jako administrator, kierownik i handlowiec.

## Co jest sprawdzane

- **Logowanie i sesje:** wymuszona zmiana hasła, blokada po błędnych próbach, wygasanie sesji, brak dostępu bez logowania (także przez zniekształcony adres).
- **Rejestry:** liczba rekordów w każdym rejestrze zgodna z księgą, po każdym dniu.
- **Kontrahenci:** zapis i odczyt wszystkich pól łącznie z dodatkowymi, walidacja NIP, duplikaty, usuwanie i dezaktywacja, data ostatniego kontaktu.
- **Korespondencja:** numeracja, unikalność numerów przy równoczesnych zapisach, załączniki zgodne co do bajta.
- **E-mail i SMS:** stan „oczekuje na konfigurację", wysyłka, zachowanie w czasie awarii, ponowienie; każda wiadomość dociera dokładnie raz.
- **Korespondencja seryjna:** właściwi odbiorcy, podstawione pola, pominięci bez adresu, wpis u każdego kontrahenta, załącznik z rejestru dokumentów.
- **Korespondencja wewnętrzna:** adresat widzi wiadomość dopiero od wyznaczonego terminu.
- **Zadania:** postęp i statusy, przesuwanie, widoczność wg roli.
- **Zadania cykliczne:** dokładnie oczekiwane wystąpienia na 60 dni naprzód, właściwe godziny po zmianie czasu.
- **Zadania automatyczne:** reguła dla nowego kontrahenta (także z importu) i reguła dodana przez administratora.
- **Przypomnienia:** pojawiają się w porę, nie pojawiają się przed czasem ani po potwierdzeniu, odłożenie działa, e-mail i SMS wychodzą raz.
- **Dokumenty:** wersje, okres ważności i archiwum, uprawnienia segregatora i dokumentu, rejestr zmian, generowanie PDF z szablonu, pliki z aktywną treścią.
- **Import:** kontrahenci (XLSX), osoby (CSV ze średnikami i polskimi znakami), towary, sprzedaż wielopozycyjna; odrzucone wiersze z przyczyną; ponowny import bez duplikatów.
- **Raporty:** wszystkie pięć porównane z księgą co tydzień i na koniec, zakres danych wg roli, PDF i XLSX.
- **Raporty automatyczne:** tygodniowy w każdy piątek, miesięczny ostatniego dnia miesiąca, z załącznikiem PDF.
- **Uprawnienia:** kilkadziesiąt prób wykonania cudzych lub zastrzeżonych operacji, powtarzanych codziennie.
- **Spójność danych:** kontrola integralności bazy, brak osieroconych rekordów, każdy plik istnieje na dysku.
- **Interfejs:** każdy ekran i każda zakładka kartoteki bez błędów skryptu i nieudanych żądań, liczniki rekordów zgodne z księgą, przypomnienie faktycznie wyskakuje na ekranie.

## Jak czytać wynik

Każda niezgodność w `raport.md` ma nazwę sprawdzenia, liczbę wystąpień i przykłady z czasem firmy, operatorem i wartościami „jest / powinno być". To samo ziarno odtwarza ten sam przebieg, więc poprawkę można sprawdzić ponownym uruchomieniem.

Czego symulacja nie obejmuje: prawdziwego serwera pocztowego i bramki SMS klienta, pracy wielu przeglądarek jednocześnie, wyglądu ekranów (poza zrzutami do obejrzenia) oraz obciążenia powyżej kilkuset rekordów na rejestr.
