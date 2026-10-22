import { site, nav } from './data.mjs';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const zl = (n) => `${n} zł`;

/** Tekst z efektem „roll” (przewijanie przy hover) */
export const roll = (text, cls = '') => `<span class="roll ${cls}"><span class="roll__in" data-text="${esc(text)}">${esc(text)}</span></span>`;

export const arrow = `<svg class="ico-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const arrowUpRight = `<svg class="ico-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const star = `<svg class="ico-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 6 6.5.6-4.9 4.3 1.5 6.4L12 16.8 6.2 20.1l1.5-6.4L2.8 9.4l6.5-.6z" fill="currentColor"/></svg>`;
export const asterisk = `<svg class="ico-ast" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3v34M5.3 11.5l29.4 17M5.3 28.5l29.4-17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`;

/** Przycisk z efektem „roll” tekstu */
export function btn({ href, label, cls = '', external = false, cursor = '', icon = arrow }) {
  const ext = external ? ' target="_blank" rel="noopener"' : '';
  const cur = cursor ? ` data-cursor="${esc(cursor)}"` : '';
  return `<a class="btn ${cls}" href="${href}"${ext}${cur} data-magnetic><span class="btn__label">${roll(label)}</span><span class="btn__icon">${icon}</span></a>`;
}

export function label(num, text) {
  return `<p class="label"><span class="label__num">(${num})</span><span>${text}</span></p>`;
}

/** Obraz: prawdziwe zdjęcie, jeśli podane, w przeciwnym razie grafika z pasmami */
export function media(R, { art, photo, alt = '', ratio = '4/5', cls = '', parallax = 0.12, reveal = true, eager = false, sizes = '' }) {
  const src = photo ? `${R}${photo}` : `${R}assets/img/art/${art}.svg`;
  const load = eager ? 'eager' : 'lazy';
  const p = parallax ? ` data-parallax="${parallax}"` : '';
  const rv = reveal ? ' data-reveal' : '';
  return `<figure class="media ${cls}" style="--ratio:${ratio}"${rv}><div class="media__inner"${p}><img src="${src}" alt="${esc(alt)}" loading="${load}" decoding="async"${sizes ? ` sizes="${sizes}"` : ''}></div></figure>`;
}

function hoursRows(compact = false) {
  // Pn–Pt grupujemy, gdy wszystkie dni mają te same godziny
  if (compact) {
    return `<li><span>Pn – Pt</span><span>10:00 – 21:00</span></li><li><span>Sobota</span><span>9:00 – 18:00</span></li><li><span>Niedziela</span><span>nieczynne</span></li>`;
  }
  return site.hours
    .map((h) => `<li data-day="${h.d}"><span>${h.day}</span><span>${h.open ? `${h.open.replace(/^0/, '')} – ${h.close}` : 'nieczynne'}</span></li>`)
    .join('');
}
export { hoursRows };

function jsonLd() {
  const days = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
  const data = {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    name: site.name,
    url: site.url,
    telephone: site.phone,
    email: site.email,
    image: `${site.url}/assets/img/og.jpg`,
    priceRange: '40–660 zł',
    foundingDate: String(site.since),
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Al. Komisji Edukacji Narodowej 98 lok. U11',
      postalCode: site.postal,
      addressLocality: site.city,
      addressCountry: 'PL',
    },
    openingHoursSpecification: site.hours
      .filter((h) => h.open)
      .map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: days[h.d], opens: h.open, closes: h.close })),
    sameAs: [site.facebook, site.booksy],
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

