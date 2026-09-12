namespace Rally {
    export class World {
        r: Renderer;
        club:SunsetClub;
        aimDim = rgb(0x758c68);
        trailDim = rgb(0x819958);
        tmp = new V();
        a = new V();
        b = new V();
        projected = new V();
        trail = Array.from({ length: 15 }, () => new V());
        trailCount = 0;
        trailAge = 0;
        effects = Array.from({ length: 8 }, () => ({ x: 0, z: 0, age: 9, color: C.lime, kind: 0 }));
        effectIndex = 0;
        cameraKick = 0;
        constructor(canvas: HTMLCanvasElement) { this.r = new Renderer(canvas); this.club=new SunsetClub(this.r); this.r.freeze(); }
        buildCourt() {
            const r = this.r;
            r.add('box', C.dark, 0, -.22, 0, 85, .35, 85);
            r.add('box', C.outer, 0, -.025, 0, 16, .06, 29);
            r.add('box', C.court, 0, .014, 0, 10.9, .023, 20.4);
            r.add('box', rgb(0x334e42), 0, .027, 0, 8.24, .006, 11.2);
            for (const x of [-5.45, -4.12, 4.12, 5.45])
                r.add('box', C.line, x, .035, 0, .042, .01, 20.42);
            for (const z of [-10.2, 10.2])
                r.add('box', C.line, 0, .036, z, 10.94, .01, .045);
            for (const z of [-5.6, 5.6])
                r.add('box', C.line, 0, .036, z, 8.24, .01, .045);
            r.add('box', C.line, 0, .037, 0, .042, .01, 11.2);
            for (const z of [-10.05, 10.05])
                r.add('box', C.line, 0, .038, z, .045, .01, .3);
            for (const x of [-5.65, 5.65]) {
                r.add('cylinder', C.ink, x, .59, 0, .065, 1.18, .065);
                r.add('sphere', C.lime, x, 1.2, 0, .09, .09, .09);
            }
            const net = rgb(0x172821);
            for (let i = 0; i <= 70; i++) {
                const x = -5.6 + i * 11.2 / 70, h = .92 + .12 * (Math.abs(x) / 5.6) ** 2;
                r.segment(this.a.set(x, .09, 0), this.b.set(x, h, 0), .005, net);
            }
            for (let y = .14; y < .93; y += .13)
                r.segment(this.a.set(-5.6, y, 0), this.b.set(5.6, y, 0), .006, net);
            for (let i = 0; i < 28; i++) {
                const x = -5.6 + i * .4, xx = x + .4;
                r.segment(this.a.set(x, .92 + .12 * (Math.abs(x) / 5.6) ** 2, 0), this.b.set(xx, .92 + .12 * (Math.abs(xx) / 5.6) ** 2, 0), .025, C.white);
            }
            r.add('box', rgb(0x1b2c24), 0, 1.2, -15.2, 24, 2.4, .35);
            r.add('box', C.lime, 0, 2.43, -15.2, 24, .035, .39);
            for (const x of [-10.9, 10.9]) {
                r.add('box', rgb(0x1a2b23), x, .75, 0, .30, 1.5, 30);
                for (let z = -13; z <= 13; z += 3.25)
                    r.add('box', rgb(0x3d4d3b), x, 1.7, z, .065, 3.4, .065);
                r.add('box', rgb(0x3d4d3b), x, 3.4, 0, .06, .07, 29);
            }
            for (const x of [-8.8, 8.8])
                for (let i = 0; i < 8; i++) {
                    const z = -12 + i * 2;
                    r.add('box', rgb(0x324335), x, .37, z, .68, .12, .68);
                    r.add('box', rgb(0x475743), x, .61, z - .25, .67, .38, .10);
                    r.add('box', C.dark, x, .17, z, .12, .35, .4);
                }
            for (const z of [-8, 0, 8])
                for (const x of [-8, 8])
                    r.add('box', rgb(0x7b8c65), x, .025, z, 1.05, .014, .03);
            // Simple architectural type built once. No font or texture download.
            const glyph: Record<string, number[][]> = { B: [[0, 0, 0, 1], [0, 1, .6, 1], [.6, 1, .6, .55], [0, .55, .6, .55], [.6, .55, .6, 0], [0, 0, .6, 0]], A: [[0, 0, .3, 1], [.3, 1, .6, 0], [.15, .45, .45, .45]], S: [[.6, 1, 0, 1], [0, 1, 0, .55], [0, .55, .6, .55], [.6, .55, .6, 0], [.6, 0, 0, 0]], E: [[0, 0, 0, 1], [0, 1, .6, 1], [0, .5, .5, .5], [0, 0, .6, 0]], L: [[0, 1, 0, 0], [0, 0, .6, 0]], I: [[.3, 0, .3, 1]], N: [[0, 0, 0, 1], [0, 1, .6, 0], [.6, 0, .6, 1]] };
            let x = -3.65;
            for (const ch of 'BASELINE') {
                for (const q of glyph[ch])
                    r.segment(this.a.set(x + q[0] * 1.1, .74 + q[1] * .91, -14.99), this.b.set(x + q[2] * 1.1, .74 + q[3] * .91, -14.99), .034, C.line);
                x += .98;
            }
        }
        effect(x: number, z: number, kind = 0) { const e = this.effects[this.effectIndex++ % 8]; e.x = x; e.z = z; e.age = 0; e.kind = kind; e.color = kind === 1 ? C.lime : C.white; }
        resetTrail() { this.trailCount = 0; this.trailAge = 0; }
        update(g: Game, dt: number) {
            const r = this.r, p = g.player, b = g.ball;
            r.begin();
            this.club.update(g.paused?0:dt);
            const high = Math.max(0, b.p.y - 2.4);
            this.cameraKick = damp(this.cameraKick, 0, 9, dt);
            const desiredY = 2.65 + high * .30, desiredZ = p.z + 4.8 - this.cameraKick * .08;
            r.camera.x = damp(r.camera.x, p.x * .65, 4, dt);
            r.camera.y = damp(r.camera.y, desiredY, 2.8, dt);
            r.camera.z = damp(r.camera.z, desiredZ, 5, dt);
            r.target.x = damp(r.target.x, p.x * .28, 4, dt);
            r.target.y = damp(r.target.y, .43 + high * .12, 3, dt);
            r.target.z = damp(r.target.z, 3.0 + clamp(p.z - 8.2, -4, 3) * .30, 3, dt);
            if(g.ai.visual)g.ai.visual.root.visible=false;
            if(g.inspect){
                const angle=g.inspectAngle;r.camera.set(p.x+Math.sin(angle)*3.9,2.05,p.z+Math.cos(angle)*3.9);r.target.set(p.x,1.0,p.z);
            }
            p.draw(r);
            if (!g.inspect && (g.mode === 'match' || g.drill === 1))
                g.ai.draw(r);
            else
                this.machine(g.clock);
            if (g.running&&!g.inspect) {
                if (g.mode !== 'match' && g.drill === 2) {
                    const pulse = 1 + Math.sin(g.clock * 2.2) * .012;
                    r.add('ring0.94', C.lime, g.targetX, .048, g.targetZ, g.targetRadius * pulse, 1, g.targetRadius * pulse);
                    r.add('ring0.985', C.lime, g.targetX, .046, g.targetZ, (g.targetRadius + .13), 1, (g.targetRadius + .13));
                    r.add('ring0.86', C.lime, g.targetX, .05, g.targetZ, .19, 1, .19);
                }
                if (g.guides && g.predictionValid && b.last !== 1) {
                    r.add('ring0.985', C.white, g.landX, .045, g.landZ, .48, 1, .48);
                    if (g.interceptValid) {
                        r.add('ring0.94', g.ready ? C.lime : C.line, g.interceptX - .73, .046, g.interceptZ + .80, .39, 1, .29);
                        r.add('ring0.86', g.ready ? C.lime : C.line, g.interceptX - .73, .047, g.interceptZ + .80, .085, 1, .085);
                    }
                }
                if (p.charging && !g.awaitServe) {
                    r.add('ring0.985', C.white, g.aimX, .053, g.aimZ, .36, 1, .36);
                    r.add('ring0.985', this.aimDim, g.aimX, .053, g.aimZ, .54, 1, .54);
                }
            }
            if (b.active&&!g.inspect) {
                r.add('sphere', C.lime, b.p.x, b.p.y, b.p.z, BALL_R, BALL_R, BALL_R);
                r.add('sphere', C.shadow, b.p.x, .05, b.p.z, .13 + Math.min(b.p.y, 4) * .018, .01, .11);
                this.trailAge += dt;
                if (!g.paused && g.hitstop <= 0 && this.trailAge > .024) {
                    this.trailAge = 0;
                    for (let i = 14; i > 0; i--)
                        this.trail[i].copy(this.trail[i - 1]);
                    this.trail[0].copy(b.p);
                    this.trailCount = Math.min(15, this.trailCount + 1);
                }
                for (let i = 1; i < this.trailCount; i++) {
                    if (this.trail[i].dist(this.trail[i - 1]) < 1.8 && this.trail[i].dist(b.p) < 3.1)
                        r.segment(this.trail[i - 1], this.trail[i], .009 * (1 - i / 18), i < 5 ? C.lime : this.trailDim);
                }
            }
            else if (g.awaitServe&&!g.inspect) {
                r.add('sphere', C.lime, p.x - .45, p.charging ? 1.52 : 1.05, p.z - .43, BALL_R, BALL_R, BALL_R);
            }
            for (const e of this.effects) {
                if (e.age < .6) {
                    if (!g.paused)
                        e.age += dt;
                    r.add('ring0.94', e.color, e.x, .055, e.z, .12 + e.age * (e.kind ? 2.5 : .6), 1, .12 + e.age * (e.kind ? 2.5 : .6));
                }
            }
            if (g.flashAge > 0) {
                g.flashAge = Math.max(0, g.flashAge - dt);
                r.add('sphere', C.white, g.flashPos.x, g.flashPos.y, g.flashPos.z, .025, .025, .025);
            }
            r.draw();
        }
        machine(clock: number) { const r = this.r; r.add('sphere', C.shadow, 0, .027, -8.9, .59, .017, .48); r.add('sphere', C.lime, 0, .70, -8.9, .40, .48, .33); r.add('box', C.ink, 0, 1.03, -8.59, .55, .24, .12); r.add('sphere', C.white, -.14, 1.03, -8.51, .059, .066, .033); r.add('sphere', C.white, .14, 1.03, -8.51, .059, .066, .033); r.add('sphere', C.ink, 0, .69, -8.53, .15, .13, .07); r.add('cylinder', C.ink, -.39, .2, -8.9, .20, .13, .20, 0, 0, Math.PI / 2); r.add('cylinder', C.ink, .39, .2, -8.9, .20, .13, .20, 0, 0, Math.PI / 2); r.add('sphere', C.white, 0, 1.32 + Math.sin(clock * 3) * .015, -8.9, .08, .08, .08); }
    }
}
