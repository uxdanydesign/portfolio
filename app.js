(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  /* ---------- 1. Quitar el badge "Made in Webflow" (por si algún script lo vuelve a crear) ---------- */
  const killBadge = () => $$('.w-webflow-badge, a[href*="utm_campaign=brandjs"]').forEach((e) => e.remove());
  killBadge();
  new MutationObserver(killBadge).observe(document.body, { childList: true });

  /* ---------- 2. Scroll suave ---------- */
  const lenis = window.Lenis
    ? new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) })
    : null;
  if (lenis) {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  const toTop = () => { window.scrollTo(0, 0); lenis && lenis.scrollTo(0, { immediate: true, force: true }); };

  /* ---------- 3. Reloj en vivo (hora de CDMX, formato 24 h: medianoche = 00:09:12, mediodía = 12:09:12) ---------- */
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const timeStr = () => fmt.format(new Date());
  // Busca [data-clock]. Si la página no lo trae, se lo pone al segundo texto del primer bloque del footer
  // (la hora), así funciona aunque entres directo a un case study.
  const clockEls = () => {
    let els = $$('[data-clock]');
    if (!els.length) {
      const el = $('.footer-contentdiv:not(.rightleft) .text-body:nth-child(2)');
      if (el) { el.setAttribute('data-clock', ''); els = [el]; }
    }
    return els;
  };
  const tick = () => { const t = timeStr(); clockEls().forEach((el) => { if (el.textContent !== t) el.textContent = t; }); };
  tick();
  setInterval(tick, 1000);

  /* ---------- 4. Título al cambiar de pestaña ---------- */
  let savedTitle = document.title;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { savedTitle = document.title; document.title = 'Come back Bob :('; }
    else document.title = savedTitle;
  });

  /* ---------- 5. Cursor personalizado ---------- */
  // El estado depende de lo que hay bajo el mouse en cada mousemove (no de mouseover/mouseout, que no se
  // disparan cuando el elemento desaparece al cambiar de página). Durante una transición se bloquea.
  const cursor = $('.custom-cursor'), cursorText = $('.cursor-text');
  const canCursor = matchMedia('(hover: hover) and (min-width: 992px)');
  const cursorCtl = { lock() {}, unlock() {} };
  if (cursor) {
    let mx = 0, my = 0, cx = 0, cy = 0, hover = false, busy = false, muted = null;
    const show = (el) => {
      hover = true;
      if (cursorText && cursorText.textContent !== el.dataset.cursor) cursorText.textContent = el.dataset.cursor;
      cursor.classList.add('is-visible');
    };
    const hide = () => { hover = false; cursor.classList.remove('is-visible'); };
    addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      const el = canCursor.matches && !busy ? e.target.closest('[data-cursor]') : null;
      if (!el) { muted = null; hide(); }
      else if (el === muted) hide();   // tras un clic, no reaparece sobre el mismo elemento
      else show(el);
    });
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-cursor]');
      if (el) { muted = el; hide(); }
    });
    document.documentElement.addEventListener('mouseleave', hide);
    addEventListener('blur', hide);
    cursorCtl.lock = () => { busy = true; hide(); };
    cursorCtl.unlock = () => { busy = false; };
    const loop = () => {
      cx += (mx - cx) * 0.1; cy += (my - cy) * 0.1;
      const off = 20, w = cursor.offsetWidth;
      const xo = cx + w + off > innerWidth ? -(w + off) : off;
      cursor.style.transform = `translate3d(${cx + xo}px, ${cy + off}px, 0) scale(${hover ? 1 : 0.8})`;
      requestAnimationFrame(loop);
    };
    loop();
  }

  /* ---------- 7. Reproductor: el audio vive en el shell (no se corta al cambiar de página) ---------- */
  const SONGS = 'https://raw.githubusercontent.com/uxdanydesign/songs/main/';
  /* Para agregar una canción: sube el mp3 al repo 'songs' y agrega una línea aquí.
     file = nombre exacto del archivo (con espacios, sin %20). La portada se busca sola en covers/<nombre-en-minusculas-con-guiones>.webp */
  const playlist = [
    { name: 'Pray to God', artists: ['Calvin Harris'], file: 'Calvin Harris - Pray to God (feat. HAIM).mp3' },
    { name: 'Ma stasera', artists: ['Marco Mengoni'], file: 'Marco Mengoni - Ma stasera.mp3' },
    { name: 'la pluie', artists: ['Louane'], file: 'Louane - la pluie.mp3' },
    { name: '#BrooklynBloodPop!', artists: ['Syko'], file: 'Syko - #BrooklynBloodPop!.mp3' },
    { name: 'Wenn ich will', artists: ['CÉLINE'], file: 'CÉLINE - Wenn ich will.mp3' },
  ];
  const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const coverOf = (s) => s.cover || 'covers/' + slug(s.name) + '.webp';
  const urlOf = (s) => s.url || SONGS + encodeURIComponent(s.file);
  const RESPECT_REDUCED_MOTION = false; // true = el marquee no se anima si el sistema pide menos movimiento
  const MQ = { delay: 800, gap: 2.5, pps: 2.5 }; // gap y velocidad en em (40px y 40px/s a 16px)

  // Marquee (mismo comportamiento que MarqueeText de la app): si el texto no cabe, espera, se desplaza,
  // muestra una copia tras un espacio amplio y vuelve al inicio. Sin overflow: sin máscara ni animación.
  const marquee = (el, text) => {
    el.__stop && el.__stop();
    const track = el.firstElementChild;
    track.textContent = '';
    track.style.transform = '';
    el.classList.remove('is-overflow', 'is-scrolling');
    const a = document.createElement('span');
    a.className = 'marquee__t'; a.textContent = text;
    track.appendChild(a);
    let dead = false, anim = null, t1 = 0, t2 = 0;
    el.__stop = () => { dead = true; clearTimeout(t1); clearTimeout(t2); anim && anim.cancel(); };
    const w = Math.ceil(a.getBoundingClientRect().width);
    if (!(w > el.clientWidth)) return;
    if (RESPECT_REDUCED_MOTION && reduced) { el.classList.add('is-overflow'); return; }
    const u = Math.max(parseFloat(getComputedStyle(document.body).fontSize) || 16, 16);
    const gap = MQ.gap * u, dist = w + gap, dur = (dist / (MQ.pps * u)) * 1000;
    const b = a.cloneNode(true);
    b.setAttribute('aria-hidden', 'true'); b.style.marginLeft = gap + 'px';
    track.appendChild(b);
    el.classList.add('is-overflow');
    const cycle = () => {
      if (dead || !el.isConnected) return;
      el.classList.remove('is-scrolling');
      t1 = setTimeout(() => {
        if (dead || !el.isConnected) return;
        el.classList.add('is-scrolling');
        anim = track.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-dist}px)` }],
          { duration: dur, easing: 'linear', fill: 'forwards' });
        t2 = setTimeout(() => el.classList.remove('is-scrolling'), dur * (w / dist));
        anim.onfinish = () => { anim.cancel(); cycle(); };
      }, MQ.delay);
    };
    cycle();
  };

  const audio = new Audio();
  audio.preload = 'metadata';
  let idx = Math.min(parseInt(localStorage.getItem('music_index')) || 0, playlist.length - 1);
  const savedTime = parseFloat(localStorage.getItem('music_time')) || 0;

  // Pinta todas las instancias del reproductor que existan en la página actual
  const renderPlayers = (root = document) => {
    const s = playlist[idx], on = !audio.paused, artists = s.artists.join(', ');
    $$('.player', root).forEach((p) => {
      p.classList.toggle('is-playing', on);
      $('[data-player="toggle"]', p).setAttribute('aria-label', (on ? 'Pause: ' : 'Play: ') + s.name + ' – ' + artists);
      const img = $('.player__cover-img', p);
      const cv = coverOf(s);
      if (img.getAttribute('src') !== cv) { img.style.visibility = ''; img.setAttribute('src', cv); }
      img.onerror = () => { img.style.visibility = 'hidden'; };
      $$('.marquee', p).forEach((m) => {
        const tx = m.dataset.marquee === 'title' ? s.name : artists;
        if (m.dataset.text !== tx) { m.dataset.text = tx; marquee(m, tx); }
      });
    });
  };
  const load = (n) => { idx = n; audio.src = urlOf(playlist[idx]); renderPlayers(); };
  const next = () => { load((idx + 1) % playlist.length); audio.play().catch(() => {}); };

  load(idx);
  if (savedTime) audio.addEventListener('loadedmetadata', () => { audio.currentTime = savedTime; }, { once: true });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-player]');
    if (!b) return;
    if (b.dataset.player === 'next') next();
    else audio.paused ? audio.play().catch(() => {}) : audio.pause();
  });
  audio.addEventListener('play', () => renderPlayers());
  audio.addEventListener('pause', () => renderPlayers());
  audio.addEventListener('ended', next);
  setInterval(() => { localStorage.setItem('music_time', audio.currentTime); localStorage.setItem('music_index', idx); }, 500);

  /* ---------- 7b. Timeline del reproductor ----------
     Línea de progreso por defecto + slider (hover en desktop, tap en móvil). El markup se inyecta aquí,
     así que no hay que tocar el HTML de las páginas. Todo el movimiento va con transform (sin layout)
     y el loop de rAF solo corre mientras suena la canción. */
  (() => {
    const player = $('.player'), info = player && $('.player__info', player);
    if (!player || !info) return;
    info.insertAdjacentHTML('beforeend',
      '<div class="player__line" aria-hidden="true"><div class="player__line-fill"></div></div>' +
      '<div class="player__seek">' +
        '<div class="player__times" aria-hidden="true"><span data-time="cur">0:00</span><span data-time="dur">0:00</span></div>' +
        '<div class="player__slider" role="slider" tabindex="0" aria-label="Song timeline" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">' +
          '<div class="player__track"><div class="player__fill"></div></div>' +
          '<div class="player__thumb"></div>' +
        '</div>' +
      '</div>');
    const lineFill = $('.player__line-fill', info), curEl = $('[data-time="cur"]', info), durEl = $('[data-time="dur"]', info);
    const slider = $('.player__slider', info), fill = $('.player__fill', info), thumb = $('.player__thumb', info);

    const fmtT = (s) => { s = Math.max(0, Math.floor(s) || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const dur = () => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    const st = { hover: false, tap: false, focus: false, drag: false };
    let W = 0, D = 0, raf = 0, shown = false, lastSec = -1, lastDur = -1, seekAt = 0, rectL = 0, rectW = 1, dragP = 0;

    // Pinta línea + slider. El slider solo se actualiza cuando está visible.
    const draw = () => {
      const d = dur(), t = st.drag ? dragP * d : audio.currentTime;
      const p = d ? Math.min(1, Math.max(0, t / d)) : 0;
      lineFill.style.transform = 'translate3d(' + (p - 1) * 100 + '%,0,0)';
      if (shown) {
        const x = D / 2 + p * (W - D); // el círculo nunca se sale de la barra
        fill.style.transform = 'translate3d(' + (x - W) + 'px,0,0)';
        thumb.style.transform = 'translate3d(' + (x - D / 2) + 'px,0,0)';
      }
      const sec = Math.floor(t);
      if (sec !== lastSec) { lastSec = sec; curEl.textContent = fmtT(t); slider.setAttribute('aria-valuenow', sec); }
      if (d !== lastDur) { lastDur = d; durEl.textContent = fmtT(d); slider.setAttribute('aria-valuemax', Math.floor(d)); }
    };
    const measure = () => { W = slider.clientWidth; D = thumb.offsetWidth; draw(); };
    const sync = () => {
      const v = st.hover || st.tap || st.focus || st.drag;
      if (v === shown) return;
      shown = v; player.classList.toggle('is-seek', v);
      if (v) measure();
    };
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(measure); ro.observe(slider); ro.observe(thumb); }
    measure();

    // Reproducción: rAF solo mientras suena; en pausa se redibuja con los eventos del audio
    const loop = () => { draw(); raf = audio.paused ? 0 : requestAnimationFrame(loop); };
    audio.addEventListener('play', () => { if (!raf) raf = requestAnimationFrame(loop); });
    ['pause', 'seeked', 'durationchange', 'loadedmetadata', 'emptied', 'ended'].forEach((ev) => audio.addEventListener(ev, draw));

    // Arrastrar: el círculo sigue al dedo/mouse al instante (usa dragP, no el audio) y el audio se mueve
    // cada ~80ms mientras arrastras y de forma exacta al soltar
    const ratio = (x) => Math.min(1, Math.max(0, (x - rectL - D / 2) / Math.max(1, rectW - D)));
    const seek = (force) => {
      const now = performance.now();
      if (force || now - seekAt > 80) { seekAt = now; audio.currentTime = dragP * dur(); }
    };
    slider.addEventListener('pointerdown', (e) => {
      if (!dur() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const r = slider.getBoundingClientRect(); rectL = r.left; rectW = r.width;
      st.drag = true; dragP = ratio(e.clientX);
      slider.setPointerCapture(e.pointerId);
      e.preventDefault();
      seek(true); draw(); sync();
    });
    slider.addEventListener('pointermove', (e) => {
      if (!st.drag) return;
      dragP = ratio(e.clientX); seek(false); draw();
    });
    const endDrag = () => {
      if (!st.drag) return;
      seek(true); st.drag = false; draw(); sync();
    };
    slider.addEventListener('pointerup', endDrag);
    slider.addEventListener('pointercancel', endDrag);

    // Desktop: hover sobre todo el componente
    player.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { st.hover = true; sync(); } });
    player.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { st.hover = false; sync(); } });
    // Móvil: tap en el componente (menos play/next) lo activa; tap o scroll fuera lo desactiva
    player.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch' && !e.target.closest('[data-player]')) { st.tap = true; sync(); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (st.tap && !player.contains(e.target)) { st.tap = false; sync(); }
    }, { passive: true });
    addEventListener('scroll', () => { if (st.tap && !st.drag) { st.tap = false; sync(); } }, { passive: true });

    // Teclado
    slider.addEventListener('focus', () => { st.focus = slider.matches(':focus-visible'); sync(); });
    slider.addEventListener('blur', () => { st.focus = false; sync(); });
    slider.addEventListener('keydown', (e) => {
      const d = dur(); if (!d) return;
      const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
      if (step !== undefined) audio.currentTime = Math.min(d, Math.max(0, audio.currentTime + step));
      else if (e.key === 'Home') audio.currentTime = 0;
      else if (e.key === 'End') audio.currentTime = Math.max(0, d - 0.5);
      else return;
      e.preventDefault(); draw();
    });

    draw();
  })();

  const remeasure = () => $$('.marquee').forEach((m) => m.dataset.text && marquee(m, m.dataset.text));
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(remeasure, 150); });
  document.fonts && document.fonts.ready.then(remeasure);

  /* ---------- Videos: reproducir solo en pantalla ---------- */
  const inView = new Set();
  const playIfVisible = (v) => { if (inView.has(v) && !document.hidden) v.play().catch(() => {}); };
  const videoIO = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
        if (isIntersecting) { inView.add(v); playIfVisible(v); }
        else { inView.delete(v); v.pause(); }
      }), { threshold: 0.25 })
    : null;
  // Limpia los videos de una página que ya salió (Barba)
  const dropVideos = () => inView.forEach((v) => {
    if (!v.isConnected) { videoIO && videoIO.unobserve(v); inView.delete(v); v.pause(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) inView.forEach((v) => v.pause());
    else inView.forEach(playIfVisible);
  });

  /* ---------- 8. Inicialización de cada página (carga inicial y después de cada transición) ---------- */
  const initPage = (root) => {
    // Videos: solo se reproducen mientras están a la vista (se pausan al salir de pantalla o de la pestaña)
    dropVideos();
    $$('video', root).forEach((v) => {
      v.removeAttribute('autoplay'); v.autoplay = false;
      v.muted = true; v.loop = true; v.playsInline = true;
      v.pause();
      videoIO ? videoIO.observe(v) : v.play().catch(() => {});
    });
    renderPlayers(root);
    // Link "inicio" del nav (persistente entre páginas): marcarlo como actual solo en Home
    const holder = root.dataset && root.dataset.barbaNamespace ? root : $('[data-barba-namespace]');
    const ns = holder && holder.dataset.barbaNamespace;
    if (ns) $$('.nav a[href="/"]').forEach((a) => {
      a.classList.toggle('w--current', ns === 'home');
      ns === 'home' ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    lenis && lenis.resize();
  };

  /* ---------- 9. Single Page: Barba + GSAP (transición: fade, igual que antes) ---------- */
  const dy = () => (parseFloat(getComputedStyle(document.body).fontSize) || 16) * 2; // 2em
  const fade = {
    name: 'fade',
    leave: ({ current }) => gsap.to(current.container, { opacity: 0, y: dy(), duration: 0.5, ease: 'power1.inOut' }),
    enter: ({ current, next }) => {
      // Barba mantiene el contenedor anterior en el DOM durante enter: si ocupa espacio, el nuevo
      // se anima fuera de pantalla (debajo) y parece que aparece de golpe.
      if (current && current.container) current.container.style.display = 'none';
      toTop();
      return gsap.fromTo(next.container, { opacity: 0, y: dy() },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power1.inOut', clearProps: 'opacity,transform' });
    },
  };

  if (window.barba) {
    barba.init({
      prevent: ({ el }) => (el.getAttribute('href') || '').startsWith('#'),
      transitions: [fade],
    });
    barba.hooks.before(() => cursorCtl.lock());
    barba.hooks.after(() => cursorCtl.unlock());
    barba.hooks.afterLeave(dropVideos);
    barba.hooks.after((data) => initPage(data.next.container));
  }
  initPage(document);

  /* ---------- 10. Entrada inicial (si no hay loader, la maneja el loader del Home) ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const c = $('.container');
    if (c && !$('.loader-wrapper')) requestAnimationFrame(() => c.classList.add('transition-active'));
  });
  if (document.readyState !== 'loading') { const c = $('.container'); c && !$('.loader-wrapper') && c.classList.add('transition-active'); }
})();
