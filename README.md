# Studio Fryzur Aneta Kunc: strona anetakunc.pl

Statyczna strona (HTML / CSS / JS) z animacjami GSAP (ScrollTrigger, SplitText) i płynnym przewijaniem Lenis.
**Gotowa strona leży w folderze [`docs/`](docs/)**: wgrywa się ją na hosting w całości albo otwiera `docs/index.html` z dysku.

## Struktura

```
docs/                     ← strona (to wgrywasz na serwer)
  *.html, uslugi/*.html   ← 12 podstron
  assets/css/main.css     ← style
  assets/js/main.js       ← animacje i interakcje (TU edytujesz kod JS)
  assets/js/app.js        ← paczka: biblioteki + main.js (wygenerowana, nie edytować)
  assets/vendor/          ← GSAP 3.15, Lenis 1.3 (źródła paczki)
  assets/fonts, assets/img
  .htaccess               ← pamięć podręczna dla serwerów Apache
scripts/bundle.mjs        ← składa app.js
scripts/serve.mjs         ← lokalny podgląd
serwer/                   ← konfiguracja nginx dla Pleska + opis naprawy serwera vbox.pl
```

## Praca z kodem

Wymagany jest tylko Node 18+ (bez zależności npm).

```bash
npm run bundle   # po każdej zmianie w docs/assets/js/main.js
npm run serve    # podgląd na http://localhost:8080
```

Po zmianie `main.css` lub `main.js` podbij wersję `?v=...` w plikach HTML (wyszukaj `?v=`), żeby przeglądarki pobrały nowe pliki.

## Płynność animacji

Zmiany z 23.10.2026 (wygląd i charakter animacji bez zmian):

- animowane pasma w hero rysuje osobny wątek (OffscreenCanvas + Web Worker), więc nie blokują przewijania; gdy przeglądarka tego nie obsługuje, rysuje wątek główny;
- „cięcie nożycami” przy zdjęciach działa na natywnych Web Animations zamiast przeliczania w JS w każdej klatce;
- obracające się gwiazdki w pasku przewijanym animują element HTML (kompozytor) i zatrzymują się poza ekranem; wcześniej powodowały przemalowanie całego dokumentu w każdej klatce;
- Lenis działa na początku klatki (bez wymuszonego przeliczania stylów), nagłówek i zakładki cennika przełączają się na progach ScrollTrigger zamiast mierzyć sekcje w każdej klatce;
- filtr „fali” przy najechaniu na zdjęcia jest o połowę lżejszy.

Pomiar przy procesorze spowolnionym 4× (jak średni telefon), strona główna: przed 33 kl./s, najgorsza klatka 267 ms; po 54 kl./s, najgorsza klatka 50 ms. Widok telefonu: 49 → 58 kl./s, najgorsza klatka 133 → 33 ms.

## Odporność na błędy serwera

Patrz [`serwer/NAPRAWA-SERWERA.md`](serwer/NAPRAWA-SERWERA.md): diagnoza serwera vbox.pl (seryjne błędy 502, brak cache, HTTP/1.1, niepełny łańcuch SSL) i instrukcja naprawy w Plesku.
