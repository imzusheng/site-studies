declare const THREE: any;
declare const gsap: any;
namespace Rally {
    export class Bucket {
        count = 0;
        base = 0;
        capacity = 768;
        data = new Float32Array(768 * 20);
        vao: WebGLVertexArrayObject | null = null;
        buffer: WebGLBuffer | null = null;
        three: any = null;
        constructor(public geo: Geometry) { }
        add(matrix: Float32Array, color: RGB) { if (this.count >= this.capacity)
            throw new Error('Instance budget exceeded: ' + this.geo.name); const i = this.count++ * 20; this.data.set(matrix, i); this.data[i + 16] = color[0]; this.data[i + 17] = color[1]; this.data[i + 18] = color[2]; this.data[i + 19] = 1; }
    }
    export class Renderer {
        buckets = new Map<string, Bucket>();
        gl: WebGL2RenderingContext | null = null;
        program: WebGLProgram | null = null;
        nativeUniforms: Record<string, WebGLUniformLocation | null> = {};
        threeRenderer: any;
        threeScene: any;
        threeCamera: any;
        matrix3: any;
        color3: any;
        backend = 'WebGL 2';
        vp = new Float32Array(16);
        view = new Float32Array(16);
        proj = new Float32Array(16);
        camera = new V(0, 2.65, 13.0);
        target = new V(0, .43, 3.0);
        m = new Float32Array(16);
        p = new V();
        s = new V();
        x = new V();
        y = new V();
        z = new V();
        dir = new V();
        up = new V(0, 1, 0);
        quality = 'auto';
        dpr = 1;
        drawCalls = 0;
        triangles = 0;
        lastResize = 0;
        constructor(public canvas: HTMLCanvasElement) {
            if(typeof THREE==='undefined')throw new Error('Three.js 尚未载入。没有启用低精度人物替代。');
            this.initThree();
            for (const geo of [boxGeo(), sphereGeo(), cylinderGeo(), ringGeo(), ringGeo(.985), ringGeo(.86), torusGeo()])
                this.register(geo);
            this.resize();
            window.addEventListener('resize', () => this.resize());
        }
        initThree(){
            this.backend='Three.js · SkinnedMesh';this.quality='high';
            this.threeRenderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,powerPreference:'high-performance'});
            this.threeRenderer.outputColorSpace=THREE.SRGBColorSpace;this.threeRenderer.toneMapping=THREE.ACESFilmicToneMapping;this.threeRenderer.toneMappingExposure=1.0;
            this.threeRenderer.shadowMap.enabled=true;this.threeRenderer.shadowMap.type=THREE.PCFSoftShadowMap;
            this.threeScene=new THREE.Scene();this.threeScene.background=new THREE.Color(0x101713);this.threeScene.fog=new THREE.Fog(0x101713,32,78);
            this.threeCamera=new THREE.PerspectiveCamera(49,1,.08,130);
            this.threeScene.add(new THREE.HemisphereLight(0xe5eeff,0x6f7269,1.6));
            const sun=new THREE.DirectionalLight(0xfff1d9,2.8);sun.position.set(-7,11,-8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=19;sun.shadow.camera.bottom=-19;sun.shadow.camera.near=1;sun.shadow.camera.far=55;sun.shadow.bias=-.00006;sun.shadow.normalBias=.003;this.threeScene.add(sun);
            const fill=new THREE.DirectionalLight(0xdbe4ee,.45);fill.position.set(8,6,-12);this.threeScene.add(fill);
            this.matrix3=new THREE.Matrix4();this.color3=new THREE.Color();
        }
        initNative() {
            const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
            if (!gl)
                throw new Error('浏览器未启用 WebGL 2。请在桌面 Chrome / Edge / Safari 中开启硬件加速。');
            this.gl = gl;
            const vs = `#version 300 es
      precision highp float;
      layout(location=0) in vec3 position;layout(location=1) in vec3 normal;layout(location=2) in mat4 model;layout(location=6) in vec4 instanceColor;
      uniform mat4 vp;uniform vec3 eye;out vec3 vNormal;out vec3 vColor;out float vDist;
      void main(){vec4 world=model*vec4(position,1.);vec3 a=model[0].xyz,b=model[1].xyz,c=model[2].xyz;vNormal=normalize(a*normal.x/max(dot(a,a),.000001)+b*normal.y/max(dot(b,b),.000001)+c*normal.z/max(dot(c,c),.000001));vColor=instanceColor.rgb;vDist=distance(world.xyz,eye);gl_Position=vp*world;}`;
            const fs = `#version 300 es
      precision highp float;in vec3 vNormal;in vec3 vColor;in float vDist;out vec4 outColor;
      void main(){vec3 n=normalize(vNormal);float hemi=.74+.16*n.y;float direct=max(0.,dot(n,normalize(vec3(-.45,.82,.4))))*.33;vec3 c=vColor*(hemi+direct);float fog=smoothstep(29.,66.,vDist);outColor=vec4(mix(c,vec3(.0784,.1294,.1137),fog),1.);}`;
            const shader = (type: number, source: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                throw new Error(gl.getShaderInfoLog(s) || 'Shader compilation failed'); return s; };
            const pr = gl.createProgram()!;
            gl.attachShader(pr, shader(gl.VERTEX_SHADER, vs));
            gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, fs));
            gl.linkProgram(pr);
            if (!gl.getProgramParameter(pr, gl.LINK_STATUS))
                throw new Error(gl.getProgramInfoLog(pr) || 'Shader link failed');
            this.program = pr;
            this.nativeUniforms.vp = gl.getUniformLocation(pr, 'vp');
            this.nativeUniforms.eye = gl.getUniformLocation(pr, 'eye');
            gl.enable(gl.DEPTH_TEST);
            gl.disable(gl.CULL_FACE);
            gl.clearColor(.0784, .1294, .1137, 1);
            this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); document.getElementById('fatal')!.textContent = '图形上下文已暂停。请刷新页面恢复；本地设置会保留。'; document.getElementById('fatal')!.hidden = false; });
        }
        register(geo: Geometry) { const b = new Bucket(geo); this.buckets.set(geo.name, b); if (this.gl) {
            const g = this.gl;
            b.vao = g.createVertexArray();
            g.bindVertexArray(b.vao);
            for (const [loc, array] of [[0, geo.positions], [1, geo.normals]] as const) {
                const buffer = g.createBuffer();
                g.bindBuffer(g.ARRAY_BUFFER, buffer);
                g.bufferData(g.ARRAY_BUFFER, array, g.STATIC_DRAW);
                g.enableVertexAttribArray(loc);
                g.vertexAttribPointer(loc, 3, g.FLOAT, false, 0, 0);
            }
            b.buffer = g.createBuffer();
            g.bindBuffer(g.ARRAY_BUFFER, b.buffer);
            g.bufferData(g.ARRAY_BUFFER, b.data.byteLength, g.DYNAMIC_DRAW);
            for (let i = 0; i < 5; i++) {
                g.enableVertexAttribArray(2 + i);
                g.vertexAttribPointer(2 + i, 4, g.FLOAT, false, 80, i * 16);
                g.vertexAttribDivisor(2 + i, 1);
            }
            g.bindVertexArray(null);
        }
        else {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
            g.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
            b.three = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:.015,side:THREE.DoubleSide}), b.capacity);
            b.three.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            b.three.frustumCulled = false;
            b.three.receiveShadow=true; b.three.castShadow=true;
            this.threeScene.add(b.three);
        } }
        resize() { this.dpr = Math.min(devicePixelRatio || 1, this.quality === 'low' ? 1 : 2); if (this.threeRenderer) {
            this.threeRenderer.setPixelRatio(this.dpr);
            this.threeRenderer.setSize(innerWidth, innerHeight, false);
        }
        else {
            this.canvas.width = Math.round(innerWidth * this.dpr);
            this.canvas.height = Math.round(innerHeight * this.dpr);
        } perspective(this.proj, 49 * Math.PI / 180, innerWidth / innerHeight, .1, 100); }
        begin() { for (const b of this.buckets.values())
            b.count = b.base; }
        freeze() { for (const b of this.buckets.values())
            b.base = b.count; }
        add(name: string, color: RGB, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0, roll = 0, pitch = 0) { trs(this.m, this.p.set(x, y, z), this.s.set(sx, sy, sz), yaw, roll, pitch); this.buckets.get(name)!.add(this.m, color); }
        basis(name: string, color: RGB, p: V, u: V, v: V, n: V, sx = 1, sy = 1, sz = 1) { const a = this.m; a[0] = u.x * sx; a[1] = u.y * sx; a[2] = u.z * sx; a[3] = 0; a[4] = v.x * sy; a[5] = v.y * sy; a[6] = v.z * sy; a[7] = 0; a[8] = n.x * sz; a[9] = n.y * sz; a[10] = n.z * sz; a[11] = 0; a[12] = p.x; a[13] = p.y; a[14] = p.z; a[15] = 1; this.buckets.get(name)!.add(a, color); }
        segment(a: V, b: V, r: number, color: RGB) { this.y.copy(b).sub(a); const l = this.y.len(); if (l < .0001)
            return; this.y.scale(1 / l); this.x.cross(Math.abs(this.y.y) > .95 ? this.z.set(1, 0, 0) : this.up, this.y).norm(); this.z.cross(this.x, this.y).norm(); this.p.copy(a).add(b).scale(.5); this.basis('cylinder', color, this.p, this.x, this.y, this.z, r, l, r); }
        draw() {
            lookAt(this.view, this.camera, this.target);
            multiply(this.vp, this.proj, this.view);
            this.drawCalls = this.triangles = 0;
            if (this.gl) {
                const gl = this.gl;
                gl.viewport(0, 0, this.canvas.width, this.canvas.height);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                gl.useProgram(this.program);
                gl.uniformMatrix4fv(this.nativeUniforms.vp, false, this.vp);
                gl.uniform3f(this.nativeUniforms.eye, this.camera.x, this.camera.y, this.camera.z);
                for (const b of this.buckets.values()) {
                    if (!b.count)
                        continue;
                    gl.bindVertexArray(b.vao);
                    gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.count * 20);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, b.geo.positions.length / 3, b.count);
                    this.drawCalls++;
                    this.triangles += b.geo.positions.length / 9 * b.count;
                }
                gl.bindVertexArray(null);
            }
            else {
                this.threeCamera.aspect = innerWidth / innerHeight;
                this.threeCamera.updateProjectionMatrix();
                this.threeCamera.position.set(this.camera.x, this.camera.y, this.camera.z);
                this.threeCamera.lookAt(this.target.x, this.target.y, this.target.z);
                for (const b of this.buckets.values()) {
                    b.three.count = b.count;
                    for (let i = 0; i < b.count; i++) {
                        this.matrix3.fromArray(b.data, i * 20);
                        b.three.setMatrixAt(i, this.matrix3);
                        this.color3.setRGB(b.data[i * 20 + 16], b.data[i * 20 + 17], b.data[i * 20 + 18],THREE.SRGBColorSpace);
                        b.three.setColorAt(i, this.color3);
                    }
                    b.three.instanceMatrix.needsUpdate = true;
                    if (b.three.instanceColor)
                        b.three.instanceColor.needsUpdate = true;
                }
                this.threeRenderer.render(this.threeScene, this.threeCamera);
                this.drawCalls = this.threeRenderer.info.render.calls;
                this.triangles = this.threeRenderer.info.render.triangles;
            }
        }
        project(p: V, out: V) { const a = this.vp, w = a[3] * p.x + a[7] * p.y + a[11] * p.z + a[15]; out.x = (.5 + (a[0] * p.x + a[4] * p.y + a[8] * p.z + a[12]) / w * .5) * innerWidth; out.y = (.5 - (a[1] * p.x + a[5] * p.y + a[9] * p.z + a[13]) / w * .5) * innerHeight; out.z = w; return out; }
    }
}
