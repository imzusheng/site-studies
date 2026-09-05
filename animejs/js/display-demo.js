/** Sandboxed embed of the product repository's actual Issue #26 UI prototype. */
export function createDisplayDemo() {
  const frames = [...document.querySelectorAll('iframe[data-luma-demo]')];
  const cleanups = [];
  const send = (frame, action, value) => frame.contentWindow?.postMessage({ type: 'luma-demo-command', action, value }, '*');
  for (const frame of frames) {
    const section = frame.closest('section');
    const status = section.querySelector('[data-demo-status]');
    for (const button of section.querySelectorAll('[data-demo-action]')) {
      const handler = () => {
        const raw = button.dataset.demoValue;
        const value = raw && /^-?\d+$/.test(raw) ? Number(raw) : raw;
        send(frame, button.dataset.demoAction, value);
        if (button.dataset.demoAction === 'tour') {
          section.querySelectorAll('[data-demo-action="tour"]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        }
        const dial = section.querySelector('.demo-dial');
        if (dial && button.dataset.demoAction === 'rotate') {
          dial.dataset.angle = String(Number(dial.dataset.angle || 0) + Number(value) * 24);
          dial.style.setProperty('--dial-angle', `${dial.dataset.angle}deg`);
        }
      };
      button.addEventListener('click', handler);
      cleanups.push(() => button.removeEventListener('click', handler));
    }
    const receive = event => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === 'luma-demo-ready' && frame.dataset.initialTour) send(frame, 'tour', frame.dataset.initialTour);
      if (event.data?.type !== 'luma-demo-state' || !status) return;
      const { mode, editing } = event.data;
      status.textContent = editing ? `正在调节 · 旋转改变数值，按下完成` : mode === 'detail' ? '灯光详情 · 旋转选择，按下进入' : mode === 'presets' ? '全局预设 · 旋转选择，按下执行' : '灯光首页 · 旋转选灯，按下进入';
    };
    window.addEventListener('message', receive);
    cleanups.push(() => window.removeEventListener('message', receive));
  }
  return () => cleanups.forEach(fn => fn());
}
