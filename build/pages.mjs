import { site, team, services, tierLabels, process as visit, tones, galleryCats, testimonials } from './data.mjs';
import { esc, zl, roll, btn, label, media, arrow, arrowUpRight, star, asterisk, hoursRows } from './layout.mjs';

// ---------- helpers ----------

function minPrice(p) {
  if (p.from) return p.from;
  if (p.tiers) return Math.min(...Object.values(p.tiers));
  return null;
}
function catFrom(s) {
  return Math.min(...s.prices.map(minPrice).filter(Boolean));
}
function priceMain(p) {
  if (p.ask) return 'w salonie';
  if (p.fixed) return zl(p.from);
  const t = p.tiers ? Object.keys(p.tiers) : [];
  if (t.length === 1 && t[0] !== 'k') return zl(p.tiers[t[0]]);
  return `od ${zl(minPrice(p))}`;
}
function priceTiers(p) {
  if (!p.tiers) return '';
  const t = Object.entries(p.tiers);
  if (t.length === 1 && t[0][0] === 'k') return `<span class="tier"><span>${tierLabels.k}</span>${zl(t[0][1])}</span>`;
  return t.map(([k, v]) => `<span class="tier"><span>${tierLabels[k]}</span>${zl(v)}</span>`).join('');
}
function priceRow(p) {
  return `<li class="price-row" data-reveal-row>
    <div class="price-row__name"><span>${esc(p.name)}</span>${p.note ? `<small>${esc(p.note)}</small>` : ''}</div>
    <div class="price-row__tiers">${priceTiers(p)}</div>
    <div class="price-row__price">${priceMain(p)}</div>
  </li>`;
}

function pageHero({ num, eyebrow, title, lead, crumbs = '', aside = '' }) {
  return `<section class="phero" data-theme-section="light">
  <div class="wrap">
    <div class="phero__top">${crumbs || label(num, eyebrow)}</div>
    <h1 class="phero__title" data-split="chars-lines">${title}</h1>
    <div class="phero__bottom">
      ${lead ? `<p class="lead phero__lead" data-split="lines">${lead}</p>` : ''}
      ${aside}
    </div>
  </div>
</section>`;
}

function marquee(items, cls = '') {
  const row = items.map((t) => `<span class="marquee__item">${t}</span><span class="marquee__sep">${asterisk}</span>`).join('');
  return `<div class="marquee ${cls}" data-marquee aria-hidden="true"><div class="marquee__track"><div class="marquee__row">${row}</div><div class="marquee__row">${row}</div></div></div>`;
}

function teamSection(R, { num = '06', heading = 'Ludzie <em>studia</em>' } = {}) {
  const cards = team
    .map(
      (p, i) => `<article class="person" data-reveal-card>
      <div class="person__media" data-cursor="${esc(p.name.split(' ')[0])}">
        ${media(R, { art: p.art, photo: p.photo, alt: p.photo ? p.name : '', ratio: '4/5', parallax: 0.08 })}
        ${p.photo ? '' : `<span class="person__initials" aria-hidden="true">${p.initials}</span>`}
      </div>
      <div class="person__body">
        <p class="person__role">${String(i + 1).padStart(2, '0')} — ${esc(p.role)}</p>
        <h3 class="person__name">${esc(p.name)}</h3>
        <p class="person__bio">${esc(p.bio)}</p>
      </div>
    </article>`
    )
    .join('');
  return `<section class="sec team" data-theme-section="light">
  <div class="wrap">
    <header class="sec__head sec__head--split">
      ${label(num, 'Zespół')}
      <h2 class="h2" data-split="lines">${heading}</h2>
      <p class="sec__aside" data-split="lines">Mały zespół, dużo uważności. U nas nie trafisz „do kogoś wolnego” — trafisz do osoby, która pamięta Twoje włosy.</p>
    </header>
    <div class="team__grid">${cards}</div>
  </div>
</section>`;
}

function processSection({ num = '03', dark = true } = {}) {
  const steps = visit
    .map(
      ([t, d], i) => `<li class="step" data-reveal-card>
      <span class="step__num">0${i + 1}</span>
      <h3 class="step__title">${t}</h3>
      <p class="step__text">${d}</p>
    </li>`
    )
    .join('');
  return `<section class="sec process ${dark ? 'is-dark' : ''}" data-theme-section="${dark ? 'dark' : 'light'}">
  <div class="wrap">
    <header class="sec__head sec__head--split">
      ${label(num, 'Wizyta')}
      <h2 class="h2" data-split="lines">Jak wygląda <em>wizyta</em></h2>
      <p class="sec__aside" data-split="lines">Bez pośpiechu i bez niespodzianek. Zawsze wiesz, co robimy i dlaczego.</p>
    </header>
    <div class="process__line" aria-hidden="true"><i data-line></i></div>
    <ol class="process__steps">${steps}</ol>
  </div>
</section>`;
}

