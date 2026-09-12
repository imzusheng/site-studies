namespace Rally {
    export class SunsetClub {
        r:Renderer;scene:any;cache:Map<string,any>;time:{value:number};seed:number;rackets:any[];leafMesh:any;
        constructor(r:Renderer) {
            this.r = r;
            this.cache = new Map();
            this.time = { value: 0 };
            this.seed = 48271;
            this.rackets = [];
            this.scene = r.threeScene;
            this.build();
            this.batchStatic();
        }
        rand() { this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0; return this.seed / 4294967296; }
        material(color:number, roughness = .85) { const k = color + ':' + roughness; if (!this.cache.has(k))
            this.cache.set(k, new THREE.MeshStandardMaterial({ color, roughness, metalness: .02 })); return this.cache.get(k); }
        mesh(g:any, m:any, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; this.scene.add(o); return o; }
        box(m:any,x:number,y:number,z:number,sx:number,sy:number,sz:number) { return this.mesh(new THREE.BoxGeometry(sx, sy, sz), m, x, y, z); }
        tube(m:any, points:number[][], radius:number, segments = 8) { const c = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))); return this.mesh(new THREE.TubeGeometry(c, Math.max(2, points.length * 3), radius, segments, false), m); }
        texture(draw:(c:CanvasRenderingContext2D,w:number,h:number)=>void, w = 1024, h = w) { const el = document.createElement('canvas'); el.width = w; el.height = h; draw(el.getContext('2d')!, w, h); const t = new THREE.CanvasTexture(el); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, this.r.threeRenderer.capabilities.getMaxAnisotropy()); return t; }
        label(text:string,x:number,y:number,z:number,width:number,height:number, color = '#d6e2d6', yaw = 0) {
            const t = this.texture((c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `500 ${h * .62}px Arial`; c.fillText(text, w / 2, h / 2, w * .97); }, 1024, 128);
            const o = this.mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }), x, y, z);
            o.rotation.y = yaw;
            o.castShadow = false;
            return o;
        }
        build() {
            const r = this.r, s = this.scene;
            s.background = new THREE.Color(0x9bc5df);
            s.fog = new THREE.Fog(0xb5cdd5, 42, 122);
            // Linear lighting in a single colour-managed pipeline. A warm key and cool sky, not grey flood fill.
            const sky = this.texture((c, w, h) => {
                const g = c.createLinearGradient(0, 0, 0, h);
                g.addColorStop(0, '#2265a2');
                g.addColorStop(.47, '#66a6d0');
                g.addColorStop(.60, '#bddbe5');
                g.addColorStop(1, '#859593');
                c.fillStyle = g;
                c.fillRect(0, 0, w, h);
                for (let j = 0; j < 60; j++) {
                    const x = this.rand() * w, y = h * (.23 + this.rand() * .27), rw = 30 + this.rand() * 120, rh = 8 + this.rand() * 20;
                    c.save();
                    c.translate(x, y);
                    c.scale(rw, rh);
                    const cloud = c.createRadialGradient(0, 0, 0, 0, 0, 1);
                    cloud.addColorStop(0, 'rgba(255,251,237,.75)');
                    cloud.addColorStop(.5, 'rgba(253,248,231,.45)');
                    cloud.addColorStop(1, 'rgba(253,250,241,0)');
                    c.fillStyle = cloud;
                    c.beginPath();
                    c.arc(0, 0, 1, 0, Math.PI * 2);
                    c.fill();
                    c.restore();
                }
            }, 2048, 1024);
            const dome = this.mesh(new THREE.SphereGeometry(110, 40, 24), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
            dome.castShadow = dome.receiveShadow = false;
            dome.renderOrder = -10;
            const court = this.texture((c, w, h) => { c.fillStyle = '#3e686a'; c.fillRect(0, 0, w, h); for (let i = 0; i < 55000; i++) {
                const a = this.rand();
                c.fillStyle = a > .5 ? 'rgba(214,231,211,.14)' : 'rgba(10,35,34,.15)';
                c.fillRect(this.rand() * w, this.rand() * h, 1 + this.rand(), 1 + this.rand());
            } });
            court.wrapS = court.wrapT = THREE.RepeatWrapping;
            court.repeat.set(4, 7);
            const ground = this.material(0x718977);
            const playing = this.material(0xffffff);
            playing.map = court;
            playing.roughness = .97;
            playing.bumpMap = court;
            playing.bumpScale = .0012;
            this.box(ground, 0, -.12, 0, 180, .20, 180).castShadow = false;
            this.box(this.material(0x597665), 0, -.007, 0, 18, .03, 30.8).castShadow = false;
            this.box(playing, 0, .014, 0, 10.90, .02, 20.40).castShadow = false;
            const line = this.material(0xedead5, .9);
            for (const x of [-5.45, -4.12, 4.12, 5.45])
                this.box(line, x, .033, 0, .043, .012, 20.45);
            for (const z of [-10.2, 10.2]) {
                this.box(line, 0, .034, z, 10.94, .012, .045);
                this.box(line, 0, .035, z + Math.sign(z) * .07, .043, .012, .15);
            }
            for (const z of [-5.6, 5.6])
                this.box(line, 0, .033, z, 8.24, .012, .044);
            this.box(line, 0, .033, 0, .043, .012, 11.2);
            const wall = this.material(0x294f4c), trim = this.material(0x87a191), steel = this.material(0x263d3d, .57), paving = this.material(0x9ca699);
            this.box(wall, 0, 1.52, -15.6, 24, 3.04, .25);
            this.box(trim, 0, 3.055, -15.6, 24, .05, .34);
            this.box(wall, -11.7, .78, 0, .25, 1.56, 31.2);
            this.box(wall, 11.7, .78, 0, .25, 1.56, 31.2);
            this.box(paving, 10.6, .04, -1, 2, .12, 28);
            this.box(paving, -10.6, .04, -1, 2, .12, 28);
            this.label('B A S E L I N E', 0, 2.15, -15.44, 9.5, .67, '#cbd9c9');
            this.label('S U N S E T   C L U B', 0, .95, -15.44, 4.8, .28, '#91afa4');
            for (const side of [-1, 1])
                for (let z = -15.5; z < 15; z += 3.1) {
                    this.box(steel, side * 11.7, 2.10, z, .052, 4.2, .052);
                }
            for (const side of [-1, 1])
                this.box(steel, side * 11.7, 4.2, 0, .055, .055, 31.2);
            for (let x = -11.7; x <= 11.7; x += 2.93)
                this.box(steel, x, 3.9, -15.6, .047, 1.70, .047);
            this.box(steel, 0, 4.72, -15.6, 23.4, .05, .05);
            const fenceTex = this.texture((c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = '#506865'; c.lineWidth = 1.3; c.beginPath(); for (let i = -h; i < w + h; i += 20) {
                c.moveTo(i, 0);
                c.lineTo(i + h, h);
                c.moveTo(i, h);
                c.lineTo(i + h, 0);
            } c.stroke(); }, 256, 256);
            fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping;
            fenceTex.repeat.set(12, 1.5);
            const fm = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: .15, side: THREE.DoubleSide, roughness: .8, depthWrite: false });
            for (const side of [-1, 1]) {
                const f = this.mesh(new THREE.PlaneGeometry(31.2, 2.60), fm, side * 11.7, 2.88, 0);
                f.rotation.y = Math.PI / 2;
                f.castShadow = false;
            }
            const backFence = this.mesh(new THREE.PlaneGeometry(23.4, 1.6), fm, 0, 3.91, -15.6);
            backFence.castShadow = false;
            // Real net geometry follows the same centre height as physics.
            const net = this.material(0x203230, .94), tape = this.material(0xe5e6d4, .85);
            for (let i = 0; i <= 112; i++) {
                const x = -5.6 + i * .1, h = .92 + .12 * (Math.abs(x) / 5.6) ** 2;
                this.tube(net, [[x, .08, 0], [x, h, 0]], .003, 4);
            }
            for (let j = 1; j < 12; j++)
                this.tube(net, [[-5.6, .08 * j, 0], [0, .08 * j, 0], [5.6, .08 * j, 0]], .003, 4);
            const top = [];
            for (let i = 0; i <= 56; i++) {
                const x = -5.6 + i * .2;
                top.push([x, .92 + .12 * (Math.abs(x) / 5.6) ** 2, 0]);
            }
            this.tube(tape, top, .019, 6);
            this.box(tape, 0, .48, 0, .027, .89, .028);
            for (const x of [-5.65, 5.65]) {
                this.mesh(new THREE.CylinderGeometry(.049, .058, 1.2, 18), steel, x, .6, 0);
                this.mesh(new THREE.SphereGeometry(.052, 16, 10), trim, x, 1.21, 0);
            }
            // Right-side clubhouse: an open pavilion, benches, bags and plants, not a closed box.
            this.box(this.material(0x244341), 15.9, 4.95, -6.3, 8.5, .24, 17.5);
            this.box(this.material(0x7d8879), 15.9, 4.76, -6.3, 8.1, .08, 17.1);
            for (const x of [12.8, 19.1])
                for (const z of [-14.2, 1.5])
                    this.box(steel, x, 2.45, z, .16, 4.8, .16);
            const wood = this.material(0x9e9475);
            for (let z = -14.5; z < 2; z += .35)
                this.box(wood, 15.8, 4.68, z, 8, .07, .10);
            this.label('PLAY  /  PRACTICE  /  PROGRESS', 11.51, 1.04, -9.1, 5, .34, '#bed09f', -Math.PI / 2);
            for (const x of [-9.7, 9.7]) {
                for (const z of [-10, -4, 3]) {
                    const bench = this.material(0x55766a);
                    this.box(bench, x, .49, z, .78, .17, 2.4);
                    this.box(bench, x + (x > 0 ? .31 : -.31), .82, z, .10, .58, 2.4);
                    for (const zz of [-.87, .87])
                        this.box(steel, x, .23, z + zz, .50, .42, .07);
                    const bag = this.mesh(new THREE.CapsuleGeometry(.20, .65, 8, 16), this.material(0x1e3535), x - .32, .53, z - .52);
                    bag.rotation.x = .45;
                    this.tube(this.material(0xc6e65b), [[x - .51, .62, z - .62], [x - .58, .93, z - .60], [x - .50, 1.04, z - .49], [x - .44, .74, z - .41]], .014);
                    const bottle = this.mesh(new THREE.CylinderGeometry(.043, .050, .25, 16), trim, x, .72, z + .40);
                    this.mesh(new THREE.CylinderGeometry(.024, .024, .05, 12), steel, x, .87, z + .40);
                }
            }
            for (const [x, z] of [[-10, -13], [10, -13], [-10, 7], [10, 7]]) {
                this.box(paving, x, .31, z, .85, .62, 1.15);
                this.box(this.material(0x34483a), x, .63, z, .72, .03, 1.02);
            }
            for (const side of [-1, 1])
                for (const z of [-16, 6]) {
                    this.mesh(new THREE.CylinderGeometry(.065, .12, 10, 12), steel, side * 14, 5, z);
                    for (const x of [-.50, 0, .50]) {
                        const lamp = this.box(steel, side * 14 + x, 10, z, .43, .24, .25);
                        lamp.rotation.x = -.35;
                        const light = this.box(this.material(0xecebd7, .26), side * 14 + x, 9.98, z + .135, .35, .15, .01);
                        light.rotation.x = -.35;
                    }
                }
            this.landscape();
        }
        landscape() {
            const bark = this.material(0x635f42), dummy = new THREE.Object3D(), color = new THREE.Color();
            const leafGeo = new THREE.BufferGeometry(), lp = [], li = [];
            for (let i = 0; i <= 6; i++) {
                const y = i / 6;
                lp.push(-Math.sin(y * Math.PI) * .40, y, Math.sin(y * Math.PI) * .13, Math.sin(y * Math.PI) * .40, y, Math.sin(y * Math.PI) * .13);
                if (i < 6) {
                    const k = i * 2;
                    li.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
                }
            }
            leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
            leafGeo.setIndex(li);
            leafGeo.computeVertexNormals();
            const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .83, side: THREE.DoubleSide });
            leafMat.onBeforeCompile = (shader:any) => { shader.uniforms.uClubTime = this.time; shader.vertexShader = 'uniform float uClubTime;\n' + shader.vertexShader; shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.x += sin(uClubTime * 1.3 + instanceMatrix[3].x * .7 + instanceMatrix[3].z) * .025 * position.y;'); };
            const placements = [];
            const trees = [];
            for (let i = 0; i < 33; i++) {
                const side = i % 2 ? 1 : -1;
                trees.push([i < 13 ? -23 + this.rand() * 46 : side * (15 + this.rand() * 14), i < 13 ? -21 - this.rand() * 10 : -12 + this.rand() * 42, 5.5 + this.rand() * 4]);
            }
            for (const [x, z, h] of trees) {
                const trunk = this.mesh(new THREE.CylinderGeometry(.09, .28, h * .71, 9), bark, x, h * .355, z);
                trunk.rotation.z = (this.rand() - .5) * .13;
                for (let b = 0; b < 5; b++) {
                    const a = b / 5 * Math.PI * 2 + this.rand() * .3, dx = Math.cos(a) * (1.0 + this.rand()), dz = Math.sin(a) * (1.0 + this.rand());
                    this.tube(bark, [[x, h * .40, z], [x + dx * .55, h * .63, z + dz * .55], [x + dx, h * .77, z + dz]], .068, 6);
                }
                for (let j = 0; j < 410; j++) {
                    const a = this.rand() * Math.PI * 2, v = this.rand() * 2 - 1, r = Math.pow(this.rand(), .34), cross = Math.sqrt(1 - v * v);
                    placements.push({ x: x + Math.cos(a) * r * cross * 2.7, y: h * .75 + v * r * 2.2, z: z + Math.sin(a) * r * cross * 2.7, scale: .25 + this.rand() * .47 });
                }
            }
            for (const [x, z] of [[-10, -13], [10, -13], [-10, 7], [10, 7]])
                for (let i = 0; i < 160; i++)
                    placements.push({ x: x + (this.rand() - .5) * .8, y: .62 + this.rand() * .75, z: z + (this.rand() - .5), scale: .16 + this.rand() * .23 });
            const leaves = new THREE.InstancedMesh(leafGeo, leafMat, placements.length);
            leaves.castShadow = leaves.receiveShadow = true;
            placements.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(this.rand() * 5, this.rand() * 6, this.rand() * 6); dummy.scale.setScalar(p.scale); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix); color.setHSL(.20 + this.rand() * .075, .29 + this.rand() * .27, .18 + this.rand() * .19); leaves.setColorAt(i, color); });
            leaves.instanceMatrix.needsUpdate = true;
            this.scene.add(leaves);
            this.leafMesh = leaves;
            // Layered mountain silhouettes are actual terrain meshes, lit and fogged with the court.
            for (let layer = 0; layer < 3; layer++) {
                const z = -59 - layer * 19, pos = [], idx = [];
                for (let i = 0; i <= 90; i++) {
                    const x = -115 + i * 230 / 90, h = 8 + layer * 3 + 5 * Math.sin(i * .19 + layer * 2) + 3 * Math.sin(i * .39) + this.rand() * 3;
                    pos.push(x, -1, z, x, h, z - 4 * Math.sin(i * .35));
                    if (i < 90) {
                        const k = i * 2;
                        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
                    }
                }
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                g.setIndex(idx);
                g.computeVertexNormals();
                const m = this.material([0x829998, 0x8ea9ae, 0x9eb8c1][layer]);
                m.side = THREE.DoubleSide;
                const mountain = this.mesh(g, m);
                mountain.castShadow = false;
            }
            const building = this.material(0x90a9ab, .64), glass = this.material(0x6e898d, .35);
            for (let i = 0; i < 11; i++) {
                const x = -21 + i * 4.1 + (this.rand() - .5) * 2, h = 4 + this.rand() * 9, z = -42 - this.rand() * 5;
                this.box(building, x, h / 2, z, 1.4 + this.rand(), h, 2.1);
                for (let j = 1; j < h; j += .55)
                    this.box(glass, x, j, z + 1.065, 1.29, .08, .03);
            }
        }
        batchStatic() {
            const groups = new Map();
            for (const o of [...this.scene.children]) {
                if (!o.isMesh || o.isInstancedMesh || o.material.transparent || o.renderOrder !== 0)
                    continue;
                const key = o.material.uuid + ':' + o.castShadow + ':' + o.receiveShadow;
                if (!groups.has(key))
                    groups.set(key, []);
                groups.get(key).push(o);
            }
            for (const list of groups.values()) {
                if (list.length < 3)
                    continue;
                const geometries = list.map((o:any) => { o.updateMatrixWorld(true); const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (!g.attributes.uv)
                    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; });
                const merged = BASELINE_ENGINE.mergeGeometries(geometries, false);
                if (!merged) {
                    geometries.forEach((g:any) => g.dispose());
                    continue;
                }
                const batch = new THREE.Mesh(merged, list[0].material);
                batch.castShadow = list[0].castShadow;
                batch.receiveShadow = list[0].receiveShadow;
                batch.name = 'Club / static batch';
                this.scene.add(batch);
                list.forEach((o:any) => { o.removeFromParent(); o.geometry.dispose(); });
                geometries.forEach((g:any) => g.dispose());
            }
        }
        update(dt:number) { this.time.value += Math.min(dt, .04); }
    }
}