export function layout({ R, page, title, description, body, key, path, theme = 'light', logoSvg, wordmarkSvg, extraHead = '' }) {
  const fullTitle = page === 'home' ? `${site.name} — fryzjer Ursynów, Warszawa` : `${title} — ${site.name}`;
  const canonical = `${site.url}/${path === 'index.html' ? '' : path}`;
  const navLinks = nav
    .map((n) => {
      const active = n.key === key ? ' aria-current="page"' : '';
      return `<li><a href="${R}${n.href}"${active} class="nav-link">${roll(n.label)}</a></li>`;
    })
    .join('');
  const menuLinks = nav
    .map((n, i) => {
      const active = n.key === key ? ' aria-current="page"' : '';
      return `<li><a href="${R}${n.href}"${active}><span class="menu__num">0${i + 1}</span><span class="menu__txt"><span>${n.label}</span></span></a></li>`;
    })
    .join('');

  return `<!doctype html>
<html lang="pl" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#f2ede6">
<meta property="og:type" content="website">
<meta property="og:locale" content="pl_PL">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.url}/assets/img/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${R}assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${R}assets/img/apple-touch-icon.png">
<link rel="manifest" href="${R}site.webmanifest">
<script>
(function(d,R){var h=d.head||d.getElementsByTagName('head')[0];if(location.protocol==='file:'){/* podgląd z dysku: fonty osadzone (Chrome blokuje fonty z file://) */d.write('<link rel="stylesheet" href="'+R+'assets/css/fonts-embedded.css">')}else{['instrument-serif-latin-400-normal','geist-latin-wght-normal'].forEach(function(f){var l=d.createElement('link');l.rel='preload';l.as='font';l.type='font/woff2';l.crossOrigin='anonymous';l.href=R+'assets/fonts/'+f+'.woff2';h.appendChild(l)})}})(document,'${R}');
</script>
<link rel="stylesheet" href="${R}assets/css/main.css">
<script>
(function(d){d.classList.remove('no-js');d.classList.add('js');try{if(sessionStorage.getItem('ak-visited'))d.classList.add('is-return');if(sessionStorage.getItem('ak-pt')==='1')d.classList.add('is-entering');}catch(e){d.classList.add('is-return')}setTimeout(function(){if(!window.__akReady)d.classList.remove('js','is-entering')},3000)})(document.documentElement);
</script>
${jsonLd()}
${extraHead}
</head>
<body data-page="${page}" data-theme="${theme}" data-hours="${esc(JSON.stringify(Object.fromEntries(site.hours.map((h) => [h.d, h.open ? [h.open, h.close] : null]))))}">
<a class="skip" href="#main">Przejdź do treści</a>

<div class="loader" data-loader aria-hidden="true">
  <div class="loader__word"><span data-loader-word>Aneta Kunc</span></div>
  <div class="loader__meta"><span>Studio Fryzur — Warszawa</span><span class="loader__count" data-loader-count>0</span></div>
  <div class="loader__bar"><i data-loader-bar></i></div>
</div>

<div class="pt" aria-hidden="true"><div class="pt__panel pt__panel--a"></div><div class="pt__panel pt__panel--b"><span class="pt__mark">${logoSvg}</span></div></div>

<div class="cursor" aria-hidden="true"><div class="cursor__ring"><span class="cursor__label" data-cursor-label></span></div><div class="cursor__dot"></div></div>

<header class="hdr" data-hdr>
  <a class="hdr__logo" href="${R}index.html" aria-label="${esc(site.name)} — strona główna">${logoSvg}</a>
  <nav class="hdr__nav" aria-label="Główna nawigacja"><ul>${navLinks}</ul></nav>
  <div class="hdr__right">
    <span class="status" data-status><i></i><span data-status-text>Pn–Pt 10–21</span></span>
    ${btn({ href: site.booksy, label: 'Umów wizytę', cls: 'btn--sm btn--ink hdr__cta', external: true, cursor: 'Booksy', icon: arrowUpRight })}
    <button class="burger" type="button" aria-expanded="false" aria-controls="menu" aria-label="Otwórz menu" data-burger><span class="burger__lines"><i></i><i></i></span><span class="burger__txt">${roll('Menu')}</span></button>
  </div>
</header>

<div class="menu" id="menu" data-menu aria-hidden="true">
  <div class="menu__bg" data-menu-bg></div>
  <div class="menu__inner">
    <nav class="menu__nav" aria-label="Menu mobilne"><ol>${menuLinks}</ol></nav>
    <div class="menu__foot">
      <div><p class="menu__h">Adres</p><p>${site.street}<br>${site.postal} ${site.city}</p></div>
      <div><p class="menu__h">Kontakt</p><p><a href="${site.phoneHref}">${site.phone}</a><br><a href="mailto:${site.email}">${site.email}</a></p></div>
      <div class="menu__book">${btn({ href: site.booksy, label: 'Umów wizytę', cls: 'btn--light', external: true, icon: arrowUpRight })}</div>
    </div>
  </div>
</div>

<main id="main" class="main">
${body}
</main>

<footer class="ftr" data-theme-section="dark">
  <div class="wrap">
    <div class="ftr__cta">
      ${label('✳', 'Rezerwacja')}
      <a class="ftr__big" href="${site.booksy}" target="_blank" rel="noopener" data-cursor="Booksy"><span class="ftr__big-line" data-split="chars">Umów się</span><span class="ftr__big-line ftr__big-line--2"><em data-split="chars">na wizytę</em><span class="ftr__big-arrow">${arrowUpRight}</span></span></a>
    </div>
    <div class="ftr__grid">
      <div class="ftr__col">
        <p class="ftr__h">Studio</p>
        <p><a href="${site.maps}" target="_blank" rel="noopener" class="ulink">${site.street}<br>${site.postal} ${site.city} — ${site.district}</a></p>
      </div>
      <div class="ftr__col">
        <p class="ftr__h">Godziny</p>
        <ul class="hours hours--compact">${hoursRows(true)}</ul>
      </div>
      <div class="ftr__col">
        <p class="ftr__h">Kontakt</p>
        <p><a href="${site.phoneHref}" class="ulink">${site.phone}</a><br><a href="mailto:${site.email}" class="ulink">${site.email}</a></p>
        <p class="ftr__social"><a href="${site.facebook}" target="_blank" rel="noopener" class="ulink">Facebook</a><a href="${site.booksy}" target="_blank" rel="noopener" class="ulink">Booksy</a></p>
      </div>
      <div class="ftr__col">
        <p class="ftr__h">Strona</p>
        <ul class="ftr__nav">${nav.map((n) => `<li><a href="${R}${n.href}" class="ulink">${n.label}</a></li>`).join('')}</ul>
      </div>
    </div>
  </div>
  <div class="ftr__word" aria-hidden="true">${wordmarkSvg}</div>
  <div class="wrap ftr__bottom">
    <p>© <span data-year>2026</span> ${esc(site.name)}</p>
    <p><a href="${R}polityka-prywatnosci.html" class="ulink">Polityka prywatności</a></p>
    <p><button type="button" class="totop ulink" data-totop>Do góry ↑</button></p>
  </div>
</footer>

<script src="${R}assets/vendor/gsap.min.js" defer></script>
<script src="${R}assets/vendor/ScrollTrigger.min.js" defer></script>
<script src="${R}assets/vendor/SplitText.min.js" defer></script>
<script src="${R}assets/vendor/lenis.min.js" defer></script>
<script src="${R}assets/js/main.js" defer></script>
</body>
</html>
`;
}