function ratingSection(R, num = '07') {
  const quotes = testimonials.length
    ? `<div class="quotes" data-quotes>${testimonials
        .map((q) => `<blockquote class="quote"><p>„${esc(q.text)}”</p><footer>— ${esc(q.author)}${q.source ? `, ${esc(q.source)}` : ''}</footer></blockquote>`)
        .join('')}</div>`
    : '';
  return `<section class="sec rating" data-theme-section="light">
  <div class="wrap">
    <div class="rating__grid">
      <div class="rating__score">
        ${label(num, 'Opinie')}
        <p class="rating__num"><span data-count="5" data-decimals="1">5,0</span></p>
        <p class="rating__stars" aria-label="Ocena 5 na 5">${star.repeat(5)}</p>
      </div>
      <div class="rating__body">
        <h2 class="h3" data-split="lines">Średnia ocen klientów na Booksy. Opinie mogą wystawiać wyłącznie osoby, które naprawdę były u nas na wizycie.</h2>
        <ul class="awards">
          ${site.awards
            .slice(1)
            .map((a) => `<li class="award" data-reveal-row><span class="award__title">${a.title}</span><span class="award__label">${a.label}</span></li>`)
            .join('')}
        </ul>
        ${btn({ href: site.booksy, label: 'Przeczytaj opinie', cls: 'btn--line', external: true, icon: arrowUpRight })}
      </div>
    </div>
    ${quotes}
  </div>
</section>`;
}

// ---------- strony ----------

function home(R) {
  const svcRows = services
    .map(
      (s) => `<li class="svc-row" data-preview="${s.slug}">
      <a href="${R}uslugi/${s.slug}.html" class="svc-row__link" data-cursor="Zobacz">
        <span class="svc-row__num">${s.num}</span>
        <span class="svc-row__name">${roll(s.name, 'roll--serif')}</span>
        <span class="svc-row__lead">${esc(s.lead)}</span>
        <span class="svc-row__price">od ${zl(catFrom(s))}</span>
        <span class="svc-row__arrow">${arrow}</span>
      </a>
      <div class="svc-row__thumb">${media(R, { art: s.art, photo: s.photo, ratio: '16/10', parallax: 0, reveal: false })}</div>
    </li>`
    )
    .join('');
  const previews = services
    .map((s) => `<div class="hover-preview__item" data-preview-item="${s.slug}"><img src="${s.photo ? R + s.photo : `${R}assets/img/art/${s.art}.svg`}" alt="" loading="lazy"></div>`)
    .join('');

  const toneCards = tones
    .slice(0, 8)
    .map(
      (t, i) => `<a class="tone" href="${R}galeria.html" data-cursor="Galeria">
      ${media(R, { art: `tone-${t.slug}`, photo: t.photo, ratio: '3/4', parallax: 0, reveal: false })}
      <span class="tone__meta"><span class="tone__num">${String(i + 1).padStart(2, '0')}</span><span class="tone__name">${t.name}</span></span>
    </a>`
    )
    .join('');

  const brands = site.brands
    .map(
      (b, i) => `<li class="brand" data-reveal-row>
      <span class="brand__num">0${i + 1}</span>
      <span class="brand__name">${b.name}</span>
      <span class="brand__origin">${b.origin}</span>
      <span class="brand__text">${b.text}</span>
    </li>`
    )
    .join('');

  return `
<section class="hero" data-theme-section="light">
  <canvas class="hero__canvas" data-strands aria-hidden="true"></canvas>
  <div class="wrap hero__wrap">
    <div class="hero__top">
      <p class="label" data-hero-fade><span class="label__num">(Studio Fryzur)</span><span>Warszawa — Ursynów</span></p>
      <p class="label hero__est" data-hero-fade><span>Od ${site.since}</span></p>
    </div>
    <h1 class="hero__title" data-hero-title>
      <span class="hero__line"><span class="hero__word">Włosy</span></span>
      <span class="hero__line hero__line--2"><em class="hero__word">szyte</em> <span class="hero__word">na miarę</span></span>
    </h1>
    <div class="hero__bottom">
      <p class="lead hero__lead" data-hero-fade>Strzyżenie, koloryzacja, balayage i pielęgnacja w kameralnym studiu przy Alei KEN. Bez pośpiechu — z kubkiem dobrej kawy w ręku.</p>
      <div class="hero__ctas" data-hero-fade>
        ${btn({ href: site.booksy, label: 'Umów wizytę', cls: 'btn--ink', external: true, cursor: 'Booksy', icon: arrowUpRight })}
        ${btn({ href: `${R}cennik.html`, label: 'Zobacz cennik', cls: 'btn--line' })}
      </div>
      <div class="hero__info" data-hero-fade>
        <p><span class="status status--inline" data-status><i></i><span data-status-text>Pn–Pt 10–21, Sb 9–18</span></span></p>
        <p class="hero__rating">${star}<strong>5,0</strong> na Booksy</p>
      </div>
    </div>
  </div>
</section>

${marquee(['Strzyżenie', '<em>Koloryzacja</em>', 'Balayage', '<em>Dekoloryzacja</em>', 'Pielęgnacja', '<em>Stylizacja</em>', 'Ondulacja'])}

<section class="sec intro" data-theme-section="light">
  <div class="wrap">
    <div class="intro__grid">
      ${label('01', 'Studio')}
      <p class="intro__text" data-highlight>Nie robimy fryzur z katalogu. Najpierw rozmawiamy, potem doradzamy, a dopiero na końcu sięgamy po nożyczki. Każda wizyta to czas tylko dla Ciebie — spokojna atmosfera, dobra kawa i efekt, który łatwo utrzymasz w domu.</p>
    </div>
    <div class="intro__media">
      ${media(R, { art: 'studio-1', ratio: '4/5', cls: 'intro__m1', parallax: 0.1 })}
      <div class="intro__side">
        ${media(R, { art: 'studio-2', ratio: '1/1', cls: 'intro__m2', parallax: 0.18 })}
        <p class="intro__note" data-split="lines">Działamy przy Alei KEN 98 na Ursynowie od ${site.since} roku. Pracujemy na produktach Schwarzkopf Professional, Kevin Murphy, Waterclouds i Natulique.</p>
        ${btn({ href: `${R}o-nas.html`, label: 'Poznaj studio', cls: 'btn--line' })}
      </div>
    </div>
    <ul class="stats">
      <li class="stat" data-reveal-card><span class="stat__num" data-count="${site.since}">${site.since}</span><span class="stat__label">rok otwarcia studia</span></li>
      <li class="stat" data-reveal-card><span class="stat__num" data-count="5" data-decimals="1">5,0</span><span class="stat__label">średnia ocen na Booksy</span></li>
      <li class="stat" data-reveal-card><span class="stat__num" data-count="4">4</span><span class="stat__label">marki profesjonalnej pielęgnacji</span></li>
      <li class="stat" data-reveal-card><span class="stat__num" data-count="6">6</span><span class="stat__label">dni w tygodniu otwarte</span></li>
    </ul>
  </div>
</section>

<section class="sec services" data-theme-section="light">
  <div class="wrap">
    <header class="sec__head sec__head--split">
      ${label('02', 'Usługi')}
      <h2 class="h2" data-split="lines">Co dla Ciebie <em>zrobimy</em></h2>
      <p class="sec__aside" data-split="lines">Cztery obszary, jedna zasada: najpierw diagnoza, potem zabieg. Kliknij, aby zobaczyć szczegóły i ceny.</p>
    </header>
    <ul class="svc-list" data-svc-list>${svcRows}</ul>
    <div class="hover-preview" data-hover-preview aria-hidden="true">${previews}</div>
    <div class="services__more">${btn({ href: `${R}uslugi.html`, label: 'Wszystkie usługi', cls: 'btn--line' })}</div>
  </div>
</section>

${processSection({ num: '03' })}

<section class="hscroll" data-hscroll data-theme-section="light">
  <div class="hscroll__pin">
    <div class="wrap sec__head sec__head--split hscroll__head">
      ${label('04', 'Paleta')}
      <h2 class="h2" data-split="lines">Odcienie, które <em>kochamy</em></h2>
      <p class="sec__aside">Każdy kolor dobieramy indywidualnie — do karnacji, oczu i Twojego stylu. Przewiń, żeby zobaczyć kilka inspiracji.</p>
    </div>
    <div class="hscroll__track" data-hscroll-track>
      ${toneCards}
      <a class="tone tone--more" href="${R}galeria.html" data-cursor="Galeria"><span class="tone__more-txt">Cała<br><em>galeria</em></span><span class="tone__more-ico">${arrow}</span></a>
    </div>
    <div class="wrap hscroll__progress" aria-hidden="true"><i data-hscroll-progress></i></div>
  </div>
</section>

<section class="sec brands" data-theme-section="light">
  <div class="wrap">
    <header class="sec__head sec__head--split">
      ${label('05', 'Produkty')}
      <h2 class="h2" data-split="lines">Pracujemy na <em>sprawdzonych</em> markach</h2>
      <p class="sec__aside" data-split="lines">Dobre efekty zaczynają się od dobrych produktów. Wybraliśmy marki, którym ufamy i które znamy od podszewki.</p>
    </header>
    <ul class="brand-list">${brands}</ul>
  </div>
</section>

${teamSection(R, { num: '06' })}

${ratingSection(R, '07')}
`;
}

