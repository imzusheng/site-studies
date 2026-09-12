namespace Rally {
    export const TAU = Math.PI * 2, FIXED = 1 / 120;
    export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
    export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
    export const damp = (a: number, b: number, k: number, dt: number) => mix(a, b, 1 - Math.exp(-k * dt));
    export class V {
        constructor(public x = 0, public y = 0, public z = 0) { }
        set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v: V) { return this.set(v.x, v.y, v.z); }
        add(v: V) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
        sub(v: V) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
        scale(t: number) { this.x *= t; this.y *= t; this.z *= t; return this; }
        addScaled(v: V, t: number) { this.x += v.x * t; this.y += v.y * t; this.z += v.z * t; return this; }
        dot(v: V) { return this.x * v.x + this.y * v.y + this.z * v.z; }
        len() { return Math.hypot(this.x, this.y, this.z); }
        norm() { return this.scale(1 / (this.len() || 1)); }
        cross(a: V, b: V) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
        lerp(a: V, b: V, t: number) { return this.set(mix(a.x, b.x, t), mix(a.y, b.y, t), mix(a.z, b.z, t)); }
        dist(v: V) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    }
    export type RGB = [
        number,
        number,
        number
    ];
    export function rgb(hex: number): RGB { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
    export const C = { lime: rgb(0xc7ef49), court: rgb(0x38574b), dark: rgb(0x14211d), outer: rgb(0x263a31), white: rgb(0xf0f0da), skin: rgb(0xdeac81), ink: rgb(0x151e1d), shoe: rgb(0xf0ecd9), orange: rgb(0xf8b86b), line: rgb(0xc5d1b0), shadow: rgb(0x233b30) };
    export function identity(a: Float32Array) { a.fill(0); a[0] = a[5] = a[10] = a[15] = 1; return a; }
    export function perspective(a: Float32Array, fov: number, aspect: number, near: number, far: number) { a.fill(0); const f = 1 / Math.tan(fov / 2); a[0] = f / aspect; a[5] = f; a[10] = (far + near) / (near - far); a[11] = -1; a[14] = 2 * far * near / (near - far); return a; }
    const mx = new V(), my = new V(), mz = new V(), up = new V(0, 1, 0);
    export function lookAt(a: Float32Array, eye: V, target: V) { mz.copy(eye).sub(target).norm(); mx.cross(up, mz).norm(); my.cross(mz, mx); a[0] = mx.x; a[1] = my.x; a[2] = mz.x; a[3] = 0; a[4] = mx.y; a[5] = my.y; a[6] = mz.y; a[7] = 0; a[8] = mx.z; a[9] = my.z; a[10] = mz.z; a[11] = 0; a[12] = -mx.dot(eye); a[13] = -my.dot(eye); a[14] = -mz.dot(eye); a[15] = 1; return a; }
    export function multiply(out: Float32Array, a: Float32Array, b: Float32Array) { for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return out; }
    export function trs(a: Float32Array, p: V, s: V, yaw = 0, roll = 0, pitch = 0) { const cy = Math.cos(yaw), sy = Math.sin(yaw), cz = Math.cos(roll), sz = Math.sin(roll), cx = Math.cos(pitch), sx = Math.sin(pitch); a[0] = (cy * cz + sy * sx * sz) * s.x; a[1] = cx * sz * s.x; a[2] = (-sy * cz + cy * sx * sz) * s.x; a[3] = 0; a[4] = (-cy * sz + sy * sx * cz) * s.y; a[5] = cx * cz * s.y; a[6] = (sy * sz + cy * sx * cz) * s.y; a[7] = 0; a[8] = sy * cx * s.z; a[9] = -sx * s.z; a[10] = cy * cx * s.z; a[11] = 0; a[12] = p.x; a[13] = p.y; a[14] = p.z; a[15] = 1; return a; }
    export interface Geometry {
        name: string;
        positions: Float32Array;
        normals: Float32Array;
    }
    export class GeoBuilder {
        p: number[] = [];
        n: number[] = [];
        tri(a: number[], b: number[], c: number[], na?: number[], nb?: number[], nc?: number[]) { if (!na) {
            const u = new V(b[0] - a[0], b[1] - a[1], b[2] - a[2]), v = new V(c[0] - a[0], c[1] - a[1], c[2] - a[2]), n = new V().cross(u, v).norm();
            na = nb = nc = [n.x, n.y, n.z];
        } this.p.push(...a, ...b, ...c); this.n.push(...na, ...(nb || na), ...(nc || na)); }
        quad(a: number[], b: number[], c: number[], d: number[], normal?: number[]) { this.tri(a, b, c, normal, normal, normal); this.tri(a, c, d, normal, normal, normal); }
        finish(name: string): Geometry { return { name, positions: new Float32Array(this.p), normals: new Float32Array(this.n) }; }
    }
    export function boxGeo(): Geometry { const b = new GeoBuilder(); b.quad([-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]); b.quad([.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]); b.quad([-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]); b.quad([.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]); b.quad([-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]); b.quad([-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]); return b.finish('box'); }
    export function sphereGeo(n = 12, m = 8): Geometry { const b = new GeoBuilder(); const p = (u: number, v: number) => [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)]; for (let y = 0; y < m; y++)
        for (let x = 0; x < n; x++) {
            const a = p(x / n * TAU, y / m * Math.PI), c = p((x + 1) / n * TAU, (y + 1) / m * Math.PI), d = p(x / n * TAU, (y + 1) / m * Math.PI), e = p((x + 1) / n * TAU, y / m * Math.PI);
            b.tri(a, d, c, a, d, c);
            b.tri(a, c, e, a, c, e);
        } return b.finish('sphere'); }
    export function cylinderGeo(n = 10): Geometry { const b = new GeoBuilder(); for (let i = 0; i < n; i++) {
        let t = i / n * TAU, s = (i + 1) / n * TAU;
        const a = [Math.cos(t), -.5, Math.sin(t)], d = [Math.cos(s), -.5, Math.sin(s)], c = [d[0], .5, d[2]], e = [a[0], .5, a[2]], na = [a[0], 0, a[2]], nd = [d[0], 0, d[2]];
        b.tri(a, e, c, na, na, nd);
        b.tri(a, c, d, na, nd, nd);
        b.tri([0, .5, 0], c, e, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
        b.tri([0, -.5, 0], a, d, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
    } return b.finish('cylinder'); }
    export function ringGeo(inner = .94, n = 64): Geometry { const b = new GeoBuilder(); for (let i = 0; i < n; i++) {
        const t = i / n * TAU, s = (i + 1) / n * TAU;
        b.quad([inner * Math.cos(t), 0, inner * Math.sin(t)], [Math.cos(t), 0, Math.sin(t)], [Math.cos(s), 0, Math.sin(s)], [inner * Math.cos(s), 0, inner * Math.sin(s)], [0, 1, 0]);
    } return b.finish('ring' + inner); }
    export function torusGeo(n = 32, m = 5): Geometry { const b = new GeoBuilder(); const p = (u: number, v: number) => [(1 + .045 * Math.cos(v)) * Math.cos(u), (1 + .045 * Math.cos(v)) * Math.sin(u), .045 * Math.sin(v)]; for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++) {
            const a = p(i / n * TAU, j / m * TAU), d = p((i + 1) / n * TAU, j / m * TAU), c = p((i + 1) / n * TAU, (j + 1) / m * TAU), e = p(i / n * TAU, (j + 1) / m * TAU);
            b.quad(a, d, c, e);
        } return b.finish('torus'); }
}
