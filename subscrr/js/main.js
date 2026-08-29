/* =========================================================
   Subscrr 复刻 — 动效引擎（零依赖，从零手写）
   预加载字标 / 自写平滑滚动 / 自定义光标 / 磁性按钮 /
   导航隐显 / 滚动 reveal / promo 缩放 / 视差 / 通知堆叠 /
   粒子标题 / Widgets 暖色 tint / 月年切换 / FAQ 手风琴 /
   Threads 逐字浮起 / 回到顶部
   ========================================================= */
(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- 预加载器：字标逐字弹出 ---------- */
  const loader = document.getElementById("loader");
  const startIntro = () => {
    document.body.classList.add("is-ready");
  };
  if (reduced) {
    loader.classList.add("done");
    startIntro();
  } else {
    requestAnimationFrame(() => loader.classList.add("in"));
    setTimeout(() => {
      loader.classList.add("done");
      startIntro();
    }, 1500);
  }

  /* ---------- 自写平滑滚动（桌面滚轮 lerp，触屏/降级不动） ---------- */
  const smooth = { target: window.scrollY, current: window.scrollY, active: false };
  if (finePointer && !reduced) {
    smooth.active = true;
    let writing = false;
    addEventListener("wheel", (e) => {
      if (e.ctrlKey) return; // 放大手势不劫持
      e.preventDefault();
      smooth.target = clamp(smooth.target + e.deltaY, 0, document.documentElement.scrollHeight - innerHeight);
    }, { passive: false });
    const tick = () => {
      const delta = smooth.target - smooth.current;
      if (Math.abs(delta) > 0.4) {
        writing = true;
        smooth.current = lerp(smooth.current, smooth.target, 0.105);
        window.scrollTo(0, smooth.current);
      } else if (writing) {
        writing = false;
      }
      // 用户用键盘/滚动条等其他方式滚动时重新同步
      if (!writing && Math.abs(window.scrollY - smooth.current) > 1.5) {
        smooth.current = smooth.target = window.scrollY;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__smoothTo = (y) => { smooth.target = clamp(y, 0, document.documentElement.scrollHeight - innerHeight); };
  } else {
    window.__smoothTo = (y) => window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
  }
  // 锚点拦截
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const el = document.querySelector(a.getAttribute("href"));
      if (!el) return;
      e.preventDefault();
      window.__smoothTo(el.getBoundingClientRect().top + window.scrollY - 90);
    });
  });

  /* ---------- 自定义光标 ---------- */
  if (finePointer && !reduced) {
    document.body.classList.add("has-cursor");
    const cur = document.getElementById("cursor");
    let cx = -100, cy = -100, tx = -100, ty = -100;
    addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });
    (function loop() {
      cx = lerp(cx, tx, 0.22); cy = lerp(cy, ty, 0.22);
      cur.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    })();
    document.querySelectorAll("[data-cursor]").forEach((el) => {
      el.addEventListener("mouseenter", () => cur.classList.add("is-hover"));
      el.addEventListener("mouseleave", () => cur.classList.remove("is-hover"));
    });
  }

  /* ---------- 磁性按钮 ---------- */
  if (finePointer && !reduced) {
    document.querySelectorAll(".magnetic").forEach((el) => {
      const strength = 0.32;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------- 导航隐显 + 滚动态 ---------- */
  const nav = document.getElementById("nav");
  const toTop = document.getElementById("toTop");
  let lastY = window.scrollY;
  const onScrollNav = () => {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 40);
    nav.classList.toggle("is-hidden", y > 140 && y > lastY + 2 && !nav.matches(":hover"));
    toTop.classList.toggle("is-on", y > 600);
    lastY = y;
  };
  addEventListener("scroll", onScrollNav, { passive: true });
  onScrollNav();
  toTop.addEventListener("click", () => window.__smoothTo(0));

  /* ---------- 滚动 reveal（上浮淡入 / 词组 / 步骤） ---------- */
  document.querySelectorAll("[data-words]").forEach((el) => {
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span");
            w.className = "word";
            const inner = document.createElement("span");
            inner.textContent = tok;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    };
    walk(el);
    el.querySelectorAll(".word > span").forEach((s, i) => { s.style.setProperty("--d", `${i * 0.028}s`); });
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      if (el.hasAttribute("data-reveal")) {
        el.classList.add("in-reveal");
        const sibs = el.parentElement ? [...el.parentElement.querySelectorAll("[data-reveal]")] : [];
        sibs.forEach((s, i) => { if (s !== el) s.style.setProperty("--d", `${Math.min(i * 0.08, 0.4)}s`); });
      }
      if (el.hasAttribute("data-words")) el.classList.add("in-words");
      if (el.id === "reminderCard") el.classList.add("is-in");
      if (el.classList.contains("faq__list")) {
        el.querySelectorAll(".import__steps li").forEach(() => {});
      }
      io.unobserve(el);
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll("[data-reveal], [data-words], #reminderCard").forEach((el) => io.observe(el));

  // Import 步骤胶囊逐个 blur-in
  const stepsIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.querySelectorAll("li").forEach((li, i) => {
        li.style.setProperty("--d", `${i * 0.14}s`);
        li.classList.add("in");
      });
      stepsIO.unobserve(en.target);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll(".import__steps").forEach((el) => stepsIO.observe(el));

  /* ---------- rAF 滚动引擎：promo 缩放 / 视差 / widgets tint ---------- */
  const promo = document.getElementById("promoMedia");
  const parallaxEls = [...document.querySelectorAll("[data-parallax]")];
  const widgetsSec = document.getElementById("widgetsAnchor");
  const bgTint = document.getElementById("bgTint");
  const rafScroll = () => {
    const vh = innerHeight;
    if (promo && !reduced) {
      const r = promo.getBoundingClientRect();
      const p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      promo.style.transform = `scale(${1 + p * 0.2})`;
    }
    if (!reduced) {
      parallaxEls.forEach((el) => {
        const r = el.getBoundingClientRect();
        const c = (r.top + r.height / 2 - vh / 2) / vh; // -0.5..0.5 附近
        const img = el.firstElementChild;
        if (img) img.style.transform = `translateY(${c * -7}%) scale(1.14)`;
      });
    }
    if (widgetsSec) {
      const r = widgetsSec.getBoundingClientRect();
      const p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      const bell = Math.sin(clamp(p * 2, 0, 1) * Math.PI); // 0→1→0
      bgTint.style.opacity = (bell * 0.85).toFixed(3);
    }
    requestAnimationFrame(rafScroll);
  };
  requestAnimationFrame(rafScroll);

  /* ---------- 粒子标题（点云 ⇄ 文字，点击打散/汇聚） ---------- */
  (() => {
    const wrap = document.getElementById("particleWrap");
    const title = document.getElementById("particleTitle");
    if (!wrap || !title) return;
    if (reduced) { title.classList.add("is-assembled"); return; }

    const canvas = document.createElement("canvas");
    canvas.className = "particle-canvas";
    wrap.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let parts = [], W = 0, H = 0, mode = "cloud", raf = 0;
    const GAP = 3.2;

    const sample = () => {
      const r = title.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = Math.ceil(r.width); H = Math.ceil(r.height);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 离屏栅格化标题文字
      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const octx = off.getContext("2d");
      const cs = getComputedStyle(title);
      octx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
      octx.textBaseline = "top";
      octx.fillStyle = "#fff";
      const lines = (title.dataset.lines || title.textContent).split("|");
      const lh = parseFloat(cs.fontSize) * 1.04;
      lines.forEach((ln, i) => octx.fillText(ln.trim(), 0, i * lh + 2));

      const data = octx.getImageData(0, 0, W, H).data;
      parts = [];
      for (let y = 0; y < H; y += GAP) {
        for (let x = 0; x < W; x += GAP) {
          if (data[(y * W + x) * 4 + 3] > 128) {
            parts.push({
              x: Math.random() * W, y: Math.random() * H,
              tx: x, ty: y,
              s: 0.9 + Math.random() * 1.1,
              j: Math.random() * Math.PI * 2,
            });
          }
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const t = performance.now() / 1000;
      for (const p of parts) {
        if (mode === "cloud") {
          p.x = lerp(p.x, p.tx + Math.cos(t * 0.9 + p.j) * 60 + (p.tx - W / 2) * 0.35 + W / 2, 0.045);
          p.y = lerp(p.y, p.ty + Math.sin(t * 1.1 + p.j) * 40 + (p.ty - H / 2) * 0.3 + H / 2, 0.045);
        } else {
          p.x = lerp(p.x, p.tx + Math.cos(t * 2 + p.j) * 0.6, 0.14);
          p.y = lerp(p.y, p.ty + Math.sin(t * 2 + p.j) * 0.6, 0.14);
        }
        ctx.globalAlpha = mode === "cloud" ? 0.75 : 0.95;
        ctx.fillStyle = "#ff2500";
        ctx.fillRect(p.x, p.y, p.s, p.s);
      }
      raf = requestAnimationFrame(draw);
    };

    const setMode = (m) => {
      mode = m;
      title.classList.toggle("is-cloud", m === "cloud");
      title.classList.toggle("is-assembled", m === "text");
    };

    sample();
    setMode("cloud");
    draw();

    // 首次进入视口汇聚
    const seen = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { setTimeout(() => setMode("text"), 500); seen.disconnect(); } });
    }, { threshold: 0.5 });
    seen.observe(wrap);

    // 点击打散 / 汇聚
    wrap.addEventListener("click", () => setMode(mode === "text" ? "cloud" : "text"));

    let rsz;
    addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { cancelAnimationFrame(raf); sample(); draw(); }, 200); });
  })();

  /* ---------- AI 金额计数 + 类别条循环 ---------- */
  (() => {
    const amt = document.getElementById("aiAmt");
    const items = document.getElementById("aiItems");
    const ui = document.querySelector(".ai-ui");
    if (!amt || !ui) return;
    let live = false, timer = 0;
    const run = () => {
      if (!live || reduced) return;
      ui.classList.remove("is-live");
      const t0 = performance.now(), D = 1500, target = 340;
      const step = (t) => {
        const p = clamp((t - t0) / D, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        amt.textContent = (target * e).toFixed(2) + " $";
        if (p < 1) requestAnimationFrame(step);
        else {
          items.textContent = "5";
          ui.classList.add("is-live");
          timer = setTimeout(run, 5200);
        }
      };
      items.textContent = "0";
      requestAnimationFrame(step);
    };
    new IntersectionObserver((es) => {
      es.forEach((e) => {
        live = e.isIntersecting;
        if (live) run(); else clearTimeout(timer);
      });
    }, { threshold: 0.4 }).observe(ui);
  })();

  /* ---------- Pricing 月/年切换 ---------- */
  (() => {
    const toggle = document.getElementById("toggle");
    if (!toggle) return;
    const thumb = toggle.querySelector(".toggle__thumb");
    const opts = [...toggle.querySelectorAll(".toggle__opt")];
    const amt = document.getElementById("planAmt");
    const per = document.getElementById("planPer");
    const note = document.getElementById("planNote");
    const data = {
      monthly: { amt: "$7.99", per: "/mo", note: "Billed monthly. Cancel anytime." },
      yearly: { amt: "$29.99", per: "/yr", note: "$2.50 a month, billed yearly. Cancel anytime." },
    };
    const moveThumb = (btn) => {
      thumb.style.width = btn.offsetWidth + "px";
      thumb.style.transform = `translateX(${btn.offsetLeft - 5}px)`;
    };
    const setPlan = (key, btn) => {
      opts.forEach((o) => {
        o.classList.toggle("is-active", o === btn);
        o.setAttribute("aria-selected", o === btn ? "true" : "false");
      });
      moveThumb(btn);
      amt.classList.remove("swap");
      void amt.offsetWidth; // 重触发动画
      amt.textContent = data[key].amt;
      per.textContent = data[key].per;
      note.textContent = data[key].note;
      amt.classList.add("swap");
    };
    opts.forEach((o) => o.addEventListener("click", () => setPlan(o.dataset.plan, o)));
    requestAnimationFrame(() => moveThumb(opts[0]));
    addEventListener("resize", () => moveThumb(toggle.querySelector(".is-active")));
  })();

  /* ---------- FAQ 手风琴（高度动画） ---------- */
  document.querySelectorAll(".qa").forEach((d) => {
    const summary = d.querySelector("summary");
    const body = document.createElement("div");
    body.className = "qa__body";
    while (summary.nextElementSibling) body.appendChild(summary.nextElementSibling);
    d.appendChild(body);
    body.style.height = d.open ? "auto" : "0px";
    summary.addEventListener("click", (e) => {
      e.preventDefault();
      if (d.open) {
        body.style.height = body.scrollHeight + "px";
        requestAnimationFrame(() => {
          body.style.transition = "height 0.4s var(--ease)";
          body.style.height = "0px";
        });
        setTimeout(() => { d.open = false; }, 380);
      } else {
        d.open = true;
        body.style.transition = "height 0.45s var(--ease)";
        body.style.height = "0px";
        requestAnimationFrame(() => { body.style.height = body.scrollHeight + "px"; });
        setTimeout(() => { body.style.height = "auto"; body.style.transition = ""; }, 460);
      }
    });
  });

  /* ---------- Threads 标题逐字浮起（入场播放，悬停重播） ---------- */
  document.querySelectorAll("[data-chars]").forEach((el) => {
    const text = el.textContent;
    el.textContent = "";
    [...text].forEach((ch, i) => {
      const s = document.createElement("span");
      s.className = "threads__char";
      s.textContent = ch;
      s.style.setProperty("--i", i);
      el.appendChild(s);
    });
  });
  const threadsCard = document.querySelector(".threads__card");
  if (threadsCard) {
    const chars = threadsCard.querySelectorAll(".threads__char");
    const playChars = () => {
      chars.forEach((s) => {
        s.style.transition = "none";
        s.style.opacity = "0";
        s.style.transform = "translateY(0.35em)";
        s.style.filter = "blur(8px)";
      });
      void threadsCard.offsetWidth;
      chars.forEach((s) => {
        s.style.transition = `transform 0.55s var(--spring) calc(var(--i) * 30ms), opacity 0.45s calc(var(--i) * 30ms), filter 0.5s calc(var(--i) * 30ms)`;
        s.style.opacity = "1";
        s.style.transform = "none";
        s.style.filter = "blur(0)";
      });
    };
    new IntersectionObserver((es, ob) => {
      es.forEach((e) => { if (e.isIntersecting) { playChars(); ob.disconnect(); } });
    }, { threshold: 0.35 }).observe(threadsCard);
    threadsCard.addEventListener("mouseenter", playChars);
  }

  /* ---------- Promo 声音开关（WebAudio 轻环境音） ---------- */
  (() => {
    const btn = document.getElementById("promoSound");
    if (!btn) return;
    let ac = null, nodes = null;
    const start = () => {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const g = ac.createGain();
      g.gain.value = 0.05;
      const o1 = ac.createOscillator(); o1.type = "sine"; o1.frequency.value = 220;
      const o2 = ac.createOscillator(); o2.type = "sine"; o2.frequency.value = 277.2;
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.15;
      const lg = ac.createGain(); lg.gain.value = 0.02;
      lfo.connect(lg); lg.connect(g.gain);
      o1.connect(g); o2.connect(g); g.connect(ac.destination);
      o1.start(); o2.start(); lfo.start();
      nodes = [o1, o2, lfo, g];
    };
    btn.addEventListener("click", () => {
      const on = btn.classList.toggle("is-on");
      if (on) start(); else if (nodes) { nodes.forEach((n) => { try { n.stop ? n.stop() : n.disconnect(); } catch {} }); nodes = null; }
    });
  })();
})();