function about(R) {
  const values = [
    ['Rozmowa przed cięciem', 'Każda wizyta zaczyna się od konsultacji. Pytamy o codzienność, nawyki i oczekiwania — dopiero potem proponujemy rozwiązanie.'],
    ['Produkty, którym ufamy', 'Schwarzkopf Professional, Kevin Murphy, Waterclouds i Natulique. Znamy je dobrze i wiemy, jak działają na różnych typach włosów.'],
    ['Ciągły rozwój', 'Regularnie bierzemy udział w szkoleniach i prezentacjach renomowanych firm, żeby pracować aktualnymi technikami.'],
    ['Czas tylko dla Ciebie', 'Kameralne studio, spokojne tempo i kubek dobrej kawy. Wizyta u fryzjera ma być przyjemnością, nie obowiązkiem.'],
  ];
  return `
${pageHero({ num: 'O studiu', eyebrow: 'Ursynów, od 2016', title: 'Spokój, kawa<br>i <em>dobre</em> nożyczki', lead: `Od ${site.since} roku tworzymy przy Alei KEN miejsce, do którego wraca się nie tylko po fryzurę.` })}

<section class="wide-media" data-theme-section="light">
  <div class="wrap">${media(R, { art: 'studio-wide', ratio: '21/9', cls: 'media--wide', parallax: 0.15, eager: true })}</div>
</section>

<section class="sec story" data-theme-section="light">
  <div class="wrap story__grid">
    ${label('01', 'Historia')}
    <div class="story__text">
      <p class="h3" data-split="lines">Studio Fryzur Aneta Kunc działa na warszawskim Ursynowie od ${site.since} roku. Od początku stawiamy na kameralną atmosferę i spokojną pracę.</p>
      <div class="story__cols">
        <p data-split="lines">Wierzymy, że dobra fryzura zaczyna się od rozmowy. Dlatego każdą wizytę zaczynamy od konsultacji, a kończymy wskazówkami, jak utrzymać efekt w domu — bez skomplikowanych rytuałów i półki pełnej kosmetyków.</p>
        <p data-split="lines">Nasi styliści stale podnoszą kwalifikacje na szkoleniach i prezentacjach renomowanych firm. W pracy sięgamy wyłącznie po sprawdzone produkty dostępne na polskim rynku: Schwarzkopf Professional, Kevin Murphy, Waterclouds i Natulique.</p>
      </div>
    </div>
  </div>
</section>

${marquee(['Rozmowa', '<em>Diagnoza</em>', 'Precyzja', '<em>Pielęgnacja</em>', 'Spokój', '<em>Kawa</em>'], 'marquee--sand')}

<section class="sec values" data-theme-section="light">
  <div class="wrap values__grid">
    <div class="values__sticky">
      ${label('02', 'Wartości')}
      <h2 class="h2" data-split="lines">Na czym nam <em>zależy</em></h2>
      ${media(R, { art: 'studio-3', ratio: '4/5', cls: 'values__media', parallax: 0.1 })}
    </div>
    <ol class="values__list">
      ${values
        .map(
          ([t, d], i) => `<li class="value" data-reveal-card><span class="value__num">0${i + 1}</span><h3 class="value__title">${t}</h3><p class="value__text">${d}</p></li>`
        )
        .join('')}
    </ol>
  </div>
</section>

${teamSection(R, { num: '03', heading: 'Poznaj <em>nas</em>' })}

<section class="sec awards-sec is-dark" data-theme-section="dark">
  <div class="wrap">
    <header class="sec__head sec__head--split">
      ${label('04', 'Wyróżnienia')}
      <h2 class="h2" data-split="lines">Zaufanie <em>klientów</em></h2>
      <p class="sec__aside" data-split="lines">Najcenniejsze są dla nas powroty klientów. Cieszą nas też wyróżnienia, które z nich wynikają.</p>
    </header>
    <ul class="awards-big">
      ${site.awards
        .map((a, i) => `<li class="award-big" data-reveal-card><span class="award-big__num">0${i + 1}</span><span class="award-big__title">${a.title}</span><span class="award-big__label">${a.label}</span></li>`)
        .join('')}
    </ul>
  </div>
</section>
`;
}

