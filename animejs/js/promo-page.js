const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const mixColor = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(' ')})`;

/** The page owns editorial color and media playback; the engine owns only the structure scene. */
export function createPromoPage() {
  const opening = document.getElementById('opening');
  const reading = document.getElementById('surface');
  const header = document.querySelector('.site-header');
  const structure = document.getElementById('structure');
  const steps = [...document.querySelectorAll('[data-structure-step]')];
  const progressBar = document.getElementById('structure-progress-bar');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let disposed = false;
  let activeStep = -1;

  function updatePage() {
    frame = 0;
    const height = innerHeight;
    const readingTop = reading.getBoundingClientRect().top;
    // Hero and reading share one background: there is no white section edge to reveal.
    const warmth = smooth((height * .82 - readingTop) / (height * .94));
    opening.style.backgroundColor = mixColor([8, 11, 15], [241, 238, 231], warmth);
    // Avoid blending ink through the same grey as its background during the inversion.
    const darkInk = warmth > .49;
    opening.style.setProperty('--reading-ink', darkInk ? '#292b2c' : '#f0f1f2');
    opening.style.setProperty('--reading-muted', darkInk ? '#4f504d' : '#e0e2e3');
    const footerTop = document.getElementById('open-source').getBoundingClientRect().top;
    const lightHeader = footerTop > 45 && (readingTop < 45 ? warmth > .62 : false);
    header.classList.toggle('is-light', lightHeader);
    const r = structure.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - height));
    progressBar.style.transform = `scaleX(${p})`;
    const step = p < .32 ? 0 : p < .72 ? 1 : 2;
    if (step !== activeStep) {
      activeStep = step;
      steps.forEach((el, i) => {
        el.classList.toggle('is-active', i === step);
        el.setAttribute('aria-hidden', String(i !== step));
      });
    }
  }
  function requestUpdate() { if (!frame && !disposed) frame = requestAnimationFrame(updatePage); }
  addEventListener('scroll', requestUpdate, { passive: true });
  addEventListener('resize', requestUpdate);
  updatePage();

  const players = [...document.querySelectorAll('[data-promo-video]')].map(video => {
    const toggle = document.querySelector(`[data-video-toggle="${video.id}"]`);
    const replay = document.querySelector(`[data-video-replay="${video.id}"]`);
    let visible = false;
    let requested = !reduced.matches;
    let completed = false;
    let pending = false;
    video.muted = true;
    video.loop = false;
    const sync = () => {
      const label = video.ended || completed ? '重播 ↺' : video.paused ? '播放短片' : '暂停 Ⅱ';
      if (toggle) {
        toggle.textContent = label;
        toggle.setAttribute('aria-label', `${video.getAttribute('aria-label')}：${label}`);
      }
      if (replay) replay.hidden = video.currentTime < .2 || completed;
    };
    const play = async () => {
      if (pending || !requested || !visible || document.hidden || completed) return;
      pending = true;
      try {
        await video.play();
        if (!visible || document.hidden || !requested) video.pause();
      } catch {
        // A browser autoplay restriction leaves an explicit play button and the poster.
      } finally { pending = false; sync(); }
    };
    const updateVisibility = () => {
      if (document.hidden || !visible || !requested) video.pause();
      else play();
    };
    const toggleClick = () => {
      if (completed || video.ended) { completed = false; video.currentTime = 0; }
      if (!video.paused) { requested = false; video.pause(); }
      else { requested = true; play(); }
      sync();
    };
    const replayClick = () => { completed = false; requested = true; video.currentTime = 0; play(); };
    const ended = () => { completed = true; requested = false; sync(); };
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .6;
      updateVisibility();
    }, { threshold: [0, .6, 1] });
    observer.observe(video);
    toggle?.addEventListener('click', toggleClick);
    replay?.addEventListener('click', replayClick);
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('timeupdate', sync);
    video.addEventListener('ended', ended);
    document.addEventListener('visibilitychange', updateVisibility);
    sync();
    return () => {
      observer.disconnect(); video.pause();
      toggle?.removeEventListener('click', toggleClick);
      replay?.removeEventListener('click', replayClick);
      video.removeEventListener('play', sync);
      video.removeEventListener('pause', sync);
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('ended', ended);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  });
  return {
    update: requestUpdate,
    destroy() {
      disposed = true; cancelAnimationFrame(frame);
      removeEventListener('scroll', requestUpdate);
      removeEventListener('resize', requestUpdate);
      players.forEach(destroy => destroy());
    },
  };
}
