// Cała treść strony w jednym miejscu. Zmiana tutaj + `npm run build` aktualizuje wszystkie podstrony.

export const site = {
  name: 'Studio Fryzur Aneta Kunc',
  short: 'Aneta Kunc',
  url: 'https://anetakunc.pl',
  since: 2016,
  phone: '+48 732 737 379',
  phoneHref: 'tel:+48732737379',
  email: 'studioakunc@gmail.com',
  street: 'Al. KEN 98, lok. U11',
  postal: '02-777',
  city: 'Warszawa',
  district: 'Ursynów',
  booksy: 'https://booksy.com/pl-pl/20402_studio-fryzur-aneta-kunc_fryzjer_3_warszawa',
  facebook: 'https://www.facebook.com/studiofryzuranetakunc/',
  maps: 'https://www.google.com/maps/search/?api=1&query=Studio+Fryzur+Aneta+Kunc+Al.+KEN+98+Warszawa',
  mapsEmbed: 'https://www.google.com/maps?q=Studio%20Fryzur%20Aneta%20Kunc%2C%20Aleja%20Komisji%20Edukacji%20Narodowej%2098%2C%2002-777%20Warszawa&output=embed',
  // 0 = niedziela ... 6 = sobota, godziny w strefie Europe/Warsaw
  hours: [
    { day: 'Poniedziałek', short: 'Pn', d: 1, open: '10:00', close: '21:00' },
    { day: 'Wtorek', short: 'Wt', d: 2, open: '10:00', close: '21:00' },
    { day: 'Środa', short: 'Śr', d: 3, open: '10:00', close: '21:00' },
    { day: 'Czwartek', short: 'Cz', d: 4, open: '10:00', close: '21:00' },
    { day: 'Piątek', short: 'Pt', d: 5, open: '10:00', close: '21:00' },
    { day: 'Sobota', short: 'Sb', d: 6, open: '09:00', close: '18:00' },
    { day: 'Niedziela', short: 'Nd', d: 0, open: null, close: null },
  ],
  brands: [
    { name: 'Schwarzkopf Professional', origin: 'Niemcy', text: 'Koloryzacja i rekonstrukcja włosa — m.in. kuracja Fibre Clinix dopasowywana do stanu włosów.' },
    { name: 'Kevin Murphy', origin: 'Australia', text: 'Pielęgnacja i stylizacja inspirowana skincare. Naturalne składniki, lekkie formuły, piękny zapach.' },
    { name: 'Waterclouds', origin: 'Szwecja', text: 'Skandynawska pielęgnacja salonowa — nawilżenie, odbudowa i blask w 30 minut.' },
    { name: 'Natulique', origin: 'Dania', text: 'Organiczne farby i kosmetyki. Koloryzacja dla osób, które szukają łagodniejszej alternatywy.' },
  ],
  awards: [
    { title: '5,0', label: 'średnia ocen klientów na Booksy' },
    { title: 'Orły Fryzjerstwa', label: 'laureat plebiscytu' },
    { title: 'Złota Firma', label: 'wyróżnienie dla rzetelnej firmy' },
  ],
};

export const nav = [
  { href: 'index.html', label: 'Start', key: 'home' },
  { href: 'o-nas.html', label: 'O studiu', key: 'about' },
  { href: 'uslugi.html', label: 'Usługi', key: 'services' },
  { href: 'cennik.html', label: 'Cennik', key: 'prices' },
  { href: 'galeria.html', label: 'Galeria', key: 'gallery' },
  { href: 'kontakt.html', label: 'Kontakt', key: 'contact' },
];

export const team = [
  {
    name: 'Aneta Kunc',
    role: 'Założycielka · stylistka',
    initials: 'AK',
    art: 'team-aneta',
    photo: null,
    bio: 'Prowadzi studio na Ursynowie od 2016 roku. Na co dzień łączy strzyżenie, koloryzację i doradztwo — tak, żeby fryzura dobrze wyglądała nie tylko w dniu wizyty, ale też tydzień później, w domu.',
  },
  {
    name: 'Maciej Ciechoniec',
    role: 'Stylista',
    initials: 'MC',
    art: 'team-maciej',
    photo: null,
    bio: 'Klientki cenią go za uważne słuchanie i trafne propozycje — zarówno przy strzyżeniu, jak i przy koloryzacji. Chętnie podpowiada, jak samodzielnie układać włosy na co dzień.',
  },
];