function servicesPage(R) {
  const cards = services
    .map(
      (s, i) => `<article class="stack-card stack-card--${i}" data-stack-card>
      <div class="stack-card__inner">
        <div class="stack-card__body">
          <p class="stack-card__num">${s.num} / 0${services.length}</p>
          <h2 class="stack-card__title">${s.name}</h2>
          <p class="stack-card__lead">${esc(s.lead)}</p>
          <ul class="stack-card__list">${s.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="stack-card__foot">
            <p class="stack-card__price"><small>Ceny</small>od ${zl(catFrom(s))}</p>
            ${btn({ href: `${R}uslugi/${s.slug}.html`, label: 'Szczegóły', cls: i === 2 ? 'btn--light' : 'btn--ink' })}
          </div>
        </div>
        <a class="stack-card__media" href="${R}uslugi/${s.slug}.html" data-cursor="Zobacz" tabindex="-1" aria-hidden="true">${media(R, { art: s.art, photo: s.photo, ratio: '4/5', parallax: 0, reveal: false })}</a>
      </div>
    </article>`
    )
    .join('');
  return `
${pageHero({ num: 'Usługi', eyebrow: '04 kategorie', title: 'Usługi <em>fryzjerskie</em>', lead: 'Strzyżenie, koloryzacja, pielęgnacja i stylizacja. Każdą usługę poprzedzamy krótką konsultacją — żeby efekt był dokładnie taki, jak chcesz.', aside: `<div class="phero__aside">${btn({ href: `${R}cennik.html`, label: 'Pełny cennik', cls: 'btn--line' })}</div>` })}

<section class="stack" data-stack data-theme-section="light">
  <div class="wrap">${cards}</div>
</section>

${processSection({ num: '05' })}
`;
}

