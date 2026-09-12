namespace Rally {
    export const $ = (id: string) => document.getElementById(id)!;
    export class UI {
        overlay = '';
        lastFocus: HTMLElement | null = null;
        constructor(public g: Game) {
            g.ui = this;
            const on = (id: string, fn: () => void) => $(id).addEventListener('click', fn);
            on('start', () => g.start(0));
            on('start-match', () => g.start(0, true));
            on('nav-warm', () => g.start(0));
            on('nav-drills', () => this.open('drills'));
            on('nav-match', () => g.start(0, true));
            on('change-drill', () => this.open('drills'));
            on('tune', () => this.open('tune'));
            on('settings', () => this.open('settings'));
            on('pause', () => this.togglePause());
            on('scrim', () => this.closeOverlay());
            on('sound', () => { g.sound.enabled = !g.sound.enabled; g.sound.unlock(); this.state(); });
            on('next-drill', () => g.start((g.drill + 1) % 7));
            $('home').addEventListener('click', e => { e.preventDefault(); if (g.running)
                this.open('pause'); });
            document.addEventListener('keydown', e => { if (!this.overlay || e.code !== 'Tab')
                return; const all = Array.from($('panel').querySelectorAll<HTMLElement>('button,input,select')); if (!all.length)
                return; const first = all[0], last = all[all.length - 1]; if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            } });
            this.state();
        }
        animate(el: HTMLElement) { if (typeof gsap !== 'undefined')
            gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .2, ease: 'power2.out', clearProps: 'transform' });
        else if (el.animate)
            el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 190, easing: 'ease-out' }); }
        state() { if (!this.g.lastShot) { $('stroke-label').textContent = '等待第一拍'; $('shot-quality').textContent = '触球位置'; $('impact-dot').setAttribute('cx', '22'); $('impact-dot').setAttribute('cy', '23'); } $('welcome').hidden = this.g.running||this.g.inspect; $('hud').hidden = !this.g.running||this.g.inspect; const match = this.g.mode === 'match'; $('match-score').hidden = !match; $('score-p').textContent = String(this.g.scoreP); $('score-ai').textContent = String(this.g.scoreAI); $('nav-warm').classList.toggle('selected', !match && this.g.drill === 0); $('nav-drills').classList.toggle('selected', !match && this.g.drill !== 0); $('nav-match').classList.toggle('selected', match); $('sound').innerHTML = `声音 <b>${this.g.sound.enabled ? '开' : '关'}</b>`; $('drill-en').textContent = match ? 'FIRST TO SEVEN' : DRILLS[this.g.drill].en; $('drill-name').textContent = match ? '打一场，见分晓。' : DRILLS[this.g.drill].name; $('task').textContent = match ? '回位，比一直蓄满更重要。' : DRILLS[this.g.drill].task; $('rally-label').textContent = this.g.drill === 1 || match ? '当前回合拍数' : '连续有效回球'; this.update(); }
        cue() { const el = $('cue'); el.className = this.g.cueType; $('cue-title').textContent = this.g.cue; $('cue-sub').textContent = this.g.cueSub; el.style.opacity = '1'; const title = $('cue-title'); if (typeof gsap !== 'undefined')
            gsap.fromTo(title, { scale: .94 }, { scale: 1, duration: .16, ease: 'power2.out' });
        else
            title.animate?.([{ transform: 'scale(.95)' }, { transform: 'scale(1)' }], { duration: 160 }); }
        impact() { const s = this.g.lastShot; if (!s)
            return; $('stroke-label').textContent = `${s.hand > 0 ? '正手' : '反手'} · ${STROKE_NAME[s.type]}`; $('shot-quality').textContent = s.timing === 'Perfect' ? '甜区触球' : s.timing === 'Early' ? '偏早 · 落点易长' : s.timing === 'Late' ? '偏晚 · 回球偏浅' : s.offcenter > .86 ? '拍面边缘' : '触球有效'; $('impact-dot').setAttribute('cx', String(22 + clamp(s.u, -1.05, 1.05) * 16)); $('impact-dot').setAttribute('cy', String(23 - clamp(s.v, -1.05, 1.05) * 20)); }
        update() {
            const g = this.g, p = g.player;
            if(g.inspect)return;
            $('cue').style.opacity = g.wallTime < g.cueUntil ? '1' : '0';
            if (g.running) {
                const match = g.mode === 'match';
                $('rally-count').textContent = String(match || g.drill === 1 ? g.rally : g.combo).padStart(2, '0');
                $('speed').textContent = g.lastShot ? String(Math.round(g.lastShot.speed)) : '—';
                $('best').textContent = String(g.stats.bestRally);
                const d = DRILLS[g.drill], num = g.drill === 1 ? Math.max(g.completed, g.rally) : g.completed;
                $('goal-fill').style.width = match ? '0' : `${clamp(num / d.goal) * 100}%`;
                $('goal-text').textContent = match ? `${g.scoreP} : ${g.scoreAI}` : `${num} / ${d.goal}${d.limit ? ' · 第 ' + Math.min(g.feedCount, d.limit) + ' / ' + d.limit + ' 球' : ''}`;
                $('next-drill').hidden = match || !g.goalAnnounced;
                $('power-fill').style.width = `${clamp(p.charge / 1.25) * 100}%`;
                $('power-fill').style.background = p.charge > 1 ? '#edbc77' : 'var(--lime)';
                $('power-number').textContent = p.charging ? `${Math.round(clamp(p.charge) * 100)}%` : 'SPACE';
                $('rhythm-message').textContent = g.awaitServe ? (p.charging ? '松开空格，抛球发球' : '按住空格，准备发球') : g.tossOwner ? '抛球 → 引拍 → 触球' : p.swing >= 0 ? (p.hit ? '回位，准备下一球' : '完成挥拍') : g.ready ? (p.charging ? '现在松开' : '短按空格，准备触球') : p.charging ? (p.charge > 1 ? '蓄力已满，留意来球' : '看来球，别只看蓄力条') : g.pointOver ? '调整站位，下一球马上来' : '提前按住，近身松开';
                $('rhythm-message').parentElement!.parentElement!.classList.toggle('ready', g.ready);
                $('direction-hint').textContent = g.mouseAim ? '鼠标横向微调落点' : '移动方向 + 蓄力 → 白圈';
                $('dash-hint').textContent = p.dashCooldown > 0 ? `冲刺恢复 ${p.dashCooldown.toFixed(1)}s` : 'Shift · 快速调整';
            }
            $('debug').hidden = !g.debug;
            if (g.debug) {
                const r = g.world.r;
                $('debug').textContent = `${r.backend} | ${g.fps} FPS | DPR ${r.dpr}\n${r.drawCalls} draws / ${Math.round(r.triangles)} triangles\nPhysics 120 Hz / render rAF\nlast contact ${g.lastShot ? g.lastShot.gap.toFixed(4) : '—'} m (R ${BALL_R})\nball ${g.ball.p.x.toFixed(2)} ${g.ball.p.y.toFixed(2)} ${g.ball.p.z.toFixed(2)}`;
            }
        }
        header(kicker: string, title: string) { return `<div class="panel-header"><div><p class="eyebrow">${kicker}</p><h2 id="panel-title">${title}</h2></div><button class="close" id="panel-close" aria-label="关闭">×</button></div>`; }
        open(which: string) {
            const g = this.g;
            this.lastFocus = document.activeElement as HTMLElement;
            this.overlay = which;
            g.paused = true;
            g.clearInput();
            $('overlay').hidden = false;
            const panel = $('panel');
            panel.style.width = which === 'tune' ? 'min(390px,90vw)' : which === 'pause' ? 'min(420px,90vw)' : 'min(680px,90vw)';
            if (which === 'drills') {
                panel.innerHTML = this.header('TRAINING PLAYLIST', '今天，练哪一拍？') + `<div class="drill-list">${DRILLS.map((d, i) => `<button class="drill-button" data-drill="${i}"><em>0${i + 1}</em><div><b>${d.name}</b><p>${d.task}</p><p>${d.tag}</p></div></button>`).join('')}</div><p class="panel-note">不用选球种。正反手、切削、截击和高压，会根据来球与站位自动切换。</p>`;
                panel.querySelectorAll<HTMLElement>('[data-drill]').forEach(b => b.onclick = () => g.start(Number(b.dataset.drill)));
            }
            if (which === 'pause') {
                panel.innerHTML = this.header('TAKE A BREATH', '球场等你回来。') + `<p class="panel-copy">WASD 移动，空格蓄力并松开挥拍。<br>Shift 短冲刺。靠近来球才可能触球。</p><div class="pause-controls"><button class="primary" id="resume">继续打 <span>→</span></button><button class="secondary" id="restart">重新开始当前练习 / 比赛</button><button class="secondary" id="pick">换个练习</button></div><p class="panel-note">Esc 也可以继续。切换窗口会自动暂停，不会丢掉当前这一球。</p>`;
                $('resume').onclick = () => this.closeOverlay();
                $('restart').onclick = () => g.start(g.drill, g.mode === 'match');
                $('pick').onclick = () => this.open('drills');
            }
            if (which === 'tune')
                this.renderTune();
            if (which === 'settings') {
                panel.innerHTML = this.header('YOUR COURT', '让操作更顺手。') + `<label class="setting-row"><span>来球提示<small>显示落点圆环与推荐站位。不会自动跑位或命中。</small></span><input id="guides-setting" type="checkbox" ${g.guides ? 'checked' : ''}></label><label class="setting-row"><span>鼠标微调方向<small>关闭时，只用移动方向和站位决定回球方向。</small></span><input id="mouse-setting" type="checkbox" ${g.mouseAim ? 'checked' : ''}></label><label class="setting-row"><span>画面质量<small>默认优先人物与阴影效果，不再自动降低分辨率。</small></span><select id="quality-setting"><option value="low">轻量 · DPR ≤ 1</option><option value="high">清晰 · DPR ≤ 2</option></select></label><label class="setting-row"><span>性能信息<small>显示帧率、绘制调用与实际触球距离。</small></span><input id="debug-setting" type="checkbox" ${g.debug ? 'checked' : ''}></label><p class="panel-note">当前渲染：${g.world.r.backend}。联网版需要载入 Three.js、人物与解码器；本地构建不需要访问外部 CDN。<br>精简碰撞与旋转模型服务于游戏反馈，不是器材测量或科研模拟。</p>`;
                ($('quality-setting') as HTMLSelectElement).value = g.world.r.quality;
                ($('guides-setting') as HTMLInputElement).onchange = e => g.guides = (e.target as HTMLInputElement).checked;
                ($('mouse-setting') as HTMLInputElement).onchange = e => g.mouseAim = (e.target as HTMLInputElement).checked;
                ($('debug-setting') as HTMLInputElement).onchange = e => g.debug = (e.target as HTMLInputElement).checked;
                $('quality-setting').onchange = e => { g.world.r.quality = (e.target as HTMLSelectElement).value; g.world.r.resize(); };
            }
            $('panel-close').onclick = () => this.closeOverlay();
            this.animate(panel);
            setTimeout(() => panel.querySelector<HTMLElement>('button,input')?.focus(), 20);
        }
        renderTune() {
            const g = this.g, p = $('panel');
            p.innerHTML = this.header('RACQUET PREFERENCE', '偏好，不是门槛。') + `<div class="preset-row"><button data-preset="light">轻快</button><button data-preset="balanced">均衡</button><button data-preset="solid">扎实</button></div>` + ([{ key: 'weight', label: '重量', unit: 'g', min: 270, max: 330, step: 5, hint: '更重：回球更稳；更轻：调整更快。' }, { key: 'balance', label: '平衡点', unit: 'cm', min: 30, max: 34, step: .2, hint: '偏头重：增加输出；偏手柄：挥动轻快。' }, { key: 'tension', label: '线床张力', unit: 'lb', min: 44, max: 60, step: 1, hint: '低张力更弹，高张力更可控。' }, { key: 'head', label: '拍面大小', unit: 'in²', min: 95, max: 110, step: 1, hint: '大拍面扩大真实触球范围，精度略降。' }] as const).map(s => `<div class="slider-row"><div class="slider-heading"><label for="set-${s.key}">${s.label}</label><output id="out-${s.key}">${g.setup[s.key]} ${s.unit}</output></div><small>${s.hint}</small><input id="set-${s.key}" data-key="${s.key}" data-unit="${s.unit}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${g.setup[s.key]}"></div>`).join('') + `<div class="ratings" id="ratings"></div><p class="panel-note">当前来球已暂停。关闭面板立即接着打。<br>调整只带来温和差异，站位与时机仍然最重要。</p>`;
            p.querySelectorAll<HTMLInputElement>('input[data-key]').forEach(input => input.oninput = () => { const key = input.dataset.key as keyof Setup; g.setup[key] = Number(input.value); g.ratings = rate(g.setup); g.save(); $('out-' + key).textContent = `${input.value} ${input.dataset.unit}`; this.ratingBars(); });
            p.querySelectorAll<HTMLElement>('[data-preset]').forEach(b => b.onclick = () => { g.setup = b.dataset.preset === 'light' ? { weight: 280, balance: 31, tension: 50, head: 103 } : b.dataset.preset === 'solid' ? { weight: 320, balance: 33, tension: 55, head: 98 } : { ...DEFAULT_SETUP }; g.ratings = rate(g.setup); g.save(); this.renderTune(); $('panel-close').onclick = () => this.closeOverlay(); });
            this.ratingBars();
        }
        ratingBars() { const labels: Record<keyof Ratings, string> = { power: '力量', control: '控制', forgiveness: '容错', stability: '稳定', agility: '灵活' }; $('ratings').innerHTML = (Object.keys(labels) as (keyof Ratings)[]).map(k => `<div class="rating"><label>${labels[k]}<span>${Math.round(this.g.ratings[k])}</span></label><i><span style="width:${this.g.ratings[k]}%"></span></i></div>`).join(''); }
        closeOverlay(resume = true) { if (resume && (this.g.matchOver || this.g.levelOver)) {
            this.summary(this.g.matchOver);
            return;
        } $('overlay').hidden = true; this.overlay = ''; if (resume) {
            this.g.paused = false;
            this.g.clearInput();
            this.g.acc = 0;
        } this.lastFocus?.blur(); this.update(); }
        togglePause() { if (!this.g.running)
            return; if (this.overlay)
            this.closeOverlay();
        else
            this.open('pause'); }
        summary(match: boolean) { const g = this.g; this.overlay = 'summary'; g.paused = true; g.clearInput(); $('overlay').hidden = false; const p = $('panel'); p.style.width = 'min(540px,90vw)'; const win = match ? g.scoreP > g.scoreAI : g.completed >= DRILLS[g.drill].goal; p.innerHTML = this.header(match ? 'MATCH COMPLETE' : 'DRILL COMPLETE', win ? '这一轮，打得不错。' : '下一轮，换个节奏。') + `<div class="result-number">${match ? g.scoreP + ' : ' + g.scoreAI : g.completed + ' / ' + DRILLS[g.drill].goal}</div><p class="panel-copy">${match ? '街机抢七 · 先到 7 分并净胜 2 分' : DRILLS[g.drill].task}</p><div class="result-stats"><div><b>${g.stats.bestRally}</b><span>最长回合</span></div><div><b>${g.stats.perfect}</b><span>Perfect 触球</span></div><div><b>${Math.round(g.stats.maxSpeed)}</b><span>最高球速 km/h</span></div></div><div class="result-actions"><button class="primary" id="again">再打一轮 ↗</button><button class="secondary" id="result-next">${match ? '回训练场' : '下一项训练'} →</button></div><p class="panel-note">${g.stats.misses > g.stats.hits ? '先到位，再松开空格。球拍够不到的球不会判命中。' : g.stats.early + g.stats.late > g.stats.perfect ? '别一直等到满力。试着在球到身前时松开。' : '好时机比满蓄力更重要。继续练习回球后的回位。'}</p>`; $('again').onclick = () => g.start(g.drill, match); $('result-next').onclick = () => g.start(match ? 0 : (g.drill + 1) % 7); $('panel-close').onclick = () => g.start(match ? 0 : g.drill); this.animate(p); }
    }
}