// Ceny na podstawie cennika salonu w Booksy. k = krótkie, s = średnie, d = długie, bd = bardzo długie.
export const services = [
  {
    slug: 'strzyzenie',
    num: '01',
    name: 'Strzyżenie',
    art: 'cat-strzyzenie',
    photo: null,
    lead: 'Precyzyjne cięcie dopasowane do rysów twarzy, struktury włosa i tego, ile czasu chcesz poświęcać na stylizację.',
    intro: 'Dobre strzyżenie zaczyna się od rozmowy. Pytamy o Twoją codzienność, sposób układania i to, co lubisz (a czego nie) w obecnej fryzurze. Dopiero potem proponujemy kształt — od subtelnego odświeżenia po wyraźną zmianę.',
    includes: ['Konsultacja i dobór formy', 'Mycie z pielęgnacją dopasowaną do włosa', 'Strzyżenie i wykończenie', 'Modelowanie oraz wskazówki do stylizacji w domu'],
    steps: [
      ['Rozmowa', 'Ustalamy oczekiwania, długość i styl życia.'],
      ['Diagnoza', 'Sprawdzamy gęstość, kierunki wzrostu i kondycję włosa.'],
      ['Cięcie', 'Spokojnie, warstwa po warstwie — bez pośpiechu.'],
      ['Stylizacja', 'Pokazujemy, jak odtworzyć efekt samodzielnie.'],
    ],
    faq: [
      ['Jak często warto podcinać włosy?', 'Przy krótkich fryzurach zwykle co 4–6 tygodni, przy dłuższych co 2–3 miesiące. Dokładny rytm zależy od formy i kondycji włosów — podpowiemy go podczas wizyty.'],
      ['Czy mogę przynieść zdjęcie inspiracji?', 'Jak najbardziej. Zdjęcie bardzo ułatwia rozmowę — wspólnie ocenimy, jak dana fryzura sprawdzi się przy Twoim typie włosa.'],
      ['Strzyżecie także panów?', 'Tak. Strzyżenie męskie wyceniamy według długości włosów — szczegóły znajdziesz w cenniku.'],
    ],
    prices: [
      { name: 'Strzyżenie damskie', note: 'z myciem i modelowaniem', tiers: { k: 145, d: 195, bd: 215 } },
      { name: 'Strzyżenie męskie', tiers: { k: 85, s: 115, d: 125 } },
    ],
  },
  {
    slug: 'koloryzacja',
    num: '02',
    name: 'Koloryzacja',
    art: 'cat-koloryzacja',
    photo: null,
    lead: 'Balayage, koloryzacja globalna, odrosty, dekoloryzacja i farby organiczne Natulique. Kolor, który wygląda naturalnie w każdym świetle.',
    intro: 'Kolor dobieramy do karnacji, oczu i tego, jak często chcesz odwiedzać salon. Balayage rośnie miękko i nie wymaga częstych poprawek, koloryzacja globalna daje głębię i blask, a farby organiczne to łagodniejsza alternatywa dla wrażliwej skóry głowy.',
    includes: ['Konsultacja koloru i ocena kondycji włosa', 'Balayage jedno- i dwukolorowy, tonowanie', 'Dekoloryzacja z tonowaniem', 'Koloryzacja farbami organicznymi Natulique'],
    steps: [
      ['Konsultacja', 'Dobieramy odcień i technikę do Ciebie.'],
      ['Przygotowanie', 'Zabezpieczamy włos i skórę głowy.'],
      ['Koloryzacja', 'Nakładanie, kontrola czasu, tonowanie.'],
      ['Pielęgnacja', 'Domknięcie łuski i plan pielęgnacji kolorem.'],
    ],
    faq: [
      ['Czym różni się balayage od pasemek?', 'Balayage nakładany jest ręcznie, „malarsko”, z miękkim przejściem od nasady. Dzięki temu odrost jest mało widoczny, a kolor wygląda naturalnie przez wiele tygodni.'],
      ['Ile trwa wizyta na balayage?', 'Zwykle kilka godzin — zależnie od długości, gęstości i koloru wyjściowego. Dokładny czas podamy po konsultacji.'],
      ['Czy mogę farbować włosy w ciąży lub przy wrażliwej skórze?', 'Wtedy warto rozważyć farby organiczne Natulique. Każdy przypadek omawiamy indywidualnie — najlepiej skonsultować się też z lekarzem.'],
    ],
    prices: [
      { name: 'Koloryzacja + strzyżenie', tiers: { k: 360, bd: 475 } },
      { name: 'Koloryzacja + modelowanie', tiers: { s: 340 } },
      { name: 'Koloryzacja farbami organicznymi + strzyżenie', tiers: { s: 420 } },
      { name: 'Koloryzacja odrostu (organiczna) + strzyżenie', tiers: { s: 380 } },
      { name: 'Balayage jednokolorowy + strzyżenie', tiers: { k: 370, s: 430, d: 490, bd: 555 } },
      { name: 'Balayage dwukolorowy + strzyżenie', tiers: { k: 395, s: 440, d: 525, bd: 605 } },
      { name: 'Balayage + tonowanie + strzyżenie', tiers: { s: 495 } },
      { name: 'Balayage + modelowanie', note: 'bez strzyżenia', from: 315 },
      { name: 'Dekoloryzacja + tonowanie + modelowanie', tiers: { k: 440, s: 500, d: 580, bd: 660 } },
    ],
  },
  {
    slug: 'pielegnacja',
    num: '03',
    name: 'Pielęgnacja',
    art: 'cat-pielegnacja',
    photo: null,
    lead: 'Rytuały Kevin Murphy, Waterclouds i kuracja Schwarzkopf Fibre Clinix. Nawilżenie, odbudowa i blask — widoczne od pierwszej wizyty.',
    intro: 'Zabiegi pielęgnacyjne dobieramy po diagnozie: inaczej traktujemy włosy rozjaśniane, inaczej cienkie i bez objętości, a jeszcze inaczej suche i puszące się. Pielęgnację możesz połączyć ze strzyżeniem lub koloryzacją.',
    includes: ['Diagnoza kondycji włosa i skóry głowy', 'Rytuał Kevin Murphy', 'Pielęgnacja Waterclouds (ok. 30 min)', 'Kuracja Schwarzkopf Fibre Clinix'],
    steps: [
      ['Diagnoza', 'Oceniamy porowatość i potrzeby włosa.'],
      ['Oczyszczenie', 'Przygotowujemy włos na składniki aktywne.'],
      ['Kuracja', 'Odbudowa, nawilżenie, domknięcie łuski.'],
      ['Wykończenie', 'Lekka stylizacja i plan pielęgnacji w domu.'],
    ],
    faq: [
      ['Jak często robić zabieg pielęgnacyjny?', 'Przy włosach zniszczonych najlepsze efekty daje seria kilku zabiegów w krótszych odstępach, potem wystarczy podtrzymanie co kilka tygodni.'],
      ['Czy pielęgnację można połączyć z koloryzacją?', 'Tak, to częste połączenie — pielęgnacja po koloryzacji pomaga utrzymać kolor i miękkość włosa.'],
      ['Które produkty polecacie do domu?', 'Dobieramy je po diagnozie. Najczęściej wystarczą 2–3 kosmetyki — nie trzeba od razu całej półki.'],
    ],
    prices: [
      { name: 'Pielęgnacja Waterclouds', note: 'ok. 30 min', tiers: { k: 40, s: 50, d: 60, bd: 70 } },
      { name: 'Pielęgnacja Kevin Murphy', tiers: { k: 60 } },
      { name: 'Kuracja Schwarzkopf Fibre Clinix', note: 'dobierana po diagnozie', ask: true },
    ],
  },
  {
    slug: 'stylizacja',
    num: '04',
    name: 'Stylizacja',
    art: 'cat-stylizacja',
    photo: null,
    lead: 'Modelowanie na wyjście, fale, objętość oraz trwała ondulacja — klasyczna i spiralna. Fryzura, która wytrzyma cały wieczór.',
    intro: 'Stylizacja to wykończenie, które zmienia wszystko. Wygładzone modelowanie, miękkie fale czy sprężysty skręt — pracujemy na produktach, które dają efekt bez sklejania i obciążania włosa.',
    includes: ['Modelowanie z dodatkową stylizacją', 'Fale i objętość na wyjście', 'Trwała ondulacja klasyczna', 'Trwała ondulacja spiralna'],
    steps: [
      ['Plan', 'Ustalamy efekt i okazję.'],
      ['Przygotowanie', 'Termoochrona i produkty bazowe.'],
      ['Stylizacja', 'Modelowanie, fale lub skręt.'],
      ['Utrwalenie', 'Lekkie utrwalenie, które się nie klei.'],
    ],
    faq: [
      ['Ile wytrzymuje trwała ondulacja?', 'Zwykle kilka miesięcy — zależnie od struktury włosa, długości i pielęgnacji w domu. Podpowiemy, jak przedłużyć efekt.'],
      ['Czy robicie fryzury okolicznościowe?', 'Tak — modelowanie i stylizację na wyjście. Przy większych okazjach warto zarezerwować termin z wyprzedzeniem.'],
      ['Czy trwała niszczy włosy?', 'Współczesne preparaty są znacznie łagodniejsze niż kiedyś. Przed zabiegiem oceniamy kondycję włosa i dobieramy pielęgnację.'],
    ],
    prices: [
      { name: 'Modelowanie z dodatkową stylizacją', tiers: { k: 145, bd: 235 } },
      { name: 'Trwała ondulacja klasyczna + modelowanie', from: 210, fixed: true },
      { name: 'Trwała ondulacja spiralna + modelowanie', from: 270, fixed: true },
    ],
  },
];