function serviceDetail(R, s, idx) {
  const next = services[(idx + 1) % services.length];
  return `
<section class="phero phero--service" data-theme-section="light">
  <div class="wrap">
    <div class="phero__top"><nav class="crumbs" aria-label="Okruszki"><a href="${R}index.html" class="ulink">Start</a><span>/</span><a href="${R}uslugi.html" class="ulink">Usługi</a><span>/</span><span aria-current="page">${s.name}</span></nav></div>
    <div class="svc-hero">
      <div class="svc-hero__text">
        <p class="svc-hero__num">${s.num}</p>
        <h1 class="phero__title" data-split="chars-lines">${s.name}</h1>
        <p class="lead" data-split="lines">${esc(s.lead)}</p>
        <div class="svc-hero__ctas">
          ${btn({ href: site.booksy, label: 'Zarezerwuj', cls: 'btn--ink', external: true, cursor: 'Booksy', icon: arrowUpRight })}
          <p class="svc-hero__price"><small>Ceny</small>od ${zl(catFrom(s))}</p>
        </div>
      </div>
      ${media(R, { art: s.art, photo: s.photo, ratio: '4/5', cls: 'svc-hero__media', parallax: 0.12, eager: true })}
    </div>
  </div>
</section>

<section class="sec svc-intro" data-theme-section="light">
  <div class="wrap svc-intro__grid">
    ${label('01', 'O usłudze')}
    <p class="h3" data-split="lines">${esc(s.intro)}</p>
    <ul class="checklist">${s.includes.map((x, i) => `<li data-reveal-row><span>0${i + 1}</span>${esc(x)}</li>`).join('')}</ul>
  </div>
</section>

<section class="sec process process--compact is-dark" data-theme-section="dark">
  <div class="wrap">
    <header class="sec__head sec__head--split">
      ${label('02', 'Przebieg')}
      <h2 class="h2" data-split="lines">Krok po <em>kroku</em></h2>
    </header>
    <div class="process__line" aria-hidden="true"><i data-line></i></div>
    <ol class="process__steps">
      ${s.steps.map(([t, d], i) => `<li class="step" data-reveal-card><span class="step__num">0${i + 1}</span><h3 class="step__title">${t}</h3><p class="step__text">${d}</p></li>`).join('')}
    </ol>
  </div>
</section>

<section class="sec svc-prices" data-theme-section="light">
  <div class="wrap">
    <header class="sec__head sec__head--split">
      ${label('03', 'Cennik')}
      <h2 class="h2" data-split="lines">Ile to <em>kosztuje</em></h2>
      <p class="sec__aside">Cena zależy od długości i gęstości włosów. Ostateczną wycenę potwierdzamy podczas konsultacji.</p>
    </header>
    <ul class="price-list">${s.prices.map(priceRow).join('')}</ul>
    <div class="svc-prices__more">${btn({ href: `${R}cennik.html#${s.slug}`, label: 'Pełny cennik', cls: 'btn--line' })}</div>
  </div>
</section>

<section class="sec faq" data-theme-section="light">
  <div class="wrap faq__grid">
    <div>
      ${label('04', 'Pytania')}
      <h2 class="h2" data-split="lines">Częste <em>pytania</em></h2>
    </div>
    <div class="acc" data-acc>
      ${s.faq
        .map(
          ([q, a], i) => `<div class="acc__item">
        <h3 class="acc__h"><button class="acc__btn" type="button" aria-expanded="false" aria-controls="faq-${s.slug}-${i}" id="faq-${s.slug}-${i}-btn"><span>${esc(q)}</span><i aria-hidden="true"></i></button></h3>
        <div class="acc__panel" id="faq-${s.slug}-${i}" role="region" aria-labelledby="faq-${s.slug}-${i}-btn" hidden><div class="acc__content"><p>${esc(a)}</p></div></div>
      </div>`
        )
        .join('')}
    </div>
  </div>
</section>

<section class="next" data-theme-section="light">
  <a class="next__link wrap" href="${R}uslugi/${next.slug}.html" data-cursor="Dalej">
    <span class="label"><span class="label__num">(Następna usługa)</span><span>${next.num}</span></span>
    <span class="next__title">${roll(next.name, 'roll--serif')}${arrow}</span>
  </a>
</section>
`;
}

function pricesPage(R) {
  const tabs = services.map((s) => `<a href="#${s.slug}" class="tab" data-tab="${s.slug}">${s.name}</a>`).join('');
  const sections = services
    .map(
      (s) => `<section class="price-cat" id="${s.slug}" data-price-cat>
      <header class="price-cat__head">
        <span class="price-cat__num">${s.num}</span>
        <h2 class="price-cat__title">${s.name}</h2>
        <a href="${R}uslugi/${s.slug}.html" class="ulink price-cat__link">O usłudze</a>
      </header>
      <ul class="price-list">${s.prices.map(priceRow).join('')}</ul>
    </section>`
    )
    .join('');
  return `
${pageHero({ num: 'Cennik', eyebrow: 'Aktualne ceny', title: '<em>Cennik</em> usług', lead: 'Ceny zależą od długości i gęstości włosów. Poniżej znajdziesz orientacyjne kwoty — ostateczną wycenę potwierdzamy podczas konsultacji.' })}

<section class="prices" data-theme-section="light">
  <div class="tabs-bar" data-tabs><div class="wrap"><nav class="tabs" aria-label="Kategorie cennika">${tabs}<span class="tabs__ind" data-tabs-ind></span></nav></div></div>
  <div class="wrap prices__wrap">
    <aside class="prices__legend">
      <p class="label"><span class="label__num">(Długość)</span></p>
      <ul>
        <li><b>krótkie</b> — do linii brody</li>
        <li><b>średnie</b> — do ramion</li>
        <li><b>długie</b> — do łopatek</li>
        <li><b>b. długie</b> — poniżej łopatek</li>
      </ul>
    </aside>
    <div class="prices__list">${sections}</div>
  </div>
  <div class="wrap">
    <div class="note-card">
      <p class="h3">Nie wiesz, którą usługę wybrać? <em>Zadzwoń</em> — doradzimy.</p>
      <div class="note-card__ctas">
        ${btn({ href: site.phoneHref, label: site.phone, cls: 'btn--ink', icon: arrowUpRight })}
        ${btn({ href: site.booksy, label: 'Rezerwacja online', cls: 'btn--line', external: true, icon: arrowUpRight })}
      </div>
    </div>
  </div>
</section>
`;
}

function galleryPage(R) {
  const filters = galleryCats
    .map((c, i) => `<button type="button" class="chip${i === 0 ? ' is-active' : ''}" data-filter="${c.key}" aria-pressed="${i === 0}">${c.label}<sup>${c.key === 'all' ? tones.length : tones.filter((t) => t.cat === c.key).length}</sup></button>`)
    .join('');
  const items = tones
    .map(
      (t, i) => `<li class="g-item g-item--${i % 5}" data-cat="${t.cat}">
      <button type="button" class="g-item__btn" data-lightbox="${i}" data-cursor="Powiększ" aria-label="Powiększ: ${t.name}">
        ${media(R, { art: `tone-${t.slug}`, photo: t.photo, ratio: i % 5 === 1 || i % 5 === 3 ? '4/5' : '3/4', parallax: 0, reveal: true })}
      </button>
      <p class="g-item__cap"><span>${String(i + 1).padStart(2, '0')}</span>${t.name}<em>${galleryCats.find((c) => c.key === t.cat).label}</em></p>
    </li>`
    )
    .join('');
  const lbData = JSON.stringify(tones.map((t) => ({ src: t.photo ? R + t.photo : `${R}assets/img/art/tone-${t.slug}.svg`, title: t.name, cat: galleryCats.find((c) => c.key === t.cat).label })));
  return `
${pageHero({ num: 'Galeria', eyebrow: 'Metamorfozy i inspiracje', title: 'Galeria <em>odcieni</em>', lead: 'Kolory i formy, w których czujemy się najlepiej. Więcej aktualnych metamorfoz znajdziesz na naszym Facebooku.', aside: `<div class="phero__aside">${btn({ href: site.facebook, label: 'Facebook', cls: 'btn--line', external: true, icon: arrowUpRight })}</div>` })}

<section class="gallery" data-theme-section="light">
  <div class="wrap">
    <div class="chips" role="group" aria-label="Filtruj galerię" data-filters>${filters}</div>
    <ul class="g-grid" data-grid>${items}</ul>
  </div>
</section>

<div class="lightbox" data-lb hidden role="dialog" aria-modal="true" aria-label="Podgląd zdjęcia">
  <div class="lightbox__bg" data-lb-close></div>
  <figure class="lightbox__fig"><img alt="" data-lb-img><figcaption><span data-lb-count></span><span data-lb-title></span><em data-lb-cat></em></figcaption></figure>
  <button type="button" class="lightbox__btn lightbox__btn--prev" data-lb-prev aria-label="Poprzednie">${arrow}</button>
  <button type="button" class="lightbox__btn lightbox__btn--next" data-lb-next aria-label="Następne">${arrow}</button>
  <button type="button" class="lightbox__close" data-lb-close aria-label="Zamknij">Zamknij <i></i></button>
</div>
<script type="application/json" id="lb-data">${lbData}</script>
`;
}

function contactPage(R) {
  return `
<section class="phero phero--contact" data-theme-section="light">
  <div class="wrap">
    <div class="phero__top">${label('Kontakt', 'Zapraszamy')}</div>
    <h1 class="phero__title" data-split="chars-lines">Wpadnij <em>na kawę</em></h1>
    <div class="contact-big">
      <a href="${site.phoneHref}" class="contact-big__item" data-cursor="Zadzwoń"><small>Telefon</small>${roll(site.phone, 'roll--serif')}</a>
      <div class="contact-big__item">
        <small>E-mail</small>
        <span class="contact-big__mail"><a href="mailto:${site.email}" data-cursor="Napisz">${roll(site.email, 'roll--serif')}</a><button type="button" class="copy" data-copy="${site.email}" aria-label="Skopiuj adres e-mail"><span data-copy-txt>Kopiuj</span></button></span>
      </div>
    </div>
  </div>
</section>

<section class="sec contact" data-theme-section="light">
  <div class="wrap contact__grid">
    <div class="contact__info">
      <div class="info-block" data-reveal-card>
        ${label('01', 'Adres')}
        <p class="info-block__big">${site.street}<br>${site.postal} ${site.city}</p>
        <p class="muted">${site.district} — lokal usługowy U11</p>
        <p><a href="${site.maps}" target="_blank" rel="noopener" class="ulink">Prowadź w Google Maps ↗</a></p>
      </div>
      <div class="info-block" data-reveal-card>
        ${label('02', 'Godziny otwarcia')}
        <p class="status status--inline status--big" data-status><i></i><span data-status-text>Pn–Pt 10–21, Sb 9–18</span></p>
        <ul class="hours hours--full" data-hours>${hoursRows(false)}</ul>
      </div>
      <div class="info-block" data-reveal-card>
        ${label('03', 'Rezerwacja online')}
        <p>Najszybciej zarezerwujesz termin przez Booksy — widzisz wolne godziny i dostajesz przypomnienie SMS.</p>
        ${btn({ href: site.booksy, label: 'Rezerwuj na Booksy', cls: 'btn--ink', external: true, cursor: 'Booksy', icon: arrowUpRight })}
      </div>
    </div>

    <form class="form" data-form novalidate data-email="${site.email}">
      ${label('04', 'Napisz do nas')}
      <h2 class="h3">Masz pytanie o usługę lub termin? <em>Odpowiemy</em> najszybciej, jak to możliwe.</h2>
      <div class="form__row">
        <div class="field"><input id="f-name" name="name" type="text" autocomplete="name" required placeholder=" "><label for="f-name">Imię *</label><span class="field__err" aria-live="polite"></span></div>
        <div class="field"><input id="f-phone" name="phone" type="tel" autocomplete="tel" placeholder=" " pattern="[0-9 +()-]{9,}"><label for="f-phone">Telefon</label><span class="field__err" aria-live="polite"></span></div>
      </div>
      <div class="field"><input id="f-email" name="email" type="email" autocomplete="email" required placeholder=" "><label for="f-email">E-mail *</label><span class="field__err" aria-live="polite"></span></div>
      <fieldset class="field field--chips">
        <legend>Temat</legend>
        <div class="chips chips--form">
          ${['Strzyżenie', 'Koloryzacja', 'Pielęgnacja', 'Stylizacja', 'Inne'].map((t, i) => `<label class="chip chip--radio"><input type="radio" name="topic" value="${t}"${i === 0 ? ' checked' : ''}><span>${t}</span></label>`).join('')}
        </div>
      </fieldset>
      <div class="field"><textarea id="f-msg" name="message" rows="4" required placeholder=" "></textarea><label for="f-msg">Wiadomość *</label><span class="field__err" aria-live="polite"></span></div>
      <label class="check"><input type="checkbox" name="consent" required><span>Wyrażam zgodę na przetwarzanie moich danych w celu odpowiedzi na wiadomość. Szczegóły w <a href="${R}polityka-prywatnosci.html" class="ulink">polityce prywatności</a>. *</span></label>
      <span class="field__err field__err--consent" aria-live="polite"></span>
      <div class="form__foot">
        <button type="submit" class="btn btn--ink" data-magnetic><span class="btn__label">${roll('Wyślij wiadomość')}</span><span class="btn__icon">${arrow}</span></button>
        <p class="form__hint muted">* pola wymagane</p>
      </div>
      <div class="form__ok" data-form-ok hidden>
        <p class="h3">Dziękujemy! <em>Twoja wiadomość jest gotowa.</em></p>
        <p>Otworzyliśmy ją w Twoim programie pocztowym — wystarczy kliknąć „Wyślij”. Jeśli nic się nie pojawiło, napisz bezpośrednio na <a href="mailto:${site.email}" class="ulink">${site.email}</a> lub zadzwoń: <a href="${site.phoneHref}" class="ulink">${site.phone}</a>.</p>
      </div>
    </form>
  </div>
</section>

<section class="map-sec" data-theme-section="light">
  <div class="wrap">
    <div class="map" data-map data-src="${site.mapsEmbed}">
      <div class="map__consent">
        ${media(R, { art: 'map', ratio: '21/9', parallax: 0, reveal: false, cls: 'map__bg' })}
        <div class="map__box">
          <p class="h3">${site.street}</p>
          <p class="muted">Mapa Google ładuje się dopiero po kliknięciu — dbamy o Twoją prywatność.</p>
          <button type="button" class="btn btn--ink" data-map-load data-magnetic><span class="btn__label">${roll('Pokaż mapę')}</span><span class="btn__icon">${arrow}</span></button>
        </div>
      </div>
    </div>
  </div>
</section>
`;
}

function privacyPage(R) {
  return `
${pageHero({ num: 'Dokumenty', eyebrow: 'RODO', title: 'Polityka <em>prywatności</em>', lead: 'Zasady przetwarzania danych osobowych i wykorzystywania plików cookies w serwisie anetakunc.pl.' })}
<section class="sec legal" data-theme-section="light">
  <div class="wrap legal__grid">
    <nav class="legal__toc" aria-label="Spis treści"><p class="label"><span class="label__num">(Spis)</span></p><ol>
      <li><a href="#p1" class="ulink">Administrator</a></li><li><a href="#p2" class="ulink">Zakres i cele</a></li><li><a href="#p3" class="ulink">Podstawy prawne</a></li><li><a href="#p4" class="ulink">Odbiorcy</a></li><li><a href="#p5" class="ulink">Okres przechowywania</a></li><li><a href="#p6" class="ulink">Twoje prawa</a></li><li><a href="#p7" class="ulink">Cookies i usługi zewnętrzne</a></li>
    </ol></nav>
    <div class="legal__text">
      <h2 id="p1">1. Administrator danych</h2>
      <p>Administratorem danych osobowych jest ${esc(site.name)}, ${site.street}, ${site.postal} ${site.city}. Kontakt w sprawach danych osobowych: <a href="mailto:${site.email}" class="ulink">${site.email}</a>, tel. <a href="${site.phoneHref}" class="ulink">${site.phone}</a>.</p>
      <h2 id="p2">2. Zakres i cele przetwarzania</h2>
      <p>Przetwarzamy dane, które przekazujesz nam dobrowolnie: imię, adres e-mail, numer telefonu oraz treść wiadomości — wyłącznie w celu odpowiedzi na zapytanie, umówienia i obsługi wizyty.</p>
      <p>Rezerwacje online realizowane są za pośrednictwem serwisu Booksy, który działa jako odrębny administrator danych na zasadach opisanych w swojej polityce prywatności.</p>
      <h2 id="p3">3. Podstawy prawne</h2>
      <p>Dane przetwarzamy na podstawie art. 6 ust. 1 lit. a RODO (zgoda), art. 6 ust. 1 lit. b RODO (działania przed zawarciem umowy i jej wykonanie) oraz art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes administratora — kontakt z klientami).</p>
      <h2 id="p4">4. Odbiorcy danych</h2>
      <p>Dane mogą być przekazywane podmiotom wspierającym nas technicznie (np. dostawcy hostingu i poczty e-mail) wyłącznie w zakresie niezbędnym do świadczenia usług. Nie sprzedajemy danych i nie przekazujemy ich w celach marketingowych.</p>
      <h2 id="p5">5. Okres przechowywania</h2>
      <p>Dane przechowujemy przez czas niezbędny do obsługi zapytania, a następnie przez okres wymagany przepisami prawa lub do czasu wycofania zgody.</p>
      <h2 id="p6">6. Twoje prawa</h2>
      <p>Masz prawo dostępu do swoich danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia, wniesienia sprzeciwu oraz cofnięcia zgody w dowolnym momencie. Przysługuje Ci również prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych.</p>
      <h2 id="p7">7. Cookies i usługi zewnętrzne</h2>
      <p>Serwis nie używa plików cookies analitycznych ani marketingowych. W pamięci przeglądarki (sessionStorage) zapisujemy jedynie informację techniczną, czy animacja powitalna została już wyświetlona.</p>
      <p>Mapa Google ładowana jest dopiero po Twoim kliknięciu. Od tego momentu Google może zapisywać własne pliki cookies zgodnie ze swoją polityką prywatności. Linki do Booksy i Facebooka prowadzą do serwisów zewnętrznych.</p>
    </div>
  </div>
