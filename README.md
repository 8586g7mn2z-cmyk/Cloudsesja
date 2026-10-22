# Studio Fryzur Aneta Kunc — redesign anetakunc.pl

Redesign strony [anetakunc.pl](https://anetakunc.pl) (Studio Fryzur Aneta Kunc, Al. KEN 98, Warszawa Ursynów) przygotowany do prezentacji klientowi.
Statyczna strona (HTML / CSS / JS) z animacjami w stylu współczesnych stron agencyjnych: GSAP + ScrollTrigger + SplitText oraz Lenis (płynne przewijanie).

**Gotowa strona leży w folderze [`docs/`](docs/)** — można ją wrzucić na dowolny hosting albo otworzyć `docs/index.html` bezpośrednio z dysku.

## Podstrony (12)

| Plik | Zawartość |
|---|---|
| `index.html` | Strona główna: hero z animowanymi pasmami włosów (canvas), manifest podświetlany przy przewijaniu, lista usług z podglądem pod kursorem, przebieg wizyty, przypinana pozioma galeria odcieni, marki, zespół, ocena 5,0 |
| `o-nas.html` | Historia studia, wartości (sticky), zespół, wyróżnienia |
| `uslugi.html` | Usługi jako nakładające się karty (sticky stack) |
| `uslugi/strzyzenie.html`, `koloryzacja.html`, `pielegnacja.html`, `stylizacja.html` | Strona usługi: opis, zakres, przebieg krok po kroku, wycinek cennika, FAQ (akordeon), link do następnej usługi |
| `cennik.html` | Pełny cennik z przyklejonymi zakładkami kategorii i cenami według długości włosów |
| `galeria.html` | Galeria z filtrami i lightboxem (klawiatura, swipe) |
| `kontakt.html` | Telefon / e-mail (kopiowanie), godziny z wyróżnieniem dzisiejszego dnia i statusem „otwarte / zamknięte”, formularz z walidacją, mapa Google ładowana po kliknięciu |
| `polityka-prywatnosci.html`, `404.html` | Dokument RODO i strona błędu |

Dodatkowo: preloader przy pierwszej wizycie, przejścia między podstronami, własny kursor i przyciski „magnetyczne” (desktop), pełnoekranowe menu mobilne, dane strukturalne `HairSalon` (SEO), Open Graph, `sitemap.xml`, `robots.txt`, manifest.
Strona respektuje `prefers-reduced-motion`, działa bez JavaScriptu (treść widoczna) i jest w pełni responsywna.

## Uruchomienie

Wymagany jest tylko Node 18+ (bez zależności npm).

```bash
npm run build   # generuje docs/ ze źródeł
npm run dev     # build + podgląd na http://localhost:8080
```

## Struktura

```
build/
  data.mjs      ← CAŁA TREŚĆ: dane kontaktowe, godziny, usługi, ceny, zespół, odcienie galerii, opinie
  pages.mjs     ← szablony podstron
  layout.mjs    ← wspólny szkielet: head, nagłówek, menu, stopka
  art.mjs       ← generator grafik „pasma włosów” (SVG)
  build.mjs     ← składa stronę do docs/
  serve.mjs     ← lokalny serwer podglądu
src/assets/
  css/main.css  ← style (kolory na górze pliku, sekcja TOKENS)
  js/main.js    ← animacje i interakcje
  img/          ← logo.svg, wordmark.svg, favicon, og.jpg
  fonts/        ← Instrument Serif, Geist, Geist Mono (lokalnie, bez Google Fonts)
  vendor/       ← GSAP 3.15, Lenis 1.3
docs/           ← wygenerowana strona (nie edytować ręcznie)
```

## Do uzupełnienia przed publikacją

Środowisko, w którym powstał projekt, nie miało dostępu do anetakunc.pl ani do stron referencyjnych, dlatego:

1. **Logo** — `src/assets/img/logo.svg` to typograficzny wordmark „Aneta Kunc | Studio Fryzur”. Prawdziwe logo podmień w tym pliku (SVG z `fill="currentColor"` automatycznie zmienia kolor na ciemnych sekcjach). Duży napis w stopce: `wordmark.svg`.
2. **Kolorystyka** — paleta (kość słoniowa, atrament, karmel) jest w `src/assets/css/main.css`, sekcja `TOKENS` (`--bg`, `--ink`, `--accent` itd.). Zmiana kilku zmiennych przekolorowuje całą stronę.
3. **Zdjęcia** — w miejscach zdjęć są generowane grafiki pasm włosów w odcieniach usług. Prawdziwe zdjęcia wrzuć do `src/assets/img/` i wpisz ścieżkę w polu `photo` w `build/data.mjs` (usługi, zespół, odcienie galerii) — np. `photo: 'assets/img/balayage-01.jpg'`.
4. **Ceny** — pochodzą z publicznego cennika salonu na Booksy i mogą być nieaktualne. Do potwierdzenia z salonem (`build/data.mjs` → `services[].prices`).
5. **Opinie** — sekcja z cytatami pojawi się automatycznie po dodaniu prawdziwych opinii do tablicy `testimonials` w `build/data.mjs`. Nie wstawiono wymyślonych opinii.
6. **Wyróżnienia** (Orły Fryzjerstwa, Złota Firma) i opisy zespołu — do potwierdzenia z salonem.
7. **Formularz** — bez backendu otwiera gotową wiadomość w programie pocztowym (mailto). Aby wysyłał bezpośrednio, podepnij np. Formspree lub skrypt PHP w `contactForm()` w `main.js`.

Po każdej zmianie: `npm run build`.

## Publikacja

- **GitHub Pages**: Settings → Pages → *Deploy from a branch* → gałąź z projektem, folder `/docs`.
- **Dowolny hosting** (FTP / Netlify / Vercel): wgraj zawartość folderu `docs/`.

Fonty i biblioteki są lokalne — strona nie ładuje nic z zewnętrznych CDN. Jedyne zewnętrzne zasoby to mapa Google (dopiero po kliknięciu) oraz linki do Booksy i Facebooka.