export const tierLabels = { k: 'krótkie', s: 'średnie', d: 'długie', bd: 'b. długie' };

export const process = [
  ['Kawa i rozmowa', 'Zaczynamy spokojnie. Opowiadasz, czego szukasz — my słuchamy i dopytujemy.'],
  ['Diagnoza', 'Oceniamy kondycję i strukturę włosa, żeby dobrać technikę i produkty.'],
  ['Zabieg', 'Pracujemy na Schwarzkopf, Kevin Murphy, Waterclouds i Natulique.'],
  ['Efekt na co dzień', 'Pokazujemy, jak utrzymać fryzurę w domu i co warto stosować.'],
];

// Paleta odcieni wykorzystywana w grafikach (zastępowalna prawdziwymi zdjęciami: pole `photo`).
export const tones = [
  { slug: 'karmel', name: 'Karmelowy balayage', cat: 'balayage', colors: ['#2e2019', '#8a5a36', '#c98f5a', '#efc58f'], bg: '#efe6db' },
  { slug: 'blond', name: 'Chłodny blond', cat: 'koloryzacja', colors: ['#5e5a52', '#a59d8c', '#d9cfbc', '#f6f1e6'], bg: '#e9e4dc' },
  { slug: 'miedz', name: 'Miedziany rudy', cat: 'koloryzacja', colors: ['#3a170d', '#86391f', '#c4643a', '#eea877'], bg: '#f0e5dc' },
  { slug: 'braz', name: 'Czekoladowy brąz', cat: 'koloryzacja', colors: ['#130c09', '#3b2519', '#6e4a33', '#a77b5a'], bg: '#e3d9cd' },
  { slug: 'bez', name: 'Popielaty beż', cat: 'balayage', colors: ['#47423d', '#7f776e', '#b7ada0', '#e6ddd0'], bg: '#ece6de' },
  { slug: 'espresso', name: 'Espresso', cat: 'strzyzenie', colors: ['#0b0908', '#221c18', '#463b34', '#7c6b5e'], bg: '#d9cfc3' },
  { slug: 'roz', name: 'Różowe złoto', cat: 'koloryzacja', colors: ['#53302b', '#9c625a', '#d39c8c', '#f3d1c3'], bg: '#f1e6e0' },
  { slug: 'platyna', name: 'Platyna', cat: 'dekoloryzacja', colors: ['#77756f', '#b3b0a8', '#dcd9d1', '#fbfaf6'], bg: '#e4e1db' },
  { slug: 'miod', name: 'Miodowy blond', cat: 'balayage', colors: ['#3e2a17', '#9a6a37', '#d8a764', '#f5dca8'], bg: '#efe7da' },
  { slug: 'fale', name: 'Miękkie fale', cat: 'stylizacja', colors: ['#2a1d16', '#5d4031', '#977058', '#d3b59b'], bg: '#ebe2d8' },
  { slug: 'ondulacja', name: 'Spiralna ondulacja', cat: 'stylizacja', colors: ['#1d1512', '#4b362b', '#866553', '#c5a690'], bg: '#e7ddd2', curl: true },
  { slug: 'grafit', name: 'Grafitowy bob', cat: 'strzyzenie', colors: ['#141414', '#353433', '#5f5c59', '#9b9690'], bg: '#e2ded8' },
];

export const galleryCats = [
  { key: 'all', label: 'Wszystko' },
  { key: 'balayage', label: 'Balayage' },
  { key: 'koloryzacja', label: 'Koloryzacja' },
  { key: 'dekoloryzacja', label: 'Dekoloryzacja' },
  { key: 'strzyzenie', label: 'Strzyżenie' },
  { key: 'stylizacja', label: 'Stylizacja' },
];

// Prawdziwe opinie klientów (np. z Booksy) — sekcja pojawi się automatycznie, gdy tablica nie będzie pusta.
// Przykład: { text: '…', author: 'Imię', source: 'Booksy' }
export const testimonials = [];
