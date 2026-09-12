namespace Rally {
    export const RACKET = Object.freeze({rx:.1224,ry:.1678,grip:.435,secondGrip:.353,butt:.508,handleTop:.338,length:.6858});
    export const BALL_R = .040, NET = .92, COURT_X = 4.12, COURT_Z = 10.2;
    export interface Setup {
        weight: number;
        balance: number;
        tension: number;
        head: number;
    }
    export const DEFAULT_SETUP: Setup = { weight: 300, balance: 32, tension: 52, head: 100 };
    export interface Ratings {
        power: number;
        control: number;
        forgiveness: number;
        stability: number;
        agility: number;
    }
    export function rate(s: Setup): Ratings { const w = (s.weight - 300) / 30, b = (s.balance - 32) / 2, t = (s.tension - 52) / 8, h = (s.head - 100) / 10; return { power: clamp(60 + w * 5 + b * 4 - t * 6 + h * 2, 35, 85), control: clamp(68 + t * 7 - h * 7 - b * 2, 40, 85), forgiveness: clamp(65 + h * 11 - t * 7, 40, 90), stability: clamp(65 + w * 9 + b * 4, 40, 85), agility: clamp(72 - w * 9 - b * 8 - h * 3, 40, 95) }; }
    export class Ball {
        p = new V();
        prev = new V();
        v = new V();
        active = false;
        top = 0;
        side = 0;
        last = 0;
        bounces = 0;
        serve = false;
        age = 0;
        copy(b: Ball) { this.p.copy(b.p); this.prev.copy(b.prev); this.v.copy(b.v); this.active = b.active; this.top = b.top; this.side = b.side; this.last = b.last; this.bounces = b.bounces; this.serve = b.serve; this.age = b.age; return this; }
    }
    export function integrate(b: Ball, dt: number): boolean {
        b.prev.copy(b.p);
        b.age += dt;
        const gravity = 9.81 + clamp(b.top, -1200, 3800) * .00065, drag = .065;
        b.v.x += (b.side * .00038 - b.v.x * drag) * dt;
        b.v.z -= b.v.z * drag * dt;
        b.v.y -= gravity * dt;
        b.p.x += b.v.x * dt;
        b.p.y += b.v.y * dt;
        b.p.z += b.v.z * dt;
        if (b.p.y < BALL_R && b.v.y < 0) {
            const overshoot = BALL_R - b.p.y;
            b.p.y = BALL_R + overshoot * .78;
            b.v.y = -b.v.y * (.75 + clamp(b.top / 18000, -.04, .10));
            const f = .87 + clamp(b.top / 18000, -.05, .08);
            b.v.x = b.v.x * f + b.side * .0002;
            b.v.z *= f;
            b.top *= .8;
            b.side *= .7;
            b.bounces++;
            return true;
        }
        return false;
    }
    /** Arcade trajectory solver. Drag, gravity and spin match the fixed-step integrator. */
    export function launch(b: Ball, start: V, x: number, z: number, pace: number, spin: number, side = 0, safe = true) {
        b.p.copy(start);
        b.prev.copy(start);
        const dx = x - start.x, dz = z - start.z, dist = Math.hypot(dx, dz), g = 9.81 + clamp(spin, -1200, 3800) * .00065, drag = .065;
        let t = clamp(dist / pace, .45, 2.8);
        if (safe && start.z * z < 0) {
            for (let i = 0; i < 12; i++) {
                const v0z = dz * drag / (1 - Math.exp(-drag * t));
                const k = 1 + start.z * drag / v0z;
                const tn = k > 0 ? -Math.log(k) / drag : t * .5;
                const vy = (BALL_R - start.y + .5 * g * t * t) / t;
                const h = start.y + vy * tn - .5 * g * tn * tn;
                if (h > NET + .25)
                    break;
                t *= 1.055;
            }
        }
        b.v.set(dx * drag / (1 - Math.exp(-drag * t)), (BALL_R - start.y + .5 * g * t * t) / t, dz * drag / (1 - Math.exp(-drag * t)));
        b.top = spin;
        b.side = side;
        b.bounces = 0;
        b.age = 0;
        b.active = true;
    }
    export class RacketPose {
        p = new V();
        u = new V(1, 0, 0);
        v = new V(0, 1, 0);
        n = new V(0, 0, 1);
        rx: number = RACKET.rx;
        ry: number = RACKET.ry;
        copy(r: RacketPose) { this.p.copy(r.p); this.u.copy(r.u); this.v.copy(r.v); this.n.copy(r.n); this.rx = r.rx; this.ry = r.ry; return this; }
        lerp(a: RacketPose, b: RacketPose, t: number) { this.p.lerp(a.p, b.p, t); this.n.lerp(a.n, b.n, t).norm(); this.v.lerp(a.v, b.v, t).norm(); this.u.cross(this.v, this.n).norm(); this.v.cross(this.n, this.u).norm(); this.rx = mix(a.rx, b.rx, t); this.ry = mix(a.ry, b.ry, t); return this; }
    }
    export interface Contact {
        hit: boolean;
        t: number;
        u: number;
        v: number;
        gap: number;
    }
    const cpose = new RacketPose(), cb = new V(), diff = new V();
    function checkSurface(t: number, b0: V, b1: V, r0: RacketPose, r1: RacketPose, out: Contact) {
        cpose.lerp(r0, r1, t);
        cb.lerp(b0, b1, t);
        diff.copy(cb).sub(cpose.p);
        const u = diff.dot(cpose.u), v = diff.dot(cpose.v), d = diff.dot(cpose.n), q = Math.hypot(u / cpose.rx, v / cpose.ry);
        let planar = 0;
        if (q > 1) { // Closest point on the visible ellipse; no invisible body-sized hitbox.
            const au = Math.abs(u), av = Math.abs(v);
            let a = Math.atan2(av * cpose.rx, au * cpose.ry);
            for (let j = 0; j < 5; j++) {
                const s = Math.sin(a), c = Math.cos(a), ex = cpose.rx * c, ey = cpose.ry * s, tx = -cpose.rx * s, ty = cpose.ry * c;
                const f = (ex - au) * tx + (ey - av) * ty, fp = tx * tx + ty * ty + (ex - au) * (-cpose.rx * c) + (ey - av) * (-cpose.ry * s);
                a = clamp(a - f / (Math.abs(fp) < 1e-8 ? 1e-8 : fp), 0, Math.PI / 2);
            }
            planar = Math.hypot(cpose.rx * Math.cos(a) - au, cpose.ry * Math.sin(a) - av);
        }
        const gap = Math.hypot(d, planar);
        if (gap <= BALL_R + (q>1?.010:.002) && t < out.t) {
            out.hit = true;
            out.t = t;
            out.u = u / cpose.rx;
            out.v = v / cpose.ry;
            out.gap = gap;
        }
    }
    /** Moving sphere against the SAME moving elliptical string-bed drawn by the renderer. */
    export function sweepContact(b0: V, b1: V, r0: RacketPose, r1: RacketPose, out: Contact) {
        out.hit = false;
        out.t = 2;
        out.u = out.v = out.gap = 0;
        diff.copy(b0).sub(r0.p);
        const d0 = diff.dot(r0.n);
        diff.copy(b1).sub(r1.p);
        const d1 = diff.dot(r1.n);
        if (Math.min(Math.abs(d0), Math.abs(d1)) > BALL_R + .03 && d0 * d1 > 0)
            return out;
        const delta = d0 - d1;
        if (Math.abs(delta) > .000001) {
            const radius = BALL_R + .001;
            checkSurface(clamp((d0 - Math.sign(d0 || 1) * radius) / delta), b0, b1, r0, r1, out);
            checkSurface(clamp(d0 / delta), b0, b1, r0, r1, out);
        }
        for (let i = 0; i <= 4; i++)
            checkSurface(i / 4, b0, b1, r0, r1, out);
        return out;
    }
    export type Stroke = 'drive' | 'topspin' | 'slice' | 'reach' | 'volley' | 'smash' | 'serve';
    export type Timing = 'Perfect' | 'Good' | 'Early' | 'Late' | 'Miss';
    export const STROKE_NAME: Record<Stroke, string> = { drive: '平击进攻', topspin: '上旋回球', slice: '切削', reach: '伸拍救球', volley: '截击', smash: '高压', serve: '发球' };
    export function chooseStroke(height: number, localZ: number, localX: number, run: number, charge: number, nearNet: boolean, bounces: number): Stroke { if (height > 2.02 && charge > .42)
        return 'smash'; if (nearNet && bounces === 0 && height > .68)
        return 'volley'; if (Math.abs(localX) > 1.10 || run > 6.3)
        return 'reach'; if (height < .74 || localZ > (localX < -.16 ? -.23 : -.40))
        return 'slice'; if (height > 1.35 && charge > .78)
        return 'drive'; return 'topspin'; }
    export function timingFor(localZ: number, offcenter: number, releaseError = 0, depth = .52): Timing { const e = localZ + depth; if (e < -.24 || releaseError > .075)
        return 'Early'; if (e > .23 || releaseError < -.085)
        return 'Late'; return Math.abs(e) < .13 && offcenter < .76 && Math.abs(releaseError) < .055 ? 'Perfect' : 'Good'; }
    export class Sound {
        ctx: AudioContext | null = null;
        enabled = true;
        noise: AudioBuffer | null = null;
        unlock() { try {
            if (!this.ctx) {
                this.ctx = new AudioContext();
                this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * .13, this.ctx.sampleRate);
                const a = this.noise.getChannelData(0);
                for (let i = 0; i < a.length; i++)
                    a[i] = (Math.random() * 2 - 1) * Math.exp(-i / a.length * 5);
            }
            if (this.ctx.state === 'suspended')
                void this.ctx.resume();
        }
        catch {
            this.enabled = false;
        } }
        tone(f: number, len: number, vol: number, end = f) { if (!this.enabled || !this.ctx)
            return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + len); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + len); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + len + .01); o.onended = () => { o.disconnect(); g.disconnect(); }; }
        hit(power: number, clean: boolean) { this.tone(clean ? 430 : 240, .085, .14 + power * .045, 80); if (!this.enabled || !this.ctx || !this.noise)
            return; const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = clean ? 3500 : 1200; g.gain.value = .17; s.connect(f); f.connect(g); g.connect(this.ctx.destination); s.start(); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); }; }
        swing(power:number){if(!this.enabled||!this.ctx||!this.noise)return;const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noise;f.type='highpass';f.frequency.value=1100;g.gain.value=.03+power*.04;s.connect(f);f.connect(g);g.connect(this.ctx.destination);s.start(this.ctx.currentTime+.08);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};}
        bounce() { this.tone(175, .08, .06, 62); }
        dash() { this.tone(100, .07, .025, 40); }
        point(win: boolean) { this.tone(win ? 520 : 200, .18, .055, win ? 720 : 110); }
    }
}
