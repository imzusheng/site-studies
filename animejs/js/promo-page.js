const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };

/** The page owns editorial color and media playback; the engine owns only the structure scene. */
export function createPromoPage() {
  const hero = document.getElementById('teaser');
  const heroWindow = document.querySelector('.hero-window');
  const header = document.querySelector('.site-header');
  const structure = document.getElementById('structure');
  const stage = document.getElementById('engine-stage');
  const steps = [...document.querySelectorAll('[data-structure-panel]')];
  const progressBar = document.getElementById('structure-progress-bar');
  const chapterLabel = document.getElementById('structure-chapter');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let disposed = false;
  let activeStep = -1;

  function updatePage() {
    frame = 0;
    const height = innerHeight;
    const heroBounds = hero.getBoundingClientRect();
    const heroProgress = clamp(-heroBounds.top / Math.max(1, heroBounds.height - height));
    const shrink = reduced.matches ? 0 : smooth((heroProgress - .30) / .60);
    heroWindow.style.setProperty('--hero-inset', `${shrink * Math.min(innerWidth * .045, 72)}px`);
    heroWindow.style.setProperty('--hero-radius', `${shrink * 24}px`);
    const r = structure.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - height));
    progressBar.style.transform = `scaleX(${p})`;
    const step = Math.min(3, Math.floor(p * 4));
    if (step !== activeStep) {
      activeStep = step;
      steps.forEach((el, i) => {
        el.classList.toggle('is-active', i === step);
        el.setAttribute('aria-hidden', String(i !== step));
      });
      if (chapterLabel) chapterLabel.textContent = `${String(step + 1).padStart(2, '0')} / 04`;
    }
    const beneathHeader = (id) => {
      const rect = document.getElementById(id)?.getBoundingClientRect();
      return rect && rect.top <= 50 && rect.bottom > 50;
    };
    const darkHeader = (beneathHeader('teaser') && shrink < .55) || beneathHeader('colors') || beneathHeader('material') || beneathHeader('chassis') || beneathHeader('interior') || beneathHeader('open-source') || (beneathHeader('structure') && stage.dataset.sceneTone === 'dark');
    header.classList.toggle('is-light', !darkHeader);
  }
  function requestUpdate() { if (!frame && !disposed) frame = requestAnimationFrame(updatePage); }
  let lastTone = stage.dataset.sceneTone;
  const toneObserver = new MutationObserver(() => {
    if (lastTone === stage.dataset.sceneTone) return;
    lastTone = stage.dataset.sceneTone;
    requestUpdate();
  });
  toneObserver.observe(stage, { attributes: true, attributeFilter: ['data-scene-tone'] });
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
      toneObserver.disconnect();
      removeEventListener('scroll', requestUpdate);
      removeEventListener('resize', requestUpdate);
      players.forEach(destroy => destroy());
    },
  };
}
