/* ==========================================================================
   Studio Fryzur Aneta Kunc — main.js
   GSAP + ScrollTrigger + SplitText, Lenis (smooth scroll), canvas „pasma”.
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

  /* ---------- Godziny otwarcia (strefa Europe/Warsaw) ---------- */
  const hours = (() => {
    try { return JSON.parse(d.body.dataset.hours || '{}'); } catch (e) { return {}; }
  })();
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const dayNames = ['w niedzielę', 'w poniedziałek', 'we wtorek', 'w środę', 'w czwartek', 'w piątek', 'w sobotę'];

  function warsawNow() {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      const get = (t) => (parts.find((p) => p.type === t) || {}).value;
      const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
      return { day, min: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
    } catch (e) {
      const n = new Date();
      return { day: n.getDay(), min: n.getHours() * 60 + n.getMinutes() };
    }
  }

  function openState() {
    const now = warsawNow();
    const today = hours[now.day];
    if (today && now.min >= toMin(today[0]) && now.min < toMin(today[1])) {
      return { open: true, text: `Otwarte · do ${today[1]}` };
    }
    if (today && now.min < toMin(today[0])) {
      return { open: false, text: `Zamknięte · otwieramy o ${today[0].replace(/^0/, '')}` };
    }
    for (let i = 1; i <= 7; i++) {
      const dd = (now.day + i) % 7;
      if (hours[dd]) {
        const when = i === 1 ? 'jutro' : dayNames[dd];
        return { open: false, text: `Zamknięte · otwieramy ${when} o ${hours[dd][0].replace(/^0/, '')}` };
      }
    }
    return { open: false, text: 'Zamknięte' };
  }

  function updateStatus() {
    const s = openState();
    $$('[data-status]').forEach((el) => {
      el.classList.toggle('is-open', s.open);
      el.classList.toggle('is-closed', !s.open);
      const t = $('[data-status-text]', el);
      if (t) t.textContent = s.text;
    });
    const now = warsawNow();
    $$('[data-hours] li').forEach((li) => li.classList.toggle('is-today', Number(li.dataset.day) === now.day));
  }
  updateStatus();
  setInterval(updateStatus, 60000);

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
        .fromTo('.menu__num', { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.06 }, '<0.2')
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

  /* ---------- Kursor i elementy „magnetyczne” ---------- */
  if (fine && hasGsap && !reduce) {
    html.classList.add('has-cursor');
    const cur = $('.cursor');
    const dot = $('.cursor__dot');
    const ring = $('.cursor__ring');
    const lab = $('[data-cursor-label]');
    const dx = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' });
    const dy = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
    const rx = gsap.quickTo(ring, 'x', { duration: 0.55, ease: 'power3' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.55, ease: 'power3' });
    gsap.set([dot, ring], { x: -100, y: -100 });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
      cur.classList.remove('is-hidden');
    }, { passive: true });
    d.addEventListener('pointerover', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const labelled = t.closest('[data-cursor]');
      const interactive = t.closest('a, button, label, input, textarea, select, [role="button"]');
      cur.classList.toggle('is-label', !!labelled);
      if (labelled) lab.textContent = labelled.dataset.cursor;
      cur.classList.toggle('is-hover', !!interactive && !labelled);
      cur.classList.toggle('is-dark', !!t.closest('.is-dark, .ftr, .menu.is-open, .lightbox, .stack-card--2, .tone--more'));
    });
    html.addEventListener('pointerleave', () => cur.classList.add('is-hidden'));
    d.addEventListener('pointerdown', () => gsap.to(ring, { scale: 0.8, duration: 0.2, ease: 'power2.out' }));
    d.addEventListener('pointerup', () => gsap.to(ring, { scale: 1, duration: 0.5, ease: 'elastic.out(1,.5)' }));

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
      .to(ptA, { scaleY: 1, duration: 0.75, ease: 'expo.inOut' })
      .to(ptB, { scaleY: 1, duration: 0.75, ease: 'expo.inOut' }, '-=0.6')
      .to(ptMark, { opacity: 1, duration: 0.3, ease: 'power2.out' }, '-=0.25');
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
        .to(ptMark, { opacity: 0, duration: 0.3, ease: 'power2.in' })
        .to(ptB, { scaleY: 0, duration: 0.95, ease: 'expo.inOut' })
        .to(ptA, { scaleY: 0, duration: 0.95, ease: 'expo.inOut' }, '-=0.8')
        .add(resolve, '-=0.65')
        .add(() => {
          html.classList.remove('is-entering');
          pt.classList.remove('is-active');
        });
    });
  }

  /* ---------- Preloader (pierwsza wizyta w sesji) ---------- */
  function preloader() {
    const loader = $('[data-loader]');
    const first = !html.classList.contains('is-return');
    store.set('ak-visited', '1');
    if (!loader) return Promise.resolve();
    if (!first || reduce || !hasGsap) { loader.remove(); return Promise.resolve(); }
    lenis && lenis.stop();
    const word = $('[data-loader-word]', loader);
    const count = $('[data-loader-count]', loader);
    const bar = $('[data-loader-bar]', loader);
    const chars = hasSplit ? SplitText.create(word, { type: 'chars' }).chars : [word];
    const o = { v: 0 };
    return new Promise((resolve) => {
      gsap.timeline({ onComplete: () => { loader.remove(); lenis && lenis.start(); } })
        .fromTo(chars, { yPercent: 115 }, { yPercent: 0, duration: 1.2, stagger: 0.045 })
        .to(o, { v: 100, duration: 1.7, ease: 'power2.inOut', onUpdate: () => { count.textContent = String(Math.round(o.v)); } }, 0)
        .to(bar, { scaleX: 1, duration: 1.7, ease: 'power2.inOut' }, 0)
        .to(chars, { yPercent: -115, duration: 0.7, stagger: 0.025, ease: 'expo.in' }, '+=0.15')
        .to(loader, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, '-=0.3')
        .add(resolve, '-=0.7');
    });
  }

  /* ---------- Canvas: animowane pasma włosów ---------- */
  function strands(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const colors = ['#2a1d16', '#7d5434', '#b98559', '#e8c39a'];
    let W = 0, H = 0, dpr = 1, list = [], grads = [], running = false, visible = true, raf = 0;
    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
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
        const n = Math.round((mobile ? 30 : 44) * (0.8 + rnd() * 0.4));
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
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (!running) draw(performance.now());
    }

    function draw(time) {
      const tt = time * 0.00011;
      mouse.x += (mouse.tx - mouse.x) * 0.07;
      mouse.y += (mouse.ty - mouse.y) * 0.07;
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
    }

    function loop(time) {
      draw(time);
      raf = requestAnimationFrame(loop);
    }
    function start() { if (running || reduce || !visible || d.hidden) return; running = true; raf = requestAnimationFrame(loop); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    new ResizeObserver(() => resize()).observe(canvas);
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); }).observe(canvas);
    d.addEventListener('visibilitychange', () => (d.hidden ? stop() : start()));
    window.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = e.clientX - r.left;
      mouse.ty = e.clientY - r.top;
      if (mouse.x < -9000) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
    }, { passive: true });
    resize();
    start();
  }
  $$('[data-strands]').forEach(strands);

  /* ---------- Animacje wejścia strony ---------- */
  function heroIntro() {
    if (!hasGsap || reduce) return;
    const hero = $('.hero');
    if (!hero) return;
    gsap.timeline()
      .fromTo('.hero__canvas', { opacity: 0 }, { opacity: 1, duration: 2.4, ease: 'power2.out' }, 0)
      .fromTo('.hero__word', { yPercent: 115, y: 0 }, { yPercent: 0, y: 0, duration: 1.5, stagger: 0.11 }, 0.05)
      .fromTo('[data-hero-fade]', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1.2, stagger: 0.07 }, 0.35);

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

  function mediaReveals() {
    $$('[data-reveal]').forEach((el) => {
      const img = $('img', el);
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
      tl.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.out' });
      if (img) {
        gsap.set(img, { transition: 'none' });
        tl.fromTo(img, { scale: 1.3 }, { scale: 1, duration: 1.9, ease: 'expo.out', onComplete: () => gsap.set(img, { clearProps: 'transform,transition,scale' }) }, 0);
      }
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
      gsap.ticker.add(() => {
        boost *= 0.93;
        tween.timeScale(dir * (1 + boost));
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

  function hoverPreview() {
    const list = $('[data-svc-list]');
    const prev = $('[data-hover-preview]');
    if (!list || !prev || !fine || reduce) return;
    const items = $$('[data-preview-item]', prev);
    const xTo = gsap.quickTo(prev, 'x', { duration: 0.75, ease: 'power3' });
    const yTo = gsap.quickTo(prev, 'y', { duration: 0.75, ease: 'power3' });
    const rTo = gsap.quickTo(prev, 'rotation', { duration: 0.9, ease: 'power3' });
    let lastX = 0;
    let active = null;
    let z = 1;
    // podgląd po prawej stronie kursora, żeby nie zasłaniał nazwy usługi
    const px = (x) => Math.min(x + 56, window.innerWidth - prev.offsetWidth - 24);
    list.addEventListener('pointermove', (e) => {
      xTo(px(e.clientX));
      yTo(e.clientY - prev.offsetHeight / 2);
      rTo(clamp((e.clientX - lastX) * 0.5, -10, 10));
      lastX = e.clientX;
    });
    $$('.svc-row', list).forEach((row) => {
      row.addEventListener('pointerenter', (e) => {
        if (!active) { gsap.set(prev, { x: px(e.clientX), y: e.clientY - prev.offsetHeight / 2 }); lastX = e.clientX; }
        const it = items.find((i) => i.dataset.previewItem === row.dataset.preview);
        gsap.to(prev, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'expo.out' });
        if (!it || it === active) return;
        it.style.zIndex = String(++z);
        gsap.fromTo(it, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, ease: 'expo.out' });
        gsap.fromTo($('img', it), { scale: 1.35 }, { scale: 1, duration: 1.1, ease: 'expo.out' });
        active = it;
      });
    });
    list.addEventListener('pointerleave', () => {
      gsap.to(prev, { autoAlpha: 0, scale: 0.85, duration: 0.45, ease: 'power3.out' });
      active = null;
    });
    gsap.set(prev, { scale: 0.85 });
  }

  function hscroll() {
    const hs = $('[data-hscroll]');
    if (!hs) return;
    const track = $('[data-hscroll-track]', hs);
    const bar = $('[data-hscroll-progress]', hs);
    const mm = gsap.matchMedia();
    mm.add('(min-width: 961px)', () => {
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
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
          onUpdate: (s) => bar && gsap.set(bar, { scaleX: s.progress }),
        },
      });
      $$('.tone', track).forEach((card, i) => {
        gsap.fromTo(card, { y: i % 2 ? 40 : -20 }, { y: i % 2 ? -40 : 20, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: tw, start: 'left right', end: 'right left', scrub: true } });
      });
    });
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
    chips.forEach((ch) => ch.addEventListener('click', () => {
      const f = ch.dataset.filter;
      chips.forEach((c) => { const on = c === ch; c.classList.toggle('is-active', on); c.setAttribute('aria-pressed', String(on)); });
      const apply = () => {
        items.forEach((it) => it.classList.toggle('is-hidden', f !== 'all' && it.dataset.cat !== f));
        if (hasGsap) ScrollTrigger.refresh();
      };
      if (!hasGsap || reduce) { apply(); return; }
      gsap.to(grid, {
        opacity: 0, y: 24, duration: 0.35, ease: 'power2.in',
        onComplete: () => {
          apply();
          $$('[data-reveal]', grid).forEach((m) => gsap.set(m, { clipPath: 'inset(0% 0% 0% 0%)' }));
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
      count.textContent = `${String(vis.indexOf(idx) + 1).padStart(2, '0')} / ${String(vis.length).padStart(2, '0')}`;
    };
    const open = (i) => {
      lastFocus = d.activeElement;
      idx = i;
      render();
      lb.hidden = false;
      lenis && lenis.stop();
      d.body.style.overflow = 'hidden';
      if (hasGsap && !reduce) {
        gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power2.out' });
        gsap.fromTo('.lightbox__fig', { y: 40, scale: 0.96 }, { y: 0, scale: 1, duration: 0.9 });
      }
      $('.lightbox__close', lb).focus();
    };
    const close = () => {
      const done = () => { lb.hidden = true; d.body.style.overflow = ''; lenis && lenis.start(); lastFocus && lastFocus.focus({ preventScroll: true }); };
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
      const href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(`Wiadomość ze strony — ${topic}`)}&body=${encodeURIComponent(body)}`;
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
    ifr.title = 'Mapa dojazdu — Studio Fryzur Aneta Kunc';
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
    hoverPreview();
    hscroll();
    stackCards();
    footerWord();
    headerTheme();
    priceTabs();
    ScrollTrigger.refresh();
  }

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
