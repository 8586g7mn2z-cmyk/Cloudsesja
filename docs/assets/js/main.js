/* ==========================================================================
   Studio Fryzur Aneta Kunc, main.js
   GSAP + ScrollTrigger + SplitText, Lenis (smooth scroll), canvas „pasma”.
   Ruch oparty na rzemiośle: cięcie (odsłanianie zdjęć, fastryga), kolor (paleta,
   ocena), fala (zdjęcia, pasmo procesu, stopka) + View Transitions w galerii.
   ========================================================================== */
(() => {
  'use strict';

  window.__akReady = true;

  const d = document;
  const html = d.documentElement;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const mq = (q) => window.matchMedia(q).matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const reduce = mq('(prefers-reduced-motion: reduce)');
  const fine = mq('(hover: hover) and (pointer: fine)');
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  const hasSplit = !!window.SplitText;

  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* prywatny tryb */ } },
    del: (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* prywatny tryb */ } },
  };

  if (!hasGsap) {
    html.classList.remove('js', 'is-entering');
    html.classList.add('no-gsap');
  } else {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    if (hasSplit) gsap.registerPlugin(SplitText);
    gsap.defaults({ ease: 'expo.out' });
  }

  const hdrH = () => parseFloat(getComputedStyle(html).getPropertyValue('--hdr-h')) || 76;

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  if (hasGsap && !reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), touchMultiplier: 1.5 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function scrollToTarget(target, offset = 0, immediate = false) {
    if (lenis) {
      lenis.scrollTo(target, { offset, immediate, duration: 1.4 });
      return;
    }
    const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top: y, behavior: immediate || reduce ? 'auto' : 'smooth' });
  }

  /* ---------- Godziny otwarcia: zaznaczenie dzisiejszego dnia (strefa Europe/Warsaw) ---------- */
  function warsawDay() {
    try {
      const wd = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', weekday: 'short' }).format(new Date());
      return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
    } catch (e) {
      return new Date().getDay();
    }
  }
  const today = warsawDay();
  $$('[data-hours] [data-day]').forEach((el) => el.classList.toggle('is-today', Number(el.dataset.day) === today));

  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Header ---------- */
  const hdr = $('[data-hdr]');
  let menuOpen = false;
  let lastY = window.scrollY;
  function onScroll() {
    const y = window.scrollY;
    if (!hdr) return;
    hdr.classList.toggle('is-scrolled', y > 24);
    if (!menuOpen) {
      const hide = y > lastY && y > 220;
      const show = y < lastY - 2 || y < 220;
      if (hide) { hdr.classList.add('is-hidden'); html.classList.add('hdr-hidden'); }
      else if (show) { hdr.classList.remove('is-hidden'); html.classList.remove('hdr-hidden'); }
    }
    lastY = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Menu ---------- */
  const menu = $('[data-menu]');
  const burger = $('[data-burger]');
  let menuTl = null;
  if (menu && burger) {
    if (hasGsap) {
      menuTl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } })
        .fromTo('[data-menu-bg]', { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'expo.inOut' })
        .fromTo('.menu__txt > span', { yPercent: 115 }, { yPercent: 0, duration: 1, stagger: 0.06 }, '-=0.4')
        .fromTo('.menu__nav a', { borderBottomColor: 'rgba(239,231,221,0)' }, { borderBottomColor: 'rgba(239,231,221,.14)', duration: 0.8, stagger: 0.06 }, '<')
        .fromTo('.menu__foot > *', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.07 }, '<0.1');
      menuTl.eventCallback('onReverseComplete', () => { if (!menuOpen) menu.classList.remove('is-open'); });
    }

    const setOpen = (open) => {
      menuOpen = open;
      html.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Zamknij menu' : 'Otwórz menu');
      menu.setAttribute('aria-hidden', String(!open));
      const txt = $('.burger__txt .roll__in', burger);
      if (txt) { txt.textContent = open ? 'Zamknij' : 'Menu'; txt.dataset.text = txt.textContent; }
      if (open) {
        menu.classList.add('is-open');
        hdr && hdr.classList.remove('is-hidden');
        lenis && lenis.stop();
        menuTl ? menuTl.timeScale(1).play() : null;
        const first = $('.menu__nav a', menu);
        first && setTimeout(() => first.focus({ preventScroll: true }), 300);
      } else {
        lenis && lenis.start();
        if (menuTl) menuTl.timeScale(1.7).reverse();
        else menu.classList.remove('is-open');
      }
    };
    burger.addEventListener('click', () => setOpen(!menuOpen));
    d.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) { setOpen(false); burger.focus(); }
    });
    window.addEventListener('resize', () => { if (menuOpen && window.innerWidth > 1200) setOpen(false); });
  }

  /* ---------- Przyciski „magnetyczne” ---------- */
  if (fine && hasGsap && !reduce) {
    $$('[data-magnetic]').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.9, ease: 'elastic.out(1,.45)' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.9, ease: 'elastic.out(1,.45)' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.22);
        yTo((e.clientY - r.top - r.height / 2) * 0.3);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ---------- Przejścia między stronami ---------- */
  const pt = $('.pt');
  const ptA = $('.pt__panel--a');
  const ptB = $('.pt__panel--b');
  const ptMark = $('.pt__mark');

  function isInternal(a) {
    if (!a || !a.href) return false;
    if (a.target === '_blank' || a.hasAttribute('download')) return false;
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^(mailto|tel|sms|javascript):/i.test(raw)) return false;
    let url;
    try { url = new URL(a.href, location.href); } catch (e) { return false; }
    if (url.protocol !== location.protocol || url.host !== location.host) return false;
    if (url.pathname === location.pathname && url.search === location.search) return false;
    return true;
  }

  function leave(href) {
    if (!hasGsap || reduce) { location.href = href; return; }
    store.set('ak-pt', '1');
    pt.classList.add('is-active');
    gsap.timeline({ onComplete: () => { location.href = href; } })
      .set([ptA, ptB], { transformOrigin: '50% 100%' })
      .to(ptA, { scaleY: 1, duration: 0.5, ease: 'expo.inOut' })
      .to(ptB, { scaleY: 1, duration: 0.5, ease: 'expo.inOut' }, '-=0.4')
      .to(ptMark, { opacity: 1, duration: 0.2, ease: 'power2.out' }, '-=0.2');
  }

  d.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest('a') : null;
    if (!a) return;
    const raw = a.getAttribute('href') || '';
    // kotwice na tej samej stronie -> płynne przewijanie
    if (raw.startsWith('#') && raw.length > 1) {
      const target = d.getElementById(decodeURIComponent(raw.slice(1)));
      if (target) {
        e.preventDefault();
        scrollToTarget(target, -(hdrH() + 70));
        history.replaceState(null, '', raw);
        if (raw === '#main') target.focus({ preventScroll: true });
      }
      return;
    }
    if (!isInternal(a)) return;
    e.preventDefault();
    leave(a.href);
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted && hasGsap) {
      gsap.set([ptA, ptB], { scaleY: 0 });
      gsap.set(ptMark, { opacity: 0 });
      pt.classList.remove('is-active');
      html.classList.remove('is-entering');
      store.del('ak-pt');
    }
  });

  function enterTransition() {
    store.del('ak-pt');
    if (!html.classList.contains('is-entering') || !hasGsap) {
      html.classList.remove('is-entering');
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      gsap.timeline()
        .set([ptA, ptB], { scaleY: 1, transformOrigin: '50% 0%' })
        .set(ptMark, { opacity: 1 })
        .to(ptMark, { opacity: 0, duration: 0.2, ease: 'power2.in' })
        .to(ptB, { scaleY: 0, duration: 0.7, ease: 'expo.inOut' })
        .to(ptA, { scaleY: 0, duration: 0.7, ease: 'expo.inOut' }, '-=0.6')
        .add(resolve, '-=0.55')
        .add(() => {
          html.classList.remove('is-entering');
          pt.classList.remove('is-active');
        });
    });
  }

  /* ---------- Bez preloadera: treść widać od razu ---------- */
  function preloader() {
    store.set('ak-visited', '1');
    const loader = $('[data-loader]');
    if (loader) loader.remove();
    return Promise.resolve();
  }

  /* ---------- Canvas: animowane pasma włosów ---------- */
  function strands(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const colors = ['#2a1d16', '#7d5434', '#b98559', '#e8c39a'];
    let W = 0, H = 0, dpr = 1, list = [], grads = [], mask = null, running = false, visible = true, raf = 0, lastDraw = 0;
    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, cx: -9999, cy: -9999 };
    const STEPS = 22;

    function build() {
      seed = 7;
      list = [];
      const mobile = W < 760;
      const locks = mobile ? 3 : 5;
      for (let L = 0; L < locks; L++) {
        const lock = {
          cx: W * (mobile ? 0.12 + (L + rnd() * 0.8) / locks * 0.8 : 0.44 + (L + rnd() * 0.8) / locks * 0.54),
          amp: W * (0.04 + rnd() * 0.07),
          freq: 0.5 + rnd() * 0.6,
          phase: rnd() * Math.PI * 2,
          tilt: (rnd() - 0.6) * 0.18,
          sTop: W * (0.012 + rnd() * 0.015),
          sMid: W * (mobile ? 0.12 : 0.06) * (0.8 + rnd() * 0.7),
          speed: 0.6 + rnd() * 0.8,
        };
        const n = Math.round((mobile ? 24 : 32) * (0.8 + rnd() * 0.4));
        for (let i = 0; i < n; i++) {
          const layer = rnd();
          list.push({
            lock,
            u: (rnd() + rnd() + rnd()) / 1.5 - 1,
            jp: rnd() * Math.PI * 2,
            ja: W * (0.002 + rnd() * 0.006),
            len: 0.85 + rnd() * 0.25,
            g: layer < 0.42 ? 0 : layer < 0.86 ? 1 : 2,
            w: layer < 0.42 ? 1 + rnd() * 1.8 : layer < 0.86 ? 0.6 + rnd() * 1.1 : 0.4 + rnd() * 0.6,
            a: 0.35 + rnd() * 0.55,
          });
        }
      }
      const mk = (stops) => { const g = ctx.createLinearGradient(0, 0, 0, H); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
      grads = [
        mk([[0, colors[0]], [0.55, colors[1]], [1, colors[2]]]),
        mk([[0, colors[1]], [0.6, colors[2]], [1, colors[3]]]),
        mk([[0, 'rgba(232,195,154,.15)'], [0.5, colors[3]], [1, 'rgba(232,195,154,.6)']]),
      ];
      // maska wygaszająca pasma przy tekście (wcześniej CSS mask-image, droższa przy każdej klatce)
      if (window.innerWidth <= 960) {
        mask = ctx.createLinearGradient(0, 0, 0, H);
        [[0, 0], [0.04, 0], [0.22, 1], [0.48, 1], [0.68, 0], [1, 0]].forEach(([o, a]) => mask.addColorStop(o, `rgba(0,0,0,${a})`));
      } else {
        const dx = Math.sin(100 * Math.PI / 180), dy = -Math.cos(100 * Math.PI / 180);
        const len = Math.abs(W * dx) + Math.abs(H * dy);
        mask = ctx.createLinearGradient(W / 2 - dx * len / 2, H / 2 - dy * len / 2, W / 2 + dx * len / 2, H / 2 + dy * len / 2);
        [[0, 0], [0.18, 0], [0.58, 1], [1, 1]].forEach(([o, a]) => mask.addColorStop(o, `rgba(0,0,0,${a})`));
      }
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (!running) draw(performance.now());
    }

    function draw(time) {
      const tt = time * 0.00011;
      if (mouse.cx > -9000) {
        const r = canvas.getBoundingClientRect();
        mouse.tx = mouse.cx - r.left;
        mouse.ty = mouse.cy - r.top;
        if (mouse.x < -9000) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
      }
      mouse.x += (mouse.tx - mouse.x) * 0.13;
      mouse.y += (mouse.ty - mouse.y) * 0.13;
      const R = Math.max(120, W * 0.11);
      const R2 = R * R;
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      for (let s = 0; s < list.length; s++) {
        const st = list[s];
        const L = st.lock;
        ctx.beginPath();
        ctx.strokeStyle = grads[st.g];
        ctx.lineWidth = st.w;
        ctx.globalAlpha = st.a;
        let px = 0, py = 0;
        for (let k = 0; k <= STEPS; k++) {
          const t = (k / STEPS) * st.len;
          const y = -H * 0.06 + t * H * 1.14;
          const spread = L.sTop + (L.sMid - L.sTop) * Math.pow(Math.sin(Math.min(t, 1) * Math.PI * 0.62), 0.9);
          const center = L.cx + L.amp * Math.sin(t * L.freq * Math.PI * 2 + L.phase + tt * L.speed * 6) + L.tilt * t * W;
          let x = center + st.u * spread + Math.sin(t * 6 + st.jp + tt * 9) * st.ja * (0.6 + Math.abs(st.u));
          const dxm = x - mouse.x;
          const dym = y - mouse.y;
          const dist2 = dxm * dxm + dym * dym;
          if (dist2 < R2) {
            const f = 1 - dist2 / R2;
            x += Math.sign(dxm || 1) * f * f * R * 0.45;
          }
          if (k === 0) ctx.moveTo(x, y);
          else ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
          px = x; py = y;
        }
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (mask) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = mask;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // pasma poruszają się powoli, więc 30 klatek na sekundę wystarcza i o połowę odciąża kartę graficzną
    function loop(time) {
      if (time - lastDraw > 30) { lastDraw = time; draw(time); }
      raf = requestAnimationFrame(loop);
    }
    function start() { if (running || reduce || !visible || d.hidden) return; running = true; raf = requestAnimationFrame(loop); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    new ResizeObserver(() => resize()).observe(canvas);
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); }).observe(canvas);
    d.addEventListener('visibilitychange', () => (d.hidden ? stop() : start()));
    window.addEventListener('pointermove', (e) => { mouse.cx = e.clientX; mouse.cy = e.clientY; }, { passive: true });
    resize();
    start();
  }
  $$('[data-strands]').forEach(strands);

  /* ---------- Animacje wejścia strony ---------- */
  function heroIntro() {
    if (!hasGsap || reduce) return;
    const hero = $('.hero');
    if (!hero) return;
    const st = stitch();
    const tl = gsap.timeline()
      .fromTo('.hero__canvas', { opacity: 0 }, { opacity: 1, duration: 2.4, ease: 'power2.out' }, 0)
      .fromTo('.hero__word', { yPercent: 115, y: 0 }, { yPercent: 0, y: 0, duration: 1.5, stagger: 0.11 }, 0.05)
      .fromTo('[data-hero-fade]', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1.2, stagger: 0.07 }, 0.35);
    // ścieg przeszywa się krok po kroku, jak w maszynie do szycia
    if (st) tl.fromTo(st, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15, ease: 'steps(23)' }, 1.05);

    gsap.to('.hero__title', { yPercent: -18, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__canvas', { yPercent: 12, opacity: 0.3, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* ---------- Animacje przewijania ---------- */
  function splitReveals() {
    $$('[data-split]').forEach((el) => {
      if (!hasSplit) { gsap.set(el, { opacity: 1 }); return; }
      const mode = el.dataset.split;
      const chars = mode === 'chars' || mode === 'chars-lines';
      gsap.set(el, { opacity: 1 });
      SplitText.create(el, {
        type: chars ? 'lines,chars' : 'lines',
        mask: 'lines',
        linesClass: 'split-line',
        charsClass: 'split-char',
        autoSplit: true,
        onSplit(self) {
          return gsap.from(chars ? self.chars : self.lines, {
            yPercent: 115,
            duration: chars ? 1.3 : 1.25,
            stagger: chars ? 0.022 : 0.09,
            ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          });
        },
      });
    });
  }

  function highlight() {
    $$('[data-highlight]').forEach((el) => {
      if (!hasSplit) return;
      const split = SplitText.create(el, { type: 'words', wordsClass: 'hl-w' });
      gsap.to(split.words, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 48%', scrub: 0.6 } });
    });
  }

  // „cięcie nożycami”: ostrze przecina kadr w poprzek, potem kadr rozchyla się od strony bliższej krawędzi ekranu
  function mediaReveals() {
    $$('[data-reveal]').forEach((el) => {
      const img = $('img', el);
      const blade = d.createElement('i');
      blade.className = 'cut-blade';
      el.appendChild(blade);
      const r = el.getBoundingClientRect();
      const flip = r.left + r.width / 2 > window.innerWidth / 2;
      const fx = (x) => (flip ? 100 - x : x);
      const P = -25; // oś nożyc leży poza kadrem
      const cut = { x: 0, s: 0.012 };
      const paint = () => {
        const a = cut.s * -P;
        const b = cut.s * (cut.x - P);
        el.style.clipPath = `polygon(${fx(0)}% ${50 - a}%, ${fx(cut.x)}% ${50 - b}%, ${fx(cut.x)}% ${50 + b}%, ${fx(0)}% ${50 + a}%)`;
      };
      paint();
      gsap.set(blade, { scaleX: 0, transformOrigin: flip ? '100% 50%' : '0% 50%' });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 90%', once: true }, onComplete: () => { el.style.clipPath = 'none'; blade.remove(); } })
        .to(cut, { x: 100, duration: 0.75, ease: 'expo.inOut', onUpdate: paint })
        .to(blade, { scaleX: 1, duration: 0.75, ease: 'expo.inOut' }, 0)
        .to(cut, { s: 2.1, duration: 1.6, ease: 'expo.out', onUpdate: paint }, '-=0.08')
        .to(blade, { opacity: 0, duration: 0.5, ease: 'power2.out' }, '<');
      if (img) {
        gsap.set(img, { transition: 'none' });
        tl.fromTo(img, { scale: 1.3 }, { scale: 1, duration: 1.9, ease: 'expo.out', onComplete: () => gsap.set(img, { clearProps: 'transform,transition,scale' }) }, 0.6);
      }
      el._reveal = tl;
    });
  }

  function parallax() {
    $$('[data-parallax]').forEach((el) => {
      const amt = parseFloat(el.dataset.parallax) || 0.1;
      gsap.fromTo(el, { yPercent: -amt * 40 }, { yPercent: amt * 40, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }

  function cardsAndRows() {
    ScrollTrigger.batch('[data-reveal-card]', {
      start: 'top 92%',
      once: true,
      onEnter: (b) => gsap.fromTo(b, { opacity: 0, y: 64 }, { opacity: 1, y: 0, duration: 1.3, stagger: 0.1, overwrite: true }),
    });
    ScrollTrigger.batch('[data-reveal-row]', {
      start: 'top 94%',
      once: true,
      onEnter: (b) => gsap.fromTo(b, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1, stagger: 0.06, overwrite: true }),
    });
  }

  function counters() {
    $$('[data-count]').forEach((el) => {
      const end = parseFloat(el.dataset.count);
      const dec = Number(el.dataset.decimals) || 0;
      const fmt = (v) => (dec ? v.toFixed(dec).replace('.', ',') : String(Math.round(v)));
      const o = { v: end > 1000 ? end - 36 : 0 };
      el.textContent = fmt(o.v);
      ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter: () => gsap.to(o, { v: end, duration: 2, ease: 'expo.out', onUpdate: () => { el.textContent = fmt(o.v); } }),
      });
    });
  }

  function marquees() {
    $$('[data-marquee]').forEach((m) => {
      const track = $('.marquee__track', m);
      const tween = gsap.to(track, { xPercent: -50, duration: 30, ease: 'none', repeat: -1 });
      tween.totalTime(tween.duration() * 500);
      let boost = 0;
      let dir = 1;
      ScrollTrigger.create({
        trigger: m, start: 'top bottom', end: 'bottom top',
        onUpdate: (self) => { dir = self.direction; boost = clamp(Math.abs(self.getVelocity()) / 260, 0, 6); },
        onToggle: (self) => (self.isActive ? tween.resume() : tween.pause()),
      });
      // przy szybkim przewijaniu napisy pochylają się w stronę ruchu
      const skew = gsap.quickSetter(track, 'skewX', 'deg');
      let lean = 0;
      gsap.ticker.add(() => {
        boost *= 0.93;
        tween.timeScale(dir * (1 + boost));
        lean += (-dir * boost * 1.4 - lean) * 0.12;
        skew(Math.abs(lean) < 0.01 ? 0 : lean);
      });
    });
  }

  function lines() {
    $$('[data-line]').forEach((l) => {
      gsap.to(l, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: l.closest('section') || l, start: 'top 65%', end: 'bottom 75%', scrub: 0.6 } });
    });
  }

  function headerTheme() {
    const sections = $$('[data-theme-section="dark"]');
    const update = () => {
      const probe = hdrH() / 2;
      const dark = sections.some((s) => { const r = s.getBoundingClientRect(); return r.top <= probe && r.bottom >= probe; });
      hdr && hdr.classList.toggle('is-dark', dark);
    };
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update, onRefresh: update });
    update();
  }

  function hscroll() {
    const hs = $('[data-hscroll]');
    if (!hs) return;
    const track = $('[data-hscroll-track]', hs);
    const bar = $('[data-hscroll-progress]', hs);
    const mm = gsap.matchMedia();
    mm.add('(min-width: 961px)', () => {
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
      // karty pochylają się przy szybkim przesuwaniu i sprężyście wracają do pionu
      let lean = 0;
      let leanTarget = 0;
      let leanOff = null;
      let lastLean = 0;
      const leanMedia = $$('.tone .media', track);
      const tickLean = () => {
        leanTarget *= 0.9;
        lean += (leanTarget - lean) * 0.14;
        const v = Math.abs(lean) < 0.01 ? 0 : +lean.toFixed(2);
        if (v !== lastLean) { lastLean = v; leanMedia.forEach((m) => { m.style.transform = v ? 'skewX(' + v + 'deg)' : ''; }); }
      };
      const tw = gsap.to(track, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: {
          trigger: hs,
          start: 'top top',
          end: () => `+=${dist()}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (s) => {
            bar && gsap.set(bar, { scaleX: s.progress });
            leanTarget = clamp(s.getVelocity() / 320, -5, 5);
          },
          onToggle: (s) => {
            leanOff && leanOff.kill();
            if (s.isActive) gsap.ticker.add(tickLean);
            else leanOff = gsap.delayedCall(0.8, () => gsap.ticker.remove(tickLean));
          },
        },
      });
      $$('.tone', track).forEach((card, i) => {
        gsap.fromTo(card, { y: i % 2 ? 40 : -20 }, { y: i % 2 ? -40 : 20, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: tw, start: 'left right', end: 'right left', scrub: true } });
      });
      const paint = chameleon(hs, track, tw.scrollTrigger);
      gsap.ticker.add(paint);
      return () => { leanOff && leanOff.kill(); gsap.ticker.remove(paint); gsap.ticker.remove(tickLean); leanMedia.forEach((m) => { m.style.transform = ''; }); };
    });
    mm.add('(max-width: 960px)', () => {
      const paint = chameleon(hs, track, null);
      let raf = 0;
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
      track.addEventListener('scroll', onScroll, { passive: true });
      return () => track.removeEventListener('scroll', onScroll);
    });
  }

  /* ---------- Paleta-kameleon: tło sekcji przyjmuje odcień karty, która jest na środku ekranu ---------- */
  function chameleon(sec, track, pin) {
    const cards = $$('[data-tint]', track);
    if (!cards.length) return () => {};
    const css = getComputedStyle(html);
    const base = css.getPropertyValue('--bg').trim();
    const baseInk = css.getPropertyValue('--accent').trim();
    const mix = gsap.utils.interpolate;
    const bar = $('[data-hscroll-progress]', sec);
    let enter = 0;
    let leave = 0;
    let key = '';
    let lastBg = '';
    let lastInk = '';
    // środek każdej karty liczony raz (po odświeżeniu), potem przesuwany o bieżące położenie toru
    let centers = [];
    let x0 = 0;
    const shift = () => (pin ? Number(gsap.getProperty(track, 'x')) || 0 : -track.scrollLeft);
    const measure = () => {
      x0 = shift();
      centers = cards.map((c) => { const r = c.getBoundingClientRect(); return r.left + r.width / 2; });
      key = '';
    };
    const paint = () => {
      const amt = enter * (1 - leave);
      const dx = shift() - x0;
      const k0 = amt.toFixed(3) + '|' + dx.toFixed(1);
      if (k0 === key) return;
      key = k0;
      const mid = window.innerWidth / 2;
      const cs = centers.map((c) => c + dx);
      const step = cs.length > 1 ? Math.abs(cs[1] - cs[0]) : window.innerWidth / 3;
      let i = 0;
      while (i < cs.length - 1 && cs[i + 1] < mid) i++;
      const a = cards[i].dataset;
      const b = (cards[i + 1] || cards[i]).dataset;
      const f = i < cs.length - 1 ? clamp((mid - cs[i]) / (cs[i + 1] - cs[i]), 0, 1) : 0;
      // przed pierwszą i za ostatnią kartą kolor łagodnie wraca do bazowego
      const out = mid < cs[0] ? (cs[0] - mid) / step : mid > cs[cs.length - 1] ? (mid - cs[cs.length - 1]) / step : 0;
      const k = amt * (1 - clamp(out, 0, 1));
      const bg = mix(base, mix(a.tint, b.tint, f), k);
      const ink = mix(baseInk, mix(a.tintInk, b.tintInk, f), k);
      // styl ustawiany bezpośrednio na kilku elementach, bez zmiennych dziedziczonych przez całą sekcję
      if (bg !== lastBg) { sec.style.backgroundColor = bg; lastBg = bg; }
      if (ink !== lastInk) {
        $$('.h2 em', sec).forEach((em) => { em.style.color = ink; });
        if (bar) bar.style.backgroundColor = ink;
        lastInk = ink;
      }
    };
    sec.classList.add('has-tint');
    ScrollTrigger.addEventListener('refresh', measure);
    measure();
    ScrollTrigger.create({ trigger: sec, start: 'top bottom', end: 'top top', onUpdate: (st) => { enter = st.progress; paint(); }, onRefresh: (st) => { enter = st.progress; paint(); } });
    ScrollTrigger.create({
      trigger: sec,
      start: pin ? () => pin.end : 'bottom bottom',
      end: pin ? () => pin.end + window.innerHeight * 0.4 : 'bottom 35%',
      onUpdate: (st) => { leave = st.progress; paint(); },
      onRefresh: (st) => { leave = st.progress; paint(); },
    });
    return paint;
  }

  function stackCards() {
    const cards = $$('[data-stack-card]');
    if (!cards.length) return;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 961px) and (min-height: 700px)', () => {
      cards.forEach((card, i) => {
        if (i === cards.length - 1) return;
        const inner = $('.stack-card__inner', card);
        gsap.to(inner, {
          scale: 0.9 + i * 0.02,
          yPercent: -2,
          ease: 'none',
          scrollTrigger: { trigger: cards[i + 1], start: 'top bottom', end: `top ${hdrH() + 12}px`, scrub: true },
        });
      });
    });
  }

  function footerWord() {
    const w = $('.wordmark');
    if (!w) return;
    gsap.fromTo(w, { yPercent: 55 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.ftr__word', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  }

  /* ---------- Fastryga: ścieg pod słowem „szyte” (hero) ---------- */
  function stitch() {
    const w = $('.hero__title em.hero__word');
    if (!w) return null;
    w.insertAdjacentHTML('beforeend', '<svg class="stitch" viewBox="0 0 300 16" aria-hidden="true" focusable="false"><path d="M4 10C58 4 112 13 166 8S262 4 296 9" pathLength="100"/></svg>');
    return $('.stitch', w);
  }

  /* ---------- Pasmo: linia „wizyty” rysuje się jak pasmo włosa, kroki zapalają się po kolei ---------- */
  function processStrand() {
    $$('.process').forEach((sec) => {
      const line = $('.process__line', sec);
      const steps = $$('.step', sec);
      if (!line || !steps.length) return;
      const mm = gsap.matchMedia();
      mm.add('(min-width: 961px)', () => {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = d.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'strand');
        svg.setAttribute('aria-hidden', 'true');
        const base = d.createElementNS(NS, 'path');
        const draw = d.createElementNS(NS, 'path');
        base.setAttribute('class', 'strand__base');
        draw.setAttribute('class', 'strand__draw');
        draw.setAttribute('pathLength', '1');
        svg.append(base, draw);
        const nodes = steps.map(() => { const n = d.createElement('span'); n.className = 'strand__node'; return n; });
        line.append(svg, ...nodes);
        line.classList.add('has-strand');
        sec.classList.add('has-strand');
        let marks = [];
        // fala przechodzi przez zero dokładnie w miejscu każdego kroku, więc węzły leżą na linii
        const build = () => {
          const W = line.clientWidth;
          const H = 24;
          const A = 7;
          const lx = line.getBoundingClientRect().left;
          const xs = steps.map((s) => clamp(s.getBoundingClientRect().left - lx, 0, W));
          const pts = [...xs, W];
          let p = `M${pts[0]} ${H / 2}`;
          let up = true;
          for (let i = 0; i < pts.length - 1; i++) {
            const q = (pts[i + 1] - pts[i]) / 2;
            for (let h = 0; h < 2; h++) {
              const x0 = pts[i] + q * h;
              p += ` Q${(x0 + q / 2).toFixed(1)} ${up ? H / 2 - A * 2 : H / 2 + A * 2} ${(x0 + q).toFixed(1)} ${H / 2}`;
              up = !up;
            }
          }
          svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
          base.setAttribute('d', p);
          draw.setAttribute('d', p);
          nodes.forEach((n, i) => { n.style.left = `${xs[i]}px`; });
          marks = xs.map((x) => x / W);
        };
        build();
        const light = (prog) => {
          steps.forEach((s, i) => {
            const on = prog >= marks[i] + 0.004;
            s.classList.toggle('is-lit', on);
            nodes[i].classList.toggle('is-lit', on);
          });
        };
        const tw = gsap.fromTo(draw, { strokeDashoffset: 1 }, {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: sec, start: 'top 65%', end: 'bottom 75%', scrub: 0.6,
            onRefresh: () => build(),
          },
          onUpdate() { light(this.progress()); },
        });
        return () => {
          tw.kill();
          svg.remove();
          nodes.forEach((n) => n.remove());
          line.classList.remove('has-strand');
          sec.classList.remove('has-strand');
          steps.forEach((s) => s.classList.remove('is-lit'));
        };
      });
      mm.add('(max-width: 960px)', () => {
        sec.classList.add('has-strand');
        const sts = steps.map((s) => ScrollTrigger.create({ trigger: s, start: 'top 72%', onEnter: () => s.classList.add('is-lit'), onLeaveBack: () => s.classList.remove('is-lit') }));
        return () => { sts.forEach((st) => st.kill()); sec.classList.remove('has-strand'); steps.forEach((s) => s.classList.remove('is-lit')); };
      });
    });
  }

  /* ---------- Ocena „5,0” nabiera koloru jak farba wchłaniana przez pasmo ---------- */
  function dye() {
    $$('.rating__num').forEach((n) => {
      n.classList.add('is-dye');
      gsap.fromTo(n, { '--dye': '-8%' }, { '--dye': '112%', ease: 'none', scrollTrigger: { trigger: n, start: 'top 88%', end: 'bottom 42%', scrub: 0.8 } });
      const stars = $$('.ico-star', n.parentElement);
      if (stars.length) {
        gsap.from(stars, { scale: 0, rotation: -120, transformOrigin: '50% 55%', duration: 1, stagger: 0.09, ease: 'back.out(2.4)', scrollTrigger: { trigger: stars[0], start: 'top 90%', once: true } });
      }
    });
  }

  /* ---------- Ciemne sekcje wjeżdżają jako karta i rozlewają się na całą szerokość ---------- */
  function darkCards() {
    const easeIn = gsap.parseEase('power2.in');
    const easeOut = gsap.parseEase('power2.out');
    $$('.sec.is-dark, .ftr').forEach((sec) => {
      const wrap = $('.wrap', sec);
      const pad = wrap ? parseFloat(getComputedStyle(wrap).paddingLeft) : 24;
      let e = 0;
      let x = 0;
      let last = '';
      const bg = d.createElement('div');
      bg.className = 'x-bg';
      bg.setAttribute('aria-hidden', 'true');
      sec.prepend(bg);
      const paint = () => {
        const k = Math.max(1 - easeOut(e), easeIn(x));
        const inset = Math.min(pad * 0.62, 36);
        const round = clamp(window.innerWidth * 0.024, 18, 36);
        const clip = k < 0.002 ? 'none' : 'inset(0 ' + (k * inset).toFixed(1) + 'px round ' + (k * round).toFixed(1) + 'px)';
        if (clip !== last) { bg.style.clipPath = clip; last = clip; }
      };
      sec.classList.add('x-card');
      paint();
      ScrollTrigger.create({ trigger: sec, start: 'top bottom', end: 'top 22%', onUpdate: (s) => { e = s.progress; paint(); }, onRefresh: (s) => { e = s.progress; paint(); } });
      if (!sec.classList.contains('ftr')) {
        ScrollTrigger.create({ trigger: sec, start: 'bottom 78%', end: 'bottom top', onUpdate: (s) => { x = s.progress; paint(); }, onRefresh: (s) => { x = s.progress; paint(); } });
      }
    });
  }

  /* ---------- Fala: zdjęcia falują jak pasmo włosów przy najechaniu kursorem ---------- */
  function waveHover() {
    if (!fine) return;
    const targets = $$('.tone, .person, .g-item__btn');
    if (!targets.length) return;
    d.body.insertAdjacentHTML('beforeend', '<svg class="fx-defs" aria-hidden="true" focusable="false"><filter id="ak-wave" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.003 0.012" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" values="1 0 0 0 0  0 0 0 0 .5  0 0 0 0 0  0 0 0 0 1" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></svg>');
    const turb = $('#ak-wave feTurbulence');
    const disp = $('#ak-wave feDisplacementMap');
    let current = null;
    let tl = null;
    const release = () => { if (current) current.style.filter = ''; current = null; };
    targets.forEach((t) => {
      t.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        const img = $('.media img', t);
        if (!img) return;
        tl && tl.kill();
        release();
        current = img;
        img.style.filter = 'url(#ak-wave)';
        tl = gsap.timeline({ onComplete: release })
          .fromTo(disp, { attr: { scale: 0 } }, { attr: { scale: 18 }, duration: 0.45, ease: 'power2.out' })
          .to(disp, { attr: { scale: 0 }, duration: 1.5, ease: 'power3.out' })
          .fromTo(turb, { attr: { baseFrequency: '0.003 0.012' } }, { attr: { baseFrequency: '0.004 0.026' }, duration: 1.95, ease: 'sine.inOut' }, 0);
      });
    });
  }

  /* ---------- Rezerwacja w stopce: litery unoszą się falą wokół kursora ---------- */
  function kineticCta() {
    const big = $('.ftr__big');
    if (!big || !fine) return;
    const qs = new WeakMap();
    const get = (c) => {
      let q = qs.get(c);
      if (!q) {
        q = { y: gsap.quickTo(c, 'y', { duration: 0.7, ease: 'power3' }), r: gsap.quickTo(c, 'rotation', { duration: 0.9, ease: 'power3' }) };
        qs.set(c, q);
      }
      return q;
    };
    big.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const chars = $$('.split-char', big);
      if (!chars.length || gsap.getProperty(chars[chars.length - 1], 'yPercent') !== 0) return;
      big.classList.add('is-kinetic');
      const fs = parseFloat(getComputedStyle(big).fontSize);
      const R = fs * 0.85;
      chars.forEach((c) => {
        const b = c.getBoundingClientRect();
        const dx = e.clientX - (b.left + b.width / 2);
        const dy = e.clientY - (b.top + b.height / 2 - (gsap.getProperty(c, 'y') || 0));
        const f = Math.exp(-(dx * dx + dy * dy) / (R * R));
        const q = get(c);
        q.y(-f * fs * 0.13);
        q.r(clamp(dx / R, -1, 1) * f * 6);
      });
    });
    big.addEventListener('pointerleave', () => {
      $$('.split-char', big).forEach((c) => { const q = get(c); q.y(0); q.r(0); });
    });
  }

  /* ---------- Akordeon (FAQ) ---------- */
  $$('[data-acc] .acc__btn').forEach((btn) => {
    const panel = d.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      if (!hasGsap || reduce) { panel.hidden = open; return; }
      if (!open) {
        panel.hidden = false;
        gsap.fromTo(panel, { height: 0 }, { height: 'auto', duration: 0.8, ease: 'expo.out', onComplete: () => ScrollTrigger.refresh() });
        gsap.fromTo($('.acc__content', panel), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, delay: 0.05 });
      } else {
        gsap.to(panel, { height: 0, duration: 0.55, ease: 'expo.inOut', onComplete: () => { panel.hidden = true; gsap.set(panel, { clearProps: 'height' }); ScrollTrigger.refresh(); } });
      }
    });
  });

  /* ---------- Cennik: zakładki ---------- */
  function priceTabs() {
    const bar = $('[data-tabs]');
    if (!bar) return;
    const tabsEl = $('.tabs', bar);
    const tabs = $$('[data-tab]', bar);
    const ind = $('[data-tabs-ind]', bar);
    let current = '';
    const setActive = (slug) => {
      if (slug === current) return;
      current = slug;
      tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === slug));
      const t = tabs.find((x) => x.dataset.tab === slug);
      if (!t) return;
      ind.style.width = `${t.offsetWidth}px`;
      ind.style.transform = `translateX(${t.offsetLeft}px)`;
      if (tabsEl.scrollWidth > tabsEl.clientWidth) tabsEl.scrollTo({ left: t.offsetLeft - 16, behavior: 'smooth' });
    };
    const cats = $$('[data-price-cat]');
    const pick = () => {
      const line = window.innerHeight * 0.55;
      let id = cats[0].id;
      cats.forEach((c) => { if (c.getBoundingClientRect().top < line) id = c.id; });
      setActive(id);
    };
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: pick, onRefresh: pick });
    pick();
    window.addEventListener('resize', () => { const c = current; current = ''; setActive(c); });
  }

  /* ---------- Galeria: filtr + lightbox ---------- */
  function gallery() {
    const grid = $('[data-grid]');
    if (!grid) return;
    const chips = $$('[data-filter]');
    const items = $$('.g-item', grid);
    // View Transitions: zdjęcia płynnie przejeżdżają na nowe miejsca zamiast znikać i pojawiać się
    const vt = typeof d.startViewTransition === 'function' && hasGsap && !reduce;
    const revealAll = () => $$('[data-reveal]', grid).forEach((m) => (m._reveal ? m._reveal.progress(1) : gsap.set(m, { clipPath: 'none' })));
    chips.forEach((ch) => ch.addEventListener('click', () => {
      const f = ch.dataset.filter;
      const setChips = () => chips.forEach((c) => { const on = c === ch; c.classList.toggle('is-active', on); c.setAttribute('aria-pressed', String(on)); });
      const apply = () => {
        items.forEach((it) => it.classList.toggle('is-hidden', f !== 'all' && it.dataset.cat !== f));
        if (hasGsap) ScrollTrigger.refresh();
      };
      setChips();
      if (vt) {
        revealAll();
        items.forEach((it, i) => { it.style.viewTransitionName = `g-item-${i}`; it.style.setProperty('view-transition-class', 'g-item'); });
        const t = d.startViewTransition(apply);
        t.finished.finally(() => items.forEach((it) => { it.style.viewTransitionName = ''; it.style.removeProperty('view-transition-class'); }));
        return;
      }
      if (!hasGsap || reduce) { apply(); return; }
      gsap.to(grid, {
        opacity: 0, y: 24, duration: 0.35, ease: 'power2.in',
        onComplete: () => {
          apply();
          revealAll();
          gsap.fromTo(grid, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 });
          gsap.fromTo(items.filter((i) => !i.classList.contains('is-hidden')), { y: 40 }, { y: 0, duration: 1, stagger: 0.05 });
        },
      });
    }));

    const lb = $('[data-lb]');
    const dataEl = $('#lb-data');
    if (!lb || !dataEl) return;
    const data = JSON.parse(dataEl.textContent);
    const img = $('[data-lb-img]', lb);
    const title = $('[data-lb-title]', lb);
    const cat = $('[data-lb-cat]', lb);
    const count = $('[data-lb-count]', lb);
    let idx = 0;
    let lastFocus = null;
    const visible = () => items.filter((i) => !i.classList.contains('is-hidden')).map((i) => Number($('[data-lightbox]', i).dataset.lightbox));
    const render = () => {
      const it = data[idx];
      const vis = visible();
      img.src = it.src;
      img.alt = it.title;
      title.textContent = it.title;
      cat.textContent = it.cat;
      count.textContent = `${vis.indexOf(idx) + 1} z ${vis.length}`;
    };
    const thumb = (i) => { const b = $(`[data-lightbox="${i}"]`); return b ? $('img', b) : null; };
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };
    // zdjęcie przelatuje z siatki do podglądu i wraca na swoje miejsce (View Transitions)
    const morph = (from, to, update) => {
      from.style.viewTransitionName = 'lb-photo';
      const t = d.startViewTransition(async () => {
        from.style.viewTransitionName = '';
        update();
        to.style.viewTransitionName = 'lb-photo';
        try { await to.decode(); } catch (e) { /* obraz wczyta się po przejściu */ }
      });
      t.finished.finally(() => { to.style.viewTransitionName = ''; });
    };
    const open = (i) => {
      lastFocus = d.activeElement;
      idx = i;
      const show = () => {
        render();
        lb.hidden = false;
        lenis && lenis.stop();
        d.body.style.overflow = 'hidden';
        $('.lightbox__close', lb).focus({ preventScroll: true });
      };
      const th = thumb(i);
      if (vt && th) { morph(th, img, show); return; }
      show();
      if (hasGsap && !reduce) {
        gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power2.out' });
        gsap.fromTo('.lightbox__fig', { y: 40, scale: 0.96 }, { y: 0, scale: 1, duration: 0.9 });
      }
    };
    const close = () => {
      const done = () => { lb.hidden = true; d.body.style.overflow = ''; lenis && lenis.start(); lastFocus && lastFocus.focus({ preventScroll: true }); };
      const th = thumb(idx);
      if (vt && th && inView(th)) { morph(img, th, done); return; }
      if (hasGsap && !reduce) gsap.to(lb, { opacity: 0, duration: 0.35, ease: 'power2.in', onComplete: done });
      else done();
    };
    const step = (s) => {
      const vis = visible();
      let p = vis.indexOf(idx);
      p = (p + s + vis.length) % vis.length;
      idx = vis[p];
      if (hasGsap && !reduce) {
        gsap.timeline()
          .to(img, { opacity: 0, x: -30 * s, duration: 0.25, ease: 'power2.in' })
          .add(render)
          .fromTo(img, { opacity: 0, x: 30 * s }, { opacity: 1, x: 0, duration: 0.6 });
      } else render();
    };
    $$('[data-lightbox]').forEach((b) => b.addEventListener('click', () => open(Number(b.dataset.lightbox))));
    $$('[data-lb-close]', lb).forEach((b) => b.addEventListener('click', close));
    $('[data-lb-prev]', lb).addEventListener('click', () => step(-1));
    $('[data-lb-next]', lb).addEventListener('click', () => step(1));
    d.addEventListener('keydown', (e) => {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'Tab') {
        const f = $$('button', lb);
        const i = f.indexOf(d.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    let sx = null;
    lb.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    lb.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });
  }

  /* ---------- Rezerwacja na stronie: oficjalny widżet Booksy w panelu bocznym ----------
     Terminy, usługi i ceny pochodzą na żywo z Booksy, a rezerwacja trafia prosto do kalendarza salonu.
     Widżet (i ciasteczka Booksy) ładuje się dopiero po kliknięciu „Umów wizytę”. */
  function booking() {
    const links = $$('[data-book]');
    if (!links.length) return;
    const url = links[0].href;
    const id = (url.match(/booksy\.com\/pl-pl\/(\d+)/) || [])[1];
    if (!id || typeof HTMLDialogElement !== 'function') return;
    let dlg = null;
    let panel = null;
    let scrim = null;
    let lastFocus = null;
    let closing = false;

    const build = () => {
      dlg = d.createElement('dialog');
      dlg.className = 'booking';
      dlg.setAttribute('aria-labelledby', 'booking-title');
      dlg.innerHTML = `<div class="booking__scrim" data-booking-close></div>
        <div class="booking__panel">
          <header class="booking__head">
            <div>
              <h2 class="booking__title" id="booking-title">Umów wizytę</h2>
              <p class="booking__sub">Wolne terminy i aktualne ceny prosto z Booksy.</p>
            </div>
            <button type="button" class="booking__close" data-booking-close aria-label="Zamknij rezerwację"><i></i></button>
          </header>
          <div class="booking__body" data-lenis-prevent>
            <p class="booking__wait" aria-live="polite">Wczytujemy kalendarz…</p>
            <div class="booking__widget"></div>
          </div>
          <p class="booking__foot">Kalendarz się nie wczytuje? <a class="ulink" href="${url}" target="_blank" rel="noopener">Umów się bezpośrednio w Booksy</a></p>
        </div>`;
      d.body.appendChild(dlg);
      panel = $('.booking__panel', dlg);
      scrim = $('.booking__scrim', dlg);
      const holder = $('.booking__widget', dlg);
      const wait = $('.booking__wait', dlg);
      // gdy widżet wstawi iframe, chowamy komunikat po jego załadowaniu
      new MutationObserver((list, obs) => {
        const frame = $('iframe', holder);
        if (!frame) return;
        obs.disconnect();
        frame.title = 'Rezerwacja wizyty w Booksy';
        frame.addEventListener('load', () => { wait.hidden = true; }, { once: true });
      }).observe(holder, { childList: true, subtree: true });
      const s = d.createElement('script');
      s.src = `https://booksy.com/widget-2021/code.js?id=${id}&country=pl&lang=pl&mode=inline`;
      s.onerror = () => { wait.textContent = 'Nie udało się wczytać kalendarza. Skorzystaj z linku poniżej albo zadzwoń: +48 732 737 379.'; };
      holder.appendChild(s);
      dlg.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('[data-booking-close]')) close(); });
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    };

    const open = () => {
      if (!dlg) build();
      if (dlg.open) return;
      lastFocus = d.activeElement;
      closing = false;
      dlg.showModal();
      lenis ? lenis.stop() : (html.style.overflow = 'hidden');
      if (hasGsap && !reduce) {
        const wide = window.innerWidth > 760;
        gsap.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' });
        gsap.fromTo(panel, wide ? { xPercent: 100, yPercent: 0 } : { yPercent: 100, xPercent: 0 }, { xPercent: 0, yPercent: 0, duration: 0.9, ease: 'expo.out' });
      }
      $('.booking__close', dlg).focus({ preventScroll: true });
    };

    const close = () => {
      if (!dlg || !dlg.open || closing) return;
      closing = true;
      const done = () => {
        dlg.close();
        closing = false;
        lenis ? lenis.start() : (html.style.overflow = '');
        lastFocus && lastFocus.focus({ preventScroll: true });
      };
      if (hasGsap && !reduce) {
        const wide = window.innerWidth > 760;
        gsap.to(scrim, { opacity: 0, duration: 0.4, ease: 'power2.in' });
        gsap.to(panel, { ...(wide ? { xPercent: 100 } : { yPercent: 100 }), duration: 0.5, ease: 'expo.in', onComplete: done });
      } else done();
    };

    // przechwytujemy kliknięcie przed przejściem stron; Ctrl/Cmd+klik dalej otwiera Booksy w nowej karcie
    d.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('[data-book]') : null;
      if (!a) return;
      e.preventDefault();
      if (menuOpen && burger) burger.click();
      open();
    }, true);
  }

  /* ---------- Formularz kontaktowy ---------- */
  function contactForm() {
    const form = $('[data-form]');
    if (!form) return;
    const el = (n) => form.elements.namedItem(n);
    const rules = {
      name: (v) => (v.trim().length >= 2 ? '' : 'Podaj swoje imię.'),
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Podaj poprawny adres e-mail.'),
      phone: (v) => (!v.trim() || /^[0-9 +()-]{9,}$/.test(v.trim()) ? '' : 'Sprawdź numer telefonu.'),
      message: (v) => (v.trim().length >= 10 ? '' : 'Napisz kilka słów (min. 10 znaków).'),
    };
    const check = (name) => {
      const input = el(name);
      const msg = rules[name](input.value);
      const field = input.closest('.field');
      field.classList.toggle('is-invalid', !!msg);
      $('.field__err', field).textContent = msg;
      input.setAttribute('aria-invalid', String(!!msg));
      return !msg;
    };
    const consent = el('consent');
    const checkConsent = () => {
      const ok = consent.checked;
      consent.closest('.check').classList.toggle('is-invalid', !ok);
      $('.field__err--consent', form).textContent = ok ? '' : 'Zaznacz zgodę, abyśmy mogli odpowiedzieć.';
      return ok;
    };
    Object.keys(rules).forEach((n) => {
      const input = el(n);
      input.addEventListener('blur', () => { if (input.value) check(n); });
      input.addEventListener('input', () => { if (input.closest('.field').classList.contains('is-invalid')) check(n); });
    });
    consent.addEventListener('change', checkConsent);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const results = Object.keys(rules).map((n) => [n, check(n)]);
      const okConsent = checkConsent();
      const bad = results.find(([, ok]) => !ok);
      if (bad || !okConsent) {
        (bad ? el(bad[0]) : consent).focus();
        if (hasGsap && !reduce) gsap.fromTo(form, { x: -8 }, { x: 0, duration: 0.6, ease: 'elastic.out(1,.3)' });
        return;
      }
      const topic = (form.querySelector('input[name="topic"]:checked') || {}).value || 'Pytanie';
      const body = [
        `Imię: ${el('name').value.trim()}`,
        `E-mail: ${el('email').value.trim()}`,
        el('phone').value.trim() ? `Telefon: ${el('phone').value.trim()}` : '',
        `Temat: ${topic}`,
        '',
        el('message').value.trim(),
      ].filter((l, i) => l !== '' || i === 4).join('\n');
      const href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(`Wiadomość ze strony: ${topic}`)}&body=${encodeURIComponent(body)}`;
      window.location.href = href;
      const ok = $('[data-form-ok]', form);
      ok.hidden = false;
      if (hasGsap && !reduce) gsap.fromTo(ok, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 });
      form.reset();
      if (hasGsap) ScrollTrigger.refresh();
    });
  }

  /* ---------- Mapa (ładowana po zgodzie) i kopiowanie e-maila ---------- */
  $$('[data-map-load]').forEach((b) => b.addEventListener('click', () => {
    const m = b.closest('[data-map]');
    const ifr = d.createElement('iframe');
    ifr.src = m.dataset.src;
    ifr.title = 'Mapa dojazdu do Studia Fryzur Aneta Kunc';
    ifr.loading = 'lazy';
    ifr.referrerPolicy = 'no-referrer-when-downgrade';
    ifr.allowFullscreen = true;
    m.setAttribute('data-lenis-prevent', '');
    m.appendChild(ifr);
    const c = $('.map__consent', m);
    if (hasGsap && !reduce) gsap.to(c, { opacity: 0, duration: 0.8, delay: 0.3, onComplete: () => c.remove() });
    else c.remove();
  }));

  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const txt = $('[data-copy-txt]', b);
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
    } catch (e) {
      const ta = d.createElement('textarea');
      ta.value = b.dataset.copy;
      d.body.appendChild(ta);
      ta.select();
      try { d.execCommand('copy'); } catch (err) { /* brak wsparcia */ }
      ta.remove();
    }
    b.classList.add('is-done');
    txt.textContent = 'Skopiowano';
    setTimeout(() => { b.classList.remove('is-done'); txt.textContent = 'Kopiuj'; }, 2200);
  }));

  $$('[data-totop]').forEach((b) => b.addEventListener('click', () => scrollToTarget(0)));

  /* ---------- Start ---------- */
  function initScroll() {
    if (!hasGsap) return;
    if (reduce) {
      gsap.set('[data-split], [data-hero-fade], [data-reveal-card], [data-reveal-row]', { opacity: 1 });
      gsap.set('[data-reveal]', { clipPath: 'none' });
      gsap.set('.hero__word', { yPercent: 0, y: 0 });
      stitch();
      headerTheme();
      priceTabs();
      return;
    }
    heroIntro();
    splitReveals();
    highlight();
    mediaReveals();
    parallax();
    cardsAndRows();
    counters();
    marquees();
    lines();
    processStrand();
    hscroll();
    stackCards();
    darkCards();
    dye();
    footerWord();
    headerTheme();
    priceTabs();
    waveHover();
    kineticCta();
    ScrollTrigger.refresh();
  }

  booking();

  const fontsReady = d.fonts && d.fonts.ready ? Promise.race([d.fonts.ready, new Promise((r) => setTimeout(r, 1800))]) : Promise.resolve();

  fontsReady.then(() => {
    const intro = html.classList.contains('is-entering') ? enterTransition() : preloader();
    if (!html.classList.contains('is-entering')) store.del('ak-pt');
    return intro;
  }).then(() => {
    initScroll();
    gallery();
    contactForm();
    if (location.hash && location.hash.length > 1) {
      const t = d.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (t) setTimeout(() => scrollToTarget(t, -(hdrH() + 70)), 150);
    }
  });

  window.addEventListener('load', () => hasGsap && ScrollTrigger.refresh());
})();