</section>
`;
}

function notFound(R) {
  return `
<section class="nf" data-theme-section="light">
  <canvas class="hero__canvas nf__canvas" data-strands aria-hidden="true"></canvas>
  <div class="wrap nf__wrap">
    ${label('404', 'Nie znaleziono')}
    <h1 class="nf__title" data-split="chars-lines">Ups, <em>zgubiony</em> kosmyk</h1>
    <p class="lead">Tej strony nie ma — może zmieniła adres, a może nigdy nie istniała. Wróć na start albo od razu umów wizytę.</p>
    <div class="hero__ctas">
      ${btn({ href: `${R}index.html`, label: 'Strona główna', cls: 'btn--ink' })}
      ${btn({ href: site.booksy, label: 'Umów wizytę', cls: 'btn--line', external: true, icon: arrowUpRight })}
    </div>
  </div>
</section>
`;
}

export function pages() {
  const list = [
    { path: 'index.html', page: 'home', key: 'home', title: 'Start', description: 'Studio Fryzur Aneta Kunc na warszawskim Ursynowie (Al. KEN 98). Strzyżenie, koloryzacja, balayage, dekoloryzacja i pielęgnacja na produktach Schwarzkopf, Kevin Murphy, Waterclouds i Natulique.', render: home },
    { path: 'o-nas.html', page: 'about', key: 'about', title: 'O studiu', description: 'Kameralne studio fryzur na Ursynowie, działające od 2016 roku. Poznaj naszą historię, wartości i zespół.', render: about },
    { path: 'uslugi.html', page: 'services', key: 'services', title: 'Usługi', description: 'Strzyżenie damskie i męskie, koloryzacja, balayage, dekoloryzacja, pielęgnacja Kevin Murphy i Waterclouds, modelowanie i trwała ondulacja.', render: servicesPage },
    { path: 'cennik.html', page: 'prices', key: 'prices', title: 'Cennik', description: 'Cennik usług Studia Fryzur Aneta Kunc: strzyżenie, koloryzacja, balayage, pielęgnacja i stylizacja. Ceny według długości włosów.', render: pricesPage },
    { path: 'galeria.html', page: 'gallery', key: 'gallery', title: 'Galeria', description: 'Galeria odcieni i metamorfoz — balayage, koloryzacja, strzyżenie i stylizacja w Studiu Fryzur Aneta Kunc.', render: galleryPage },
    { path: 'kontakt.html', page: 'contact', key: 'contact', title: 'Kontakt', description: `Al. KEN 98 lok. U11, Warszawa Ursynów. Tel. ${site.phone}. Pn–Pt 10:00–21:00, Sb 9:00–18:00. Rezerwacja online przez Booksy.`, render: contactPage },
    { path: 'polityka-prywatnosci.html', page: 'legal', key: '', title: 'Polityka prywatności', description: 'Polityka prywatności serwisu anetakunc.pl.', render: privacyPage },
    { path: '404.html', page: 'notfound', key: '', title: 'Nie znaleziono strony', description: 'Strona nie istnieje.', render: notFound },
  ];
  services.forEach((s, i) => {
    list.push({
      path: `uslugi/${s.slug}.html`,
      page: 'service',
      key: 'services',
      title: s.name,
      description: `${s.name} w Studiu Fryzur Aneta Kunc, Warszawa Ursynów. ${s.lead}`,
      render: (R) => serviceDetail(R, s, i),
    });
  });
  return list;
}
