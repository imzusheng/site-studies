/** Play the opening film once; retain its last frame and respect reading pauses. */
export function createHeroVideo() {
  const video = document.getElementById('hero-photograph');
  const toggle = document.getElementById('hero-play-toggle');
  const replay = document.getElementById('hero-replay');
  if (!(video instanceof HTMLVideoElement) || !toggle || !replay) return;
  const label = toggle.querySelector('.hero-play-label');
  const icon = toggle.querySelector('.hero-play-icon');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let wantsPlayback = !reduced.matches;
  let finished = false;
  let disposed = false;
  video.muted = true;
  video.loop = false;

  const sync = () => {
    const playing = !video.paused && !video.ended;
    toggle.setAttribute('aria-label', playing ? '暂停产品短片' : finished ? '重新播放产品短片' : '播放产品短片');
    if (label) label.textContent = playing ? '暂停' : finished ? '重播' : '播放';
    if (icon) icon.textContent = playing ? 'Ⅱ' : finished ? '↺' : '▶';
    replay.hidden = finished || video.currentTime < .2;
  };
  const play = async () => {
    if (!wantsPlayback || !visible || document.hidden || finished || disposed) return;
    try { await video.play(); }
    catch { wantsPlayback = false; sync(); }
    // The viewport may have changed while the play promise was pending.
    if (!visible || document.hidden || !wantsPlayback || disposed) video.pause();
  };
  const restart = () => {
    finished = false;
    video.currentTime = 0;
    wantsPlayback = true;
    play();
  };
  const onToggle = () => {
    if (!video.paused) { wantsPlayback = false; video.pause(); }
    else if (finished) restart();
    else { wantsPlayback = true; play(); }
  };
  const onEnded = () => { finished = true; wantsPlayback = false; sync(); };
  const onVisibility = () => { if (document.hidden) video.pause(); else play(); };
  const onReduced = () => { if (reduced.matches) { wantsPlayback = false; video.pause(); } };
  const onError = () => { wantsPlayback = false; video.pause(); sync(); };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= .12;
    if (visible) play(); else video.pause();
  }, { threshold: [0, .12] });
  observer.observe(video);
  toggle.addEventListener('click', onToggle);
  replay.addEventListener('click', restart);
  video.addEventListener('play', sync);
  video.addEventListener('pause', sync);
  video.addEventListener('timeupdate', sync);
  video.addEventListener('ended', onEnded);
  video.addEventListener('error', onError);
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onReduced);
  sync();
  return {
    destroy() {
      disposed = true;
      observer.disconnect();
      video.pause();
      toggle.removeEventListener('click', onToggle);
      replay.removeEventListener('click', restart);
      video.removeEventListener('play', sync);
      video.removeEventListener('pause', sync);
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onReduced);
    },
  };
}
