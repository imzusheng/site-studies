namespace Rally {
    export const DRILLS = [
        { name: '找到击球点', en: 'FIND YOUR RHYTHM', goal: 5, limit: 0, desc: '先站到来球侧，球到身前时松开空格。', task: '打出 5 次有效回球', tag: '入门 · 自由热身' },
        { name: '再来一拍', en: 'KEEP IT GOING', goal: 8, limit: 0, desc: '与陪练连续对打，站稳、回中、留点余量。', task: '连续打出 8 拍', tag: '节奏 · 连续回合' },
        { name: '落点猎手', en: 'HIT THE SPOT', goal: 4, limit: 10, desc: '白圈是预计回球方向。左右移动调整方向，蓄力影响深度。', task: '10 球内命中 4 次绿环', tag: '控制 · 落点挑战' },
        { name: '左右开弓', en: 'SIDE TO SIDE', goal: 6, limit: 10, desc: '先跑位，再挥拍。Shift 可以救一次来不及的小球。', task: '10 球内回进 6 球', tag: '步法 · 左右调动' },
        { name: '守住网前', en: 'OWN THE NET', goal: 5, limit: 10, desc: '已经站在网前，不用等球落地。短按空格更利落。', task: '10 球内完成 5 次截击', tag: '反应 · 网前截击' },
        { name: '高点进攻', en: 'TAKE IT HIGH', goal: 5, limit: 10, desc: '判断高球，提前准备。蓄力超过一半会自动选择高压。', task: '10 球内完成 5 次高压', tag: '进攻 · 机会球' },
        { name: '随机应变', en: 'READ & REACT', goal: 7, limit: 12, desc: '速度、旋转、方向都在变化。先读来球，再决定步伐。', task: '12 球内回进 7 球', tag: '综合 · 随机反应' }
    ];
    export interface Stats {
        hits: number;
        perfect: number;
        good: number;
        early: number;
        late: number;
        misses: number;
        errors: number;
        bestRally: number;
        maxSpeed: number;
        targets: number;
        landed: number;
        totalSpeed: number;
    }
    export function newStats(): Stats { return { hits: 0, perfect: 0, good: 0, early: 0, late: 0, misses: 0, errors: 0, bestRally: 0, maxSpeed: 0, targets: 0, landed: 0, totalSpeed: 0 }; }
    export interface ShotRecord {
        timing: Timing;
        type: Stroke;
        hand: number;
        speed: number;
        spin: number;
        power: number;
        quality: number;
        offcenter: number;
        u: number;
        v: number;
        gap: number;
        angle: number;
        message: string;
    }
    export class Game {
        world: World;
        ui: UI | null = null;
        player = new Actor(C.lime, 1);
        ai = new Actor(C.orange, -1);
        ball = new Ball();
        scratch = new Ball();
        forecast = new Ball();
        sound = new Sound();
        setup: Setup = { ...DEFAULT_SETUP };
        ratings = rate(this.setup);
        aiRatings = rate(DEFAULT_SETUP);
        actors = [this.player, this.ai];
        stats = newStats();
        lastShot: ShotRecord | null = null;
        mode: 'training' | 'match' = 'training';
        drill = 0;
        running = false;
        paused = false;
        awaitServe = false;
        pointOver = false;
        matchOver = false;
        levelOver = false;
        keys: Record<string, boolean> = {};
        clock = 0;
        wallTime = 0;
        acc = 0;
        lastTime = 0;
        fps = 60;
        fpsAge = 0;
        frames = 0;
        fpsSamples = 0;
        slowFrames = 0;
        uiAge = 0;
        hitstop = 0;
        flashAge = 0;
        flashPos = new V();
        frame = 0;
        feedTimer = 1.2;
        feedCount = 0;
        completed = 0;
        goalAnnounced = false;
        combo = 0;
        rally = 0;
        scoreP = 0;
        scoreAI = 0;
        server = 1;
        tossOwner = 0;
        tossWait = 0;
        aiThink = 0;
        aiTX = 0;
        aiTZ = -8.2;
        aiThinkCooldown = 0;
        trainingMissRun = 0;
        trainingAttemptDone = false;
        swings = 0;
        guides = true;
        mouseAim = false;
        mouseX = 0;
        aimX = 0;
        aimZ = -7;
        targetX = 0;
        targetZ = -7.4;
        targetRadius = 1.65;
        ready = false;
        releaseIn = 9;
        predictionValid = false;
        interceptValid = false;
        landX = 0;
        landZ = 0;
        interceptX = 0;
        interceptZ = 0;
        predictAge = 0;
        cue = '';
        cueSub = '';
        cueType = '';
        cueUntil = 0;
        lastMissAt = -9;
        debug = false;
        assetsReady=false;
        inspect=false;
        inspectMotion='forehand';
        inspectSpeed=.45;
        inspectTime=0;
        inspectAngle=.65;
        inspectedShot=false;
        seed = 74021;
        tmp = new V();
        tmp2 = new V();
        contactResult: Contact = { hit: false, t: 0, u: 0, v: 0, gap: 0 };
        lastContactDiagnostics: {
            gap: number;
            radius: number;
            u: number;
            v: number;
            who: number;
            time: number;
        }[] = [];
        constructor(canvas: HTMLCanvasElement) { this.load(); this.world = new World(canvas); this.bind(); }
        load() { try {
            const s = JSON.parse(localStorage.getItem('baseline.rally.setup') || 'null');
            if (s) {
                this.setup = { weight: clamp(Number(s.weight) || 300, 270, 330), balance: clamp(Number(s.balance) || 32, 30, 34), tension: clamp(Number(s.tension) || 52, 44, 60), head: clamp(Number(s.head) || 100, 95, 110) };
            }
            this.ratings = rate(this.setup);
        }
        catch { } }
        save() { try {
            localStorage.setItem('baseline.rally.setup', JSON.stringify(this.setup));
        }
        catch { } }
        random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
        note(title: string, sub: string, type = 'neutral', time = 1.8) { this.cue = title; this.cueSub = sub; this.cueType = type; this.cueUntil = this.wallTime + time; this.ui?.cue(); }
        clearInput() { this.keys = {}; this.player.charging = false; this.player.charge = 0; }
        start(drill = 0, match = false) { if(!this.assetsReady)return; this.inspect=false; document.getElementById('motion-panel')?.setAttribute('hidden',''); this.running = true; this.paused = false; this.mode = match ? 'match' : 'training'; this.drill = drill; this.stats = newStats(); this.lastShot = null; this.ball.active = false; this.clock = 0; this.releaseIn = 9; this.ready = this.predictionValid = this.interceptValid = false; this.aiThinkCooldown = 0; this.completed = this.feedCount = this.rally = this.combo = 0; this.goalAnnounced = this.levelOver = this.matchOver = this.pointOver = false; this.scoreP = this.scoreAI = 0; this.tossOwner = 0; this.feedTimer = 1.25; this.predictAge = 99; this.hitstop = 0; this.clearInput(); this.player.reset(0, drill === 4 && !match ? 2.8 : drill === 5 && !match ? 4.6 : 8.2); this.ai.reset(0, -8.2); this.world.resetTrail(); for (const effect of this.world.effects) effect.age = 9; this.world.cameraKick = 0; this.flashAge = 0; this.lastContactDiagnostics.length = 0; this.lastMissAt = -9; this.trainingMissRun = 0; this.trainingAttemptDone = false; this.ui?.closeOverlay(false); this.ui?.state(); if (match)
            this.resetPoint();
        else {
            this.awaitServe = false;
            this.note(DRILLS[drill].name, DRILLS[drill].desc, 'neutral', 4);
            if (drill === 2)
                this.nextTarget();
        } this.sound.unlock(); }
        resetPoint() { this.releaseIn = 9; this.ready = this.predictionValid = this.interceptValid = false; this.pointOver = false; this.ball.active = false; this.rally = 0; this.combo = 0; this.player.reset(.4, 8.5); this.ai.reset(-.4, -8.5); this.world.resetTrail(); this.server = Math.floor((this.scoreP + this.scoreAI) / 2) % 2 === 0 ? 1 : 2; this.awaitServe = this.server === 1; this.tossOwner = 0; this.feedTimer = 1.2; this.predictAge = 99; this.clearInput(); this.note(this.awaitServe ? '你的发球' : '准备接发', this.awaitServe ? '按住空格，松开抛球并发球。' : '站在底线附近，等球落地后回击。', 'neutral', 2.7); }
        charge() { if (!this.running || this.paused || this.pointOver || this.matchOver || this.levelOver || this.player.swing >= 0 || this.tossOwner)
            return; this.sound.unlock(); this.player.charging = true; this.player.charge = .03; this.player.hand = (this.ball.p.x - this.player.x) < -.12 ? -1 : 1; }
        release() { if (!this.player.charging || this.paused)
            return; if (this.awaitServe) {
            this.serveToss(1);
            return;
        } this.planSwing(this.player, false); }
        planSwing(a: Actor, serve = false) {
            this.scratch.copy(this.ball);
            const base=a.getWindup(a===this.player?this.setup:DEFAULT_SETUP,serve);
            const arrival=this.ball.active&&Math.abs(this.ball.v.z)>.1?((a.z-.52*a.side)-this.ball.p.z)/this.ball.v.z:base;
            const dur=!serve&&Math.abs(arrival-base)<.10?clamp(arrival,base*.78,base*1.25):base;
            for (let t = 0; t < dur; t += FIXED)
                integrate(this.scratch, FIXED);
            if (!this.ball.active)
                a.local(this.scratch.p, .82, 1.15, -.52);
            const localX = (this.scratch.p.x - a.x) * a.side, localZ = (this.scratch.p.z - a.z) * a.side;
            a.start(this.scratch.p, a === this.player ? this.setup : DEFAULT_SETUP, serve);
            a.windup=dur;
            this.sound.swing(a.power);
            a.timingError = serve ? 0 : clamp(((a.z - .52 * a.side) - this.ball.p.z) / this.ball.v.z - base, -.3, .3);
            a.stroke = serve ? 'serve' : chooseStroke(this.scratch.p.y, localZ, localX, Math.hypot(a.vx, a.vz), a.power, Math.abs(a.z) < 4, this.ball.bounces);
            if (a === this.player) {
                a.aim = this.aimX;
                this.swings++;
            }
            else {
                const spread = this.mode === 'match' ? clamp(.65 + this.rally * .16, .65, 2.65) : .65;
                a.aim = clamp(this.player.x * .23 + (this.random() - .5) * spread * 2, -3.1, 3.1);
                if (this.rally < 4)
                    a.aim = clamp(a.aim, -1.4, 1.4);
            }
        }
        serveToss(who: number) { const a = who === 1 ? this.player : this.ai; this.awaitServe = false; this.ball.active = true; this.ball.serve = true; this.ball.last = 0; this.ball.bounces = 0; this.ball.top = this.ball.side = 0; this.ball.age = 0; // 抛球位置与挥拍平面(-.52)对齐;顶点≈2.08m、触球点≈1.98m,落在骨骼可达包络内(旧值 v_y=4.8、z=-.83 会使球高 2.6m+ 且偏离拍面,必挥空)
            a.local(this.ball.p, .66, 1.62, -.55); this.ball.prev.copy(this.ball.p);
            this.ball.v.set(0, 3.0, 0); this.tossOwner = who; this.tossWait = .18; a.charging = false; a.tossing = true; if (who === 2)
            a.charge = .67; this.world.resetTrail(); }
        dash() { const p = this.player; if (this.paused || !this.running || p.dashCooldown > 0 || p.stamina < .21)
            return; let x = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0), z = (this.keys.KeyS ? 1 : 0) - (this.keys.KeyW ? 1 : 0); if (!x && !z) {
            x = Math.abs(p.vx) > .5 ? Math.sign(p.vx) : 0;
            z = x ? 0 : -1;
        } const d = Math.hypot(x, z); p.vx = x / d * 8.9; p.vz = z / d * 8.9; p.dash = .18; p.dashCooldown = 1.10; p.stamina -= .21; this.sound.dash(); }
        nextTarget() { this.targetX = (this.feedCount % 2 === 0 ? -1 : 1) * 2.0; this.targetZ = -7.4; }
        feed() {
            this.releaseIn = 9;
            this.ready = this.predictionValid = this.interceptValid = false;
            this.feedCount++;
            this.trainingAttemptDone = false;
            this.pointOver = false;
            this.ball.serve = false;
            this.ball.last = 0;
            this.rally = 0;
            this.player.hit = false;
            let x = .73, z = 4.65, pace = 11.7, spin = 700;
            if (this.drill === 0) {
                x = this.feedCount <= 2 ? .73 : (this.feedCount % 4 < 2 ? .73 : -.73);
                pace -= Math.min(this.trainingMissRun, 3) * .45;
            }
            if (this.drill === 1) {
                x = .73;
                pace = 11.7;
                this.ai.reset(0, -8.2);
            }
            if (this.drill === 2) {
                this.nextTarget();
                x = this.feedCount % 2 ? .72 : -.72;
            }
            if (this.drill === 3) {
                x = this.feedCount % 2 ? 2.45 : -2.45;
                pace = 11.9;
            }
            if (this.drill === 4) {
                x = this.feedCount % 2 ? .68 : -.68;
                z = 6.5;
                pace = 13;
                spin = 350;
            }
            if (this.drill === 5) {
                x = this.feedCount % 2 ? .66 : -.66;
                z = 5.6;
                pace = 7.7;
                spin = 350;
            }
            if (this.drill === 6) {
                x = (this.random() - .5) * 5.5;
                z = 4.6 + this.random() * 1.2;
                pace = 11.2 + this.random() * 2;
                spin = this.feedCount % 3 === 0 ? -750 : this.feedCount % 3 === 1 ? 2400 : 400;
            }
            this.tmp.set(0, this.drill === 5 ? 2.1 : 1.12, -8.45);
            launch(this.ball, this.tmp, x, z, pace, spin, 0, true);
            this.ball.last = 0;
            this.ball.serve = false;
            this.world.resetTrail();
            this.predictAge = 99;
            this.sound.tone(390, .035, .017, 310);
        }
        move(dt: number) { const p = this.player; let x = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0), z = (this.keys.KeyS ? 1 : 0) - (this.keys.KeyW ? 1 : 0); const l = Math.hypot(x, z); if (l) {
            x /= l;
            z /= l;
        } const speed = (5.65 + (this.ratings.agility - 72) * .024) * (p.swing >= 0 ? .94 : 1); if (p.dash <= 0) {
            p.vx = damp(p.vx, x * speed, l ? 20 : 25, dt);
            p.vz = damp(p.vz, z * speed, l ? 20 : 25, dt);
        } p.x = clamp(p.x + p.vx * dt, -5.05, 5.05); p.z = clamp(p.z + p.vz * dt, 1.15, 11.7); p.moveIntent = damp(p.moveIntent, x, 10, dt); this.aimX = this.mouseAim ? this.mouseX : clamp(p.vx * .43 - p.x * .32, -3.15, 3.15); this.aimZ = -clamp(6.0 + clamp(p.charge) * 2.3, 4, 8.8); }
        predict() { const b = this.ball; this.predictionValid = this.interceptValid = false; if (!b.active || this.tossOwner)
            return; this.forecast.copy(b); let gotBounce = b.bounces > 0; for (let i = 0; i < 370; i++) {
            const hit = integrate(this.forecast, FIXED);
            if (hit && !gotBounce) {
                this.predictionValid = true;
                this.landX = this.forecast.p.x;
                this.landZ = this.forecast.p.z;
                gotBounce = true;
            }
            if (gotBounce && this.forecast.bounces < 2 && this.forecast.p.y > .92 && this.forecast.p.y < 1.6 && this.forecast.v.z > 0 && this.forecast.p.z > 0) {
                this.interceptValid = true;
                this.interceptX = this.forecast.p.x;
                this.interceptZ = this.forecast.p.z;
                break;
            }
            if (this.forecast.bounces >= 2)
                break;
        } }
        aiUpdate(dt: number) {
            if (!(this.mode === 'match' || this.drill === 1) || this.tossOwner)
                return;
            const a = this.ai, b = this.ball;
            this.aiThinkCooldown -= dt;
            if (b.active && b.last === 1 && this.aiThinkCooldown <= 0) {
                this.aiThinkCooldown = .11;
                this.forecast.copy(b);
                let found = false;
                for (let i = 0; i < 360; i++) {
                    integrate(this.forecast, FIXED);
                    if (this.forecast.bounces >= 1 && this.forecast.bounces < 2 && this.forecast.p.z < -.5 && this.forecast.p.y > .91 && this.forecast.p.y < 1.65) {
                        this.aiTX = clamp(this.forecast.p.x + .73, -4.95, 4.95);
                        this.aiTZ = clamp(this.forecast.p.z - .8, -11.8, -1.45);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    this.aiTX = clamp(b.p.x + .7, -4.7, 4.7);
                    this.aiTZ = -8.4;
                }
            }
            if (b.last !== 1 && a.swing < 0) {
                this.aiTX = damp(this.aiTX, 0, 1.5, dt);
                this.aiTZ = damp(this.aiTZ, -8.2, 1.5, dt);
            }
            const dx = this.aiTX - a.x, dz = this.aiTZ - a.z, d = Math.hypot(dx, dz), speed = this.drill === 1 && this.mode === 'training' ? 5.6 : 4.95;
            a.vx = damp(a.vx, d > .12 ? dx / d * speed : 0, 14, dt);
            a.vz = damp(a.vz, d > .12 ? dz / d * speed : 0, 14, dt);
            a.x = clamp(a.x + a.vx * dt, -5.1, 5.1);
            a.z = clamp(a.z + a.vz * dt, -11.8, -1.2);
            if (b.active && b.last === 1 && a.swing < 0 && b.v.z < -.1) {
                // Prepare before the bounce; waiting until after it can leave less time than a full swing needs.
                a.charging=true;a.charge=this.mode==='match'?.64:.57;
                const t = (a.z + .52 - b.p.z) / b.v.z;
                if (t < a.getWindup(DEFAULT_SETUP)+.012 && t > .06 && Math.abs(b.p.x - a.x) < 1.7 && b.p.y < 2.8) this.planSwing(a);
            }else if(a.swing<0){a.charging=false;a.charge=0;}
        }
        get canRelease() { const b = this.ball, p = this.player; if (!b.active || b.last === 1)
            return false; const x = b.p.x - p.x, z = b.p.z - p.z; return Math.abs(x) < 1.50 && b.p.y > .22 && b.p.y < 3.0 && z > -3.6 && z < .2; }
        strike(a: Actor, who: number) {
            const c = this.contactResult, b = this.ball;
            this.tmp.lerp(b.prev, b.p, c.t);
            a.rpose.lerp(a.previous, a.racket, c.t);
            a.racket.copy(a.rpose);
            a.swing -= FIXED * (1 - c.t);
            a.lastContact.copy(a.racket);
            a.hit = true;
            a.tossing = false;
            a.strain = 1;
            const incoming = b.v.len(), localZ = (this.tmp.z - a.z) * a.side, off = Math.hypot(c.u, c.v), serve = this.tossOwner === who;
            let timing: Timing = serve ? 'Good' : timingFor(localZ, off, a.timingError);
            const effective = who === 1 ? this.ratings : this.aiRatings;
            const pressure = Math.max(0, incoming - 13) * (1 - effective.stability / 100) * .012;
            const quality = clamp(1 - pressure - Math.abs(a.timingError) * .65 - Math.abs(localZ + .52) * .7 - Math.max(0, off - .45) * (.29 - effective.forgiveness * .0008) - Math.hypot(a.vx, a.vz) * .014 - a.overcharge * .18, .26, 1);
            const ratings = who === 1 ? this.ratings : this.aiRatings;
            let pace = (12 + 6 * a.power + (ratings.power - 60) * .03 + incoming * .025) * (.80 + quality * .2);
            let spin = a.stroke === 'topspin' ? 1700 + a.power * 700 : a.stroke === 'slice' ? -650 : a.stroke === 'reach' ? 500 : a.stroke === 'drive' ? 550 : 850;
            let depth = 6.1 + a.power * 2.3;
            if (a.stroke === 'slice') {
                pace = 12.0;
                depth = 5.8;
            }
            if (a.stroke === 'reach') {
                pace = 11.2;
                depth = 4.9;
            }
            if (a.stroke === 'volley') {
                pace = 15.5;
                depth = 5.1;
            }
            if (a.stroke === 'smash') {
                pace = 19.5;
                depth = 6.8;
                spin = 500;
            }
            if (serve) {
                pace = 17.4;
                depth = 5.1;
                spin = 600;
            }
            if (timing === 'Late')
                depth -= 1.2;
            if (timing === 'Early')
                depth += .85 + a.overcharge * 2;
            const controlError = (1 - quality) * 1.55 + (68 - ratings.control) * .013;
            let tx = a.aim + (localZ + .8) * a.hand * controlError + c.u * .16, tz = -depth * a.side;
            tx += Math.sign(a.aim || 1) * a.overcharge * .6;
            const safe = quality > .55;
            launch(b, this.tmp, tx, tz, pace, spin, clamp(c.u * 200, -240, 240), safe);
            b.last = who;
            b.serve = serve;
            this.tossOwner = 0;
            this.tossWait = 0;
            this.hitstop = .032;
            a.visual?.update(a,false);
            this.flashAge = .06;
            this.flashPos.copy(this.tmp);
            this.world.resetTrail();
            this.world.cameraKick = .6;
            this.sound.hit(a.power, timing === 'Perfect');
            this.rally++;
            this.stats.bestRally = Math.max(this.stats.bestRally, this.rally);
            this.predictAge = 99;
            this.aiThinkCooldown = 0;
            this.lastContactDiagnostics.push({ gap: c.gap, radius: BALL_R, u: c.u, v: c.v, who, time: this.clock });
            if (this.lastContactDiagnostics.length > 120)
                this.lastContactDiagnostics.shift();
            if (who === 1) {
                this.trainingMissRun = 0;
                this.combo++;
                this.stats.bestRally = Math.max(this.stats.bestRally, this.mode === 'match' || this.drill === 1 ? this.rally : this.combo);
                this.stats.hits++;
                this.stats[timing === 'Perfect' ? 'perfect' : timing === 'Good' ? 'good' : timing === 'Early' ? 'early' : 'late']++;
                const speed = b.v.len() * 3.6;
                this.stats.maxSpeed = Math.max(this.stats.maxSpeed, speed);
                this.stats.totalSpeed += speed;
                const message = timing === 'Early' ? '出手偏早，落点更难压住。' : timing === 'Late' ? '球已靠近身体，回球会偏浅。' : off > .85 ? '拍面边缘触球，稳定性降低。' : a.stroke === 'reach' ? '伸拍救回来了，尽快回位。' : timing === 'Perfect' ? '站位到位，触球干净。' : '回球有效，准备下一拍。';
                this.lastShot = { timing, type: a.stroke, hand: a.hand, speed, spin, power: a.power, quality, offcenter: off, u: c.u, v: c.v, gap: c.gap, angle: Math.atan(a.aim * .038) * 180 / Math.PI, message };
                this.note(timing.toUpperCase(), `${a.hand > 0 ? '正手' : '反手'} · ${STROKE_NAME[a.stroke]} · ${Math.round(speed)} km/h`, timing === 'Perfect' ? 'perfect' : timing === 'Good' ? 'good' : 'warn', 1.15);
                this.ui?.impact();
            }
            if (this.mode === 'training' && this.drill === 1 && this.rally >= DRILLS[1].goal && !this.goalAnnounced) {
                this.goalAnnounced = true;
                this.completed = this.rally;
                this.note('8 拍达成', '节奏找到了。继续挑战更长回合。', 'perfect', 2.5);
            }
        }
        attemptEnd(valid: boolean, reason: string, target = false) {
            if (this.trainingAttemptDone)
                return;
            this.trainingAttemptDone = true;
            this.ball.active = false;
            this.pointOver = true;
            this.feedTimer = .95;
            this.player.charging = false;
            this.player.charge = 0;
            this.world.resetTrail();
            if (valid) {
                this.stats.landed++;
                if (target)
                    this.stats.targets++;
                if (this.drill === 0 || this.drill === 2 && target || this.drill === 3 || this.drill === 4 && this.lastShot?.type === 'volley' || this.drill === 5 && this.lastShot?.type === 'smash' || this.drill === 6)
                    this.completed++;
                if (target) {
                    this.sound.point(true);
                    this.note('IN THE ZONE', '落点命中 · 继续保持。', 'perfect', 1.35);
                }
                else if (this.drill === 2) {
                    this.note('回球有效', '没有落进绿环。移动方向和蓄力会改变白圈落点。', 'neutral', 1.4);
                }
            }
            else {
                this.stats.errors++;
                this.combo = 0;
                this.trainingMissRun++;
                this.note('下一球', reason, 'warn', 1.65);
            }
            const drill = DRILLS[this.drill];
            if (this.completed >= drill.goal && !this.goalAnnounced) {
                this.goalAnnounced = true;
                this.sound.point(true);
                this.note('目标达成', this.drill === 0 ? '继续热身，或试试下一个挑战。' : `${this.completed} 次完成 · 再来一拍。`, 'perfect', 2.8);
            }
            if (drill.limit && this.feedCount >= drill.limit) {
                this.levelOver = true;
                this.ui?.summary(false);
            }
        }
        endPoint(winner: number, reason: string) {
            if (this.pointOver)
                return;
            this.ball.active = false;
            this.pointOver = true;
            this.feedTimer = 1.6;
            this.awaitServe = false;
            this.tossOwner = 0;
            this.world.resetTrail();
            this.clearInput();
            if (this.mode === 'training') {
                this.stats.bestRally = Math.max(this.stats.bestRally, this.rally);
                if (winner === 2)
                    this.stats.errors++;
                this.combo = 0;
                this.note(`${this.rally} 拍回合`, reason + ' · 马上再来。', winner === 1 ? 'good' : 'warn', 1.6);
                return;
            }
            if (winner === 1)
                this.scoreP++;
            else
                this.scoreAI++;
            this.sound.point(winner === 1);
            this.note(winner === 1 ? '这一分，你的。' : '对手得分', reason, winner === 1 ? 'perfect' : 'warn', 1.8);
            if (Math.max(this.scoreP, this.scoreAI) >= 7 && Math.abs(this.scoreP - this.scoreAI) >= 2) {
                this.matchOver = true;
                this.ui?.summary(true);
            }
            this.ui?.state();
        }
        miss(a: Actor) { if (a === this.player && this.ball.active && this.ball.last !== 1 && this.clock - this.lastMissAt > .5) {
            this.stats.misses++;
            this.lastMissAt = this.clock;
            const dx = Math.abs(this.ball.p.x - a.x), z = this.ball.p.z - a.z;
            const why = dx > 1.5 ? '球在侧面太远。先移动到球旁边。' : z > .15 ? '球已越过身体。下一球早点松开。' : z < -2.2 ? '挥拍太早。等球靠近身前。' : '拍面没有碰到球。注意球的高度和站位。';
            this.note('MISS', why, 'warn', 1.25);
        } a.hit = true; }
        fixed(dt: number) {
            if (!this.running || this.paused || this.matchOver || this.levelOver)
                return;
            if (this.hitstop > 0) {
                this.hitstop = Math.max(0, this.hitstop - dt);
                return;
            }
            this.clock += dt;
            this.move(dt);
            this.aiUpdate(dt);
            for(const actor of this.actors){
                if(actor.swing<0&&!actor.tossing&&this.ball.active){
                    const dx=(this.ball.p.x+this.ball.v.x*.18-actor.x)*actor.side;
                    const next=Math.abs(dx)>.22?(dx<0?-1:1):actor.hand;
                    if(next!==actor.hand){actor.hand=next;actor.prep*=.45;}
                }
            }
            this.player.tick(dt, this.setup);
            this.ai.tick(dt, DEFAULT_SETUP);
            for (const a of this.actors)
                if (a.swing >= a.windup + .13 && !a.hit)
                    this.miss(a);
            if (this.pointOver) {
                this.feedTimer -= dt;
                if (this.feedTimer <= 0) {
                    if (this.mode === 'match')
                        this.resetPoint();
                    else {
                        this.pointOver = false;
                        this.feed();
                    }
                }
                return;
            }
            if (this.tossOwner) {
                this.tossWait -= dt;
                if (this.tossWait <= 0 && this.tossWait > -10) {
                    this.tossWait = -20;
                    this.planSwing(this.tossOwner === 1 ? this.player : this.ai, true);
                }
            }
            if (!this.ball.active) {
                if (this.awaitServe)
                    return;
                this.feedTimer -= dt;
                if (this.feedTimer <= 0) {
                    if (this.mode === 'match')
                        this.serveToss(2);
                    else
                        this.feed();
                }
                return;
            }
            const b = this.ball, oldZ = b.p.z, bounced = integrate(b, dt);
            for (const a of this.actors) {
                const who = a === this.player ? 1 : 2;
                if (a.swing < .035 || a.swing > a.windup + .125 || a.hit || b.last === who || who === 2 && this.mode !== 'match' && this.drill !== 1 || b.serve && b.bounces === 0 && this.tossOwner !== who)
                    continue;
                if (Math.abs(b.p.x - a.x) > 2 || Math.abs(b.p.z - a.z) > 2)
                    continue;
                sweepContact(b.prev, b.p, a.previous, a.racket, this.contactResult);
                if (this.contactResult.hit) {
                    this.strike(a, who);
                    return;
                }
            }
            if (this.tossOwner && b.p.y < BALL_R + .12) {
                const who = this.tossOwner;
                this.tossOwner = 0;
                this.endPoint(who === 1 ? 2 : 1, '发球未触球');
                return;
            }
            if (oldZ * b.p.z < 0 && Math.abs(b.p.x) < 5.6) {
                const t = oldZ / (oldZ - b.p.z), y = mix(b.prev.y, b.p.y, t);
                if (y < NET + .12 * (Math.abs(b.p.x) / 5.6) ** 2 + BALL_R) {
                    if (this.mode === 'training' && this.drill !== 1)
                        this.attemptEnd(false, '回球下网。站稳，留一点过网高度。');
                    else
                        this.endPoint(b.last === 1 ? 2 : 1, '回球下网');
                    return;
                }
            }
            if (bounced) {
                this.sound.bounce();
                this.world.effect(b.p.x, b.p.z);
                if (b.bounces === 1) {
                    const legal = Math.abs(b.p.x) <= COURT_X + BALL_R && Math.abs(b.p.z) <= COURT_Z + BALL_R;
                    if (!legal) {
                        if (this.mode === 'training' && this.drill !== 1)
                            this.attemptEnd(false, b.last === 1 ? '回球出界。少一点蓄力，或早点站稳。' : '来球已出界，重新喂球。');
                        else
                            this.endPoint(b.last === 1 ? 2 : 1, '落点出界');
                        return;
                    }
                    if (this.mode === 'training' && this.drill !== 1 && b.last === 1 && b.p.z < 0) {
                        const hit = Math.hypot(b.p.x - this.targetX, b.p.z - this.targetZ) < this.targetRadius;
                        this.world.effect(b.p.x, b.p.z, hit && this.drill === 2 ? 1 : 0);
                        this.attemptEnd(true, '', hit && this.drill === 2);
                        return;
                    }
                }
                if (b.bounces >= 2) {
                    if (this.mode === 'training' && this.drill !== 1)
                        this.attemptEnd(false, '球落地两次。先到位，别只盯着蓄力条。');
                    else
                        this.endPoint(b.last === 1 ? 1 : 2, '球落地两次');
                    return;
                }
            }
            if (Math.abs(b.p.z) > 15 || Math.abs(b.p.x) > 9 || b.age > 7) {
                if (this.mode === 'training' && this.drill !== 1)
                    this.attemptEnd(false, '没能回进场内。下一球先找站位。');
                else
                    this.endPoint(b.last === 1 ? 2 : 1, '回球出界');
                return;
            }
            this.predictAge += dt;
            if (this.predictAge > .10) {
                this.predictAge = 0;
                this.predict();
            }
            const vz = b.v.z;
            this.releaseIn = vz > .1 ? (this.player.z - .52 - b.p.z) / vz : 9;
            this.ready=this.canRelease&&Math.abs(this.releaseIn-this.player.getWindup(this.setup))<.12;
        }
        tick = (ms: number) => {
            const elapsed = this.lastTime ? Math.min((ms - this.lastTime) / 1000, .10) : FIXED;
            this.lastTime = ms;
            this.wallTime = ms / 1000;
            this.frame++;
            this.acc = Math.min(this.acc + elapsed, .1);
            if(this.inspect){this.inspectTick(elapsed);this.acc=0;}
            while (this.acc >= FIXED) {
                this.fixed(FIXED);
                this.acc -= FIXED;
            }
            this.world.update(this, elapsed);
            this.frames++;
            this.fpsAge += elapsed;
            if (this.fpsAge >= 1) {
                this.fps = Math.round(this.frames / this.fpsAge);
                this.frames = 0;
                this.fpsAge = 0;
                if (this.running && !this.paused && this.fps < 43)
                    this.slowFrames++;
                else
                    this.slowFrames = 0;
                if (this.slowFrames >= 4 && false && this.world.r.quality === 'auto' && this.world.r.dpr > 1) {
                    this.world.r.quality = 'low';
                    this.world.r.resize();
                    this.slowFrames = 0;
                }
            }
            this.uiAge += elapsed;
            if (this.uiAge > .065) {
                this.uiAge = 0;
                this.ui?.update();
            }
            requestAnimationFrame(this.tick);
        };
        inspectTick(realDt:number){
            const dt=Math.min(realDt,.04)*this.inspectSpeed,a=this.player;
            this.inspectTime+=dt;
            if(this.inspectMotion==='run'||this.inspectMotion==='side'){
                a.vx=this.inspectMotion==='side'?3.5:0;a.vz=this.inspectMotion==='run'?-4.8:0;
                a.x+=a.vx*dt;a.z+=a.vz*dt;a.tick(dt,this.setup);
                if(this.inspectTime>1.8){this.inspectTime=0;a.reset(0,6.5);}
            }else{
                if(this.inspectTime>=2.7){this.inspectTime%=2.7;this.inspectedShot=false;a.reset(0,6.5);}
                const phase=this.inspectTime;
                if(!this.inspectedShot){a.hand=this.inspectMotion==='backhand'?-1:1;a.charging=true;a.charge=Math.min(.75,phase);if(phase>.70){a.local(this.tmp,a.hand*.73,this.inspectMotion==='serve'?2.4:1.25,-.8);a.start(this.tmp,this.setup,this.inspectMotion==='serve');this.inspectedShot=true;}}
                a.tick(dt,this.setup);
            }
            const label=document.getElementById('motion-phase');if(label)label.textContent=a.actionPhase;
            const info=document.getElementById('motion-detail');if(info)info.textContent=`${a.hand>0?'右手持拍 · 正手':'右手持拍 · 双手反手'} / ${this.inspectSpeed.toFixed(2)}×`;
        }
        enterInspection(motion='forehand'){
            if(!this.assetsReady)return;this.inspect=true;this.paused=true;this.clearInput();this.inspectMotion=motion;this.inspectTime=0;this.inspectedShot=false;this.player.reset(0,6.5);this.ball.active=false;
            document.getElementById('welcome')?.setAttribute('hidden','');document.getElementById('hud')?.setAttribute('hidden','');document.getElementById('overlay')?.setAttribute('hidden','');document.getElementById('motion-panel')?.removeAttribute('hidden');
        }
        bind() { window.addEventListener('keydown', e => { if(!this.assetsReady)return; if(e.code==='KeyV'){e.preventDefault();if(this.inspect)this.start(0);else this.enterInspection();return;}if(this.inspect){if(e.code==='Escape')this.start(0);return;}if (e.code === 'Escape') {
            e.preventDefault();
            this.ui?.togglePause();
            return;
        } if ((e.target as HTMLElement)?.matches('input,select,textarea'))
            return; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && e.code !== 'Tab')
            e.preventDefault(); if (this.paused)
            return; if (e.code === 'Backquote') {
            this.debug = !this.debug;
            this.ui?.update();
            return;
        } if (!this.running) {
            if (e.code === 'Space') {
                this.start();
            }
            return;
        } this.keys[e.code] = true; if (e.repeat)
            return; if (e.code === 'Space')
            this.charge(); if (e.code === 'ShiftLeft' || e.code === 'ShiftRight')
            this.dash(); }); window.addEventListener('keyup', e => { delete this.keys[e.code]; if (e.code === 'Space') {
            e.preventDefault();
            this.release();
        } }); window.addEventListener('blur', () => { this.clearInput(); if (this.running && !this.inspect && !this.paused && !this.matchOver && !this.levelOver)
            this.ui?.open('pause'); }); document.addEventListener('visibilitychange', () => { if (document.hidden) {
            this.clearInput();
            this.acc = 0;
            if (this.running && !this.paused)
                this.ui?.open('pause');
        } this.lastTime = 0; }); this.world.r.canvas.addEventListener('pointermove', e => { this.mouseX = clamp((e.clientX / innerWidth - .5) * 8, -3.1, 3.1); }); }
    }
}
