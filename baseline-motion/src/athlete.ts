namespace Rally {
    export function createClubAthlete() {
        const root = new THREE.Group();
        root.name = 'Baseline / Club athlete';
        root.userData.clubAthlete = true;
        const bones:any[] = [], ids:Record<string,number> = {}, world:Record<string,number[]> = {};
        function bone(name:string, parent:string|null, x:number, y:number, z:number) {
            const b = new THREE.Bone();
            b.name = name;
            ids[name] = bones.length;
            bones.push(b);
            world[name] = [x, y, z];
            const p = parent ? world[parent] : [0, 0, 0];
            b.position.set(x - p[0], y - p[1], z - p[2]);
            (parent ? bones[ids[parent]] : root).add(b);
            return b;
        }
        bone('hips', null, 0, .96, 0);
        bone('spine', 'hips', 0, 1.08, 0);
        bone('spine1', 'spine', 0, 1.25, 0);
        bone('spine2', 'spine1', 0, 1.40, 0);
        bone('neck', 'spine2', 0, 1.51, 0);
        bone('head', 'neck', 0, 1.63, 0);
        bone('headtopend', 'head', 0, 1.83, 0);
        for (const side of ['left', 'right']) {
            const s = side === 'right' ? 1 : -1;
            bone(side + 'shoulder', 'spine2', s * .105, 1.425, 0);
            bone(side + 'arm', side + 'shoulder', s * .205, 1.425, 0);
            bone(side + 'forearm', side + 'arm', s * .500, 1.425, 0);
            bone(side + 'hand', side + 'forearm', s * .765, 1.425, 0);
            for (const [f, z, len] of ([['index', -.030, .078], ['middle', -.010, .086], ['ring', .012, .079], ['pinky', .032, .063]] as [string,number,number][])) {
                const start = .817;
                for (let j = 1; j <= 4; j++)
                    bone(side + 'hand' + f + j, j === 1 ? side + 'hand' : side + 'hand' + f + (j - 1), s * (start + (j - 1) * len / 3), 1.425, z);
            }
            for (let j = 1; j <= 4; j++)
                bone(side + 'handthumb' + j, j === 1 ? side + 'hand' : side + 'handthumb' + (j - 1), s * (.787 + (j - 1) * .022), 1.417, -.041 - (j - 1) * .006);
            bone(side + 'upleg', 'hips', s * .099, .94, 0);
            bone(side + 'leg', side + 'upleg', s * .102, .53, -.012);
            bone(side + 'foot', side + 'leg', s * .102, .115, .013);
            bone(side + 'toebase', side + 'foot', s * .102, .054, -.13);
            bone(side + 'toeend', side + 'toebase', s * .102, .043, -.235);
        }
        bone('hair1', 'head', 0, 1.70, .115);
        bone('hair2', 'hair1', 0, 1.55, .20);
        bone('hair3', 'hair2', 0, 1.38, .245);
        root.updateMatrixWorld(true);
        const skeleton = new THREE.Skeleton(bones);
        const fixed = (name:string) => (_x:number, _y:number, _z:number) => [ids[name], ids[name], 1, 0];
        function blend(a:string, b:string, t:number) { t = Math.max(0, Math.min(1, t)); t = t * t * (3 - 2 * t); return [ids[a], ids[b], 1 - t, t]; }
        function bodyW(x:number, y:number, z:number) {
            if (y < 1.12)
                return blend('hips', 'spine', (y - .98) / .14);
            if (y < 1.30)
                return blend('spine', 'spine1', (y - 1.12) / .18);
            return blend('spine1', 'spine2', (y - 1.30) / .12);
        }
        const fabric = document.createElement('canvas');
        fabric.width = fabric.height = 128;
        const ctx = fabric.getContext('2d')!;
        ctx.fillStyle = '#999';
        ctx.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 2)
            for (let x = 0; x < 128; x += 2) {
                ctx.fillStyle = ((x + y) % 4) ? '#777' : '#aaa';
                ctx.fillRect(x, y, 1, 2);
            }
        const knit = new THREE.CanvasTexture(fabric);
        knit.wrapS = knit.wrapT = THREE.RepeatWrapping;
        knit.repeat.set(7, 7);
        const materials:Record<string,any> = {
            skin: new THREE.MeshPhysicalMaterial({ color: 0xe6b497, roughness: .53, metalness: 0, clearcoat: .06, clearcoatRoughness: .6 }),
            kit: new THREE.MeshPhysicalMaterial({ color: 0x192e31, roughness: .82, sheen: .35, sheenColor: 0x799997, bumpMap: knit, bumpScale: .0007 }),
            white: new THREE.MeshStandardMaterial({ color: 0xf1f0e9, roughness: .84, bumpMap: knit, bumpScale: .0004, side: THREE.DoubleSide }),
            lime: new THREE.MeshStandardMaterial({ color: 0xc2e745, roughness: .57 }),
            hair: new THREE.MeshStandardMaterial({ color: 0x30251f, roughness: .59 }),
            dark: new THREE.MeshStandardMaterial({ color: 0x111e20, roughness: .65 }),
            sole: new THREE.MeshStandardMaterial({ color: 0xd8dcd2, roughness: .95 }),
            eye: new THREE.MeshPhysicalMaterial({ color: 0xf7efdf, roughness: .23 }),
            iris: new THREE.MeshStandardMaterial({ color: 0x58645e, roughness: .3 }),
            lip: new THREE.MeshStandardMaterial({ color: 0xad7769, roughness: .66 }),
        };
        const groups:Record<string,{p:number[];uv:number[];idx:number[];si:number[];sw:number[];n:number[]}> = {};
        function geom(g:any, mat:string, w:(x:number,y:number,z:number)=>number[], m?:any) {
            if (m)
                g.applyMatrix4(m);
            const out = groups[mat] || (groups[mat] = { p: [], uv: [], idx: [], si: [], sw: [], n: [] });
            const a = g.attributes.position, uv = g.attributes.uv, offset = out.p.length / 3;
            for (let i = 0; i < a.count; i++) {
                const x = a.getX(i), y = a.getY(i), z = a.getZ(i), q = w(x, y, z);
                out.p.push(x, y, z);
                const normal=g.attributes.normal;out.n.push(normal?normal.getX(i):0,normal?normal.getY(i):1,normal?normal.getZ(i):0);
                out.uv.push(uv ? uv.getX(i) : x, uv ? uv.getY(i) : y);
                out.si.push(q[0], q[1], 0, 0);
                out.sw.push(q[2], q[3], 0, 0);
            }
            if (g.index)
                for (let i = 0; i < g.index.count; i++)
                    out.idx.push(offset + g.index.array[i]);
            else
                for (let i = 0; i < a.count; i++)
                    out.idx.push(offset + i);
            g.dispose();
        }
        function buildContinuousBody(){
            // Analytic profile volumes blended before meshing: shoulder/hip/elbow geometry is
            // connected, rather than separate cylinders whose end rings tear apart in an IK pose.
            const torso=[[.86,.070,.074],[.925,.160,.106],[1.02,.149,.096],[1.12,.130,.089],[1.22,.137,.093],[1.33,.172,.102],[1.405,.190,.091],[1.45,.173,.073],[1.485,.073,.053],[1.54,.047,.044]];
            const arm=[[.135,.065,.066],[.225,.062,.062],[.30,.056,.053],[.415,.038,.039],[.50,.032,.034],[.56,.039,.037],[.66,.029,.030],[.738,.018,.022],[.777,.019,.026],[.81,.019,.041],[.842,.010,.036]];
            const leg=[[.085,.030,.035],[.19,.035,.040],[.31,.054,.054],[.40,.057,.055],[.485,.047,.050],[.55,.052,.056],[.67,.075,.077],[.81,.088,.090],[.96,.092,.096]];
            function profile(u:number,a:number,b:number,pr:number[][]){
                const k=Math.max(0,Math.min(pr.length-2,pr.findIndex((p,i)=>i<pr.length-1&&u<pr[i+1][0])));
                const j=u>=pr[pr.length-1][0]?pr.length-2:k, p=pr[j],q=pr[j+1];
                const t=clamp((u-p[0])/(q[0]-p[0]));const r=mix(p[1],q[1],t),s=mix(p[2],q[2],t);
                return Math.max((Math.sqrt(a*a/(r*r)+b*b/(s*s))-1)*Math.min(r,s),pr[0][0]-u,u-pr[pr.length-1][0]);
            }
            const union=(a:number,b:number,k:number)=>{const h=clamp(.5+.5*(b-a)/k);return mix(b,a,h)-k*h*(1-h);};
            const N=116, mc=new BASELINE_ENGINE.MarchingCubes(N,materials.skin,false,false,160000);
            mc.isolation=0;
            for(let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
                const px=(x/N-.5)*1.84,py=.055+y/N*1.52,pz=(z/N-.5)*.39;
                let d=profile(py,px,pz,torso);
                d=union(d,profile(Math.abs(px),py-1.425,pz,arm),.035);
                for(const side of [-1,1]) d=union(d,profile(py,px-side*.102,pz+(py>.42&&py<.60?.010:0),leg),.030);
                mc.field[x+y*N+z*N*N]=-d;
            }
            mc.update();
            const src=mc.geometry,pos=src.attributes.position,normal=src.attributes.normal,count=src.drawRange.count;
            // Full four-bone normalized weights; distribution follows anatomy, not materials.
            const bodyWeights=(x:number,y:number,z:number):[number[],number[]]=>{
                const side=x<0?'left':'right',ax=Math.abs(x);let names:string[],weights:number[];
                if(y>1.31&&ax>.145){
                    const root=clamp((ax-.145)/.115),elbow=smooth(clamp((ax-.45)/.10)),wrist=smooth(clamp((ax-.724)/.072));
                    names=['spine2',side+'arm',side+'forearm',side+'hand'];weights=[1-root,root*(1-elbow),root*elbow*(1-wrist),root*elbow*wrist];
                }else if(y<.975){
                    const hip=smooth(clamp((y-.84)/.13)),knee=smooth(clamp((.575-y)/.105)),ankle=smooth(clamp((.17-y)/.07));
                    names=['hips',side+'upleg',side+'leg',side+'foot'];weights=[hip,(1-hip)*(1-knee),(1-hip)*knee*(1-ankle),(1-hip)*knee*ankle];
                }else{
                    const b=bodyW(x,y,z);names=[];return [[b[0],b[1],ids.neck,0],[b[2]*(1-smooth(clamp((y-1.46)/.08))),b[3]*(1-smooth(clamp((y-1.46)/.08))),smooth(clamp((y-1.46)/.08)),0]];
                }
                return [names.map(n=>ids[n]),weights];
            };
            // Material boundaries belong to the same outer topology, so there is no skin shell
            // to push through the vest, wristbands, shorts or socks when a joint bends.
            const materialAt=(x:number,y:number,z:number)=>{
                if(y>.70&&y<1.04)return 'white';
                if(y>1.085&&y<1.475&&Math.abs(x)<.193)return 'kit';
                if(y<.267)return y>.242&&y<.254?'lime':'white';
                if(y>1.32&&Math.abs(x)>.694&&Math.abs(x)<.742)return 'white';
                return 'skin';
            };
            // Split at garment seams before assigning materials. Per-triangle material tests
            // alone create saw-tooth collars/hems, especially at a rotating shoulder.
            type Vertex={x:number;y:number;z:number;nx:number;ny:number;nz:number};
            const cuts:[keyof Vertex,number][]=[['y',.242],['y',.254],['y',.267],['y',.70],['y',1.04],['y',1.085],['y',1.32],['y',1.475],['x',-.742],['x',-.694],['x',-.193],['x',.193],['x',.694],['x',.742]];
            function clip(poly:Vertex[],key:keyof Vertex,value:number,positive:boolean){
                const out:Vertex[]=[];
                for(let i=0;i<poly.length;i++){
                    const a=poly[i],b=poly[(i+1)%poly.length],da=a[key]-value,db=b[key]-value;
                    if(positive?da>=0:da<=0)out.push(a);
                    if(da*db<0){const t=da/(da-db);out.push({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t),nx:mix(a.nx,b.nx,t),ny:mix(a.ny,b.ny,t),nz:mix(a.nz,b.nz,t)});}
                }
                return out;
            }
            for(let i=0;i<count;i+=3){
                let polys:Vertex[][]=[Array.from({length:3},(_,k)=>{const j=i+k;return {x:pos.getX(j)*.92,y:.815+pos.getY(j)*.76,z:pos.getZ(j)*.195,nx:normal.getX(j)/.92,ny:normal.getY(j)/.76,nz:normal.getZ(j)/.195};})];
                for(const [key,value] of cuts){const pieces:Vertex[][]=[];
                    for(const poly of polys){if(poly.some(v=>v[key]>value)&&poly.some(v=>v[key]<value)){const a=clip(poly,key,value,true),b=clip(poly,key,value,false);if(a.length>=3)pieces.push(a);if(b.length>=3)pieces.push(b);}else pieces.push(poly);}
                    polys=pieces;
                }
                for(const poly of polys){
                    const cx=poly.reduce((s,v)=>s+v.x,0)/poly.length,cy=poly.reduce((s,v)=>s+v.y,0)/poly.length,cz=poly.reduce((s,v)=>s+v.z,0)/poly.length;
                    const name=materialAt(cx,cy,cz),out=groups[name]||(groups[name]={p:[],n:[],uv:[],si:[],sw:[],idx:[]});
                    for(let k=1;k<poly.length-1;k++)for(const v of [poly[0],poly[k],poly[k+1]]){
                        const {x,y,z,nx,ny,nz}=v,len=Math.hypot(nx,ny,nz)||1;
                        out.idx.push(out.p.length/3);out.p.push(x,y,z);out.uv.push(Math.atan2(z,x)/(Math.PI*2),y);out.n.push(nx/len,ny/len,nz/len);
                        const [bi,bw]=bodyWeights(x,y,z);out.si.push(...bi);out.sw.push(...bw);
                    }
                }
            }
            src.dispose();
        }

        const v = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
        function ell(mat:string, w:(x:number,y:number,z:number)=>number[], p:number[], s:number[], rot = 0) {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
            m.compose(v.set(...p), q, new THREE.Vector3(...s));
            geom(new THREE.SphereGeometry(1, 32, 22), mat, w, m);
        }
        function tube(mat:string, w:(x:number,y:number,z:number)=>number[], points:number[][], radius:number) {
            const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
            geom(new THREE.TubeGeometry(curve, Math.max(10, points.length * 5), radius, 8, false), mat, w);
        }
        // Catmull-Rom profile interpolation: continuous silhouette without visible joint spheres.
        function loft(mat:string, w:(x:number,y:number,z:number)=>number[], profile:number[][], axis = 'y', segments = 40, detail = 5, pleats = 0) {
            const pos = [], uv = [], ind = [];
            const count = (profile.length - 1) * detail;
            function cat(k:number, t:number, i:number) { const a = profile[Math.max(0, k - 1)][i] || 0, b = profile[k][i] || 0, c = profile[Math.min(profile.length - 1, k + 1)][i] || 0, d = profile[Math.min(profile.length - 1, k + 2)][i] || 0; return .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t); }
            for (let j = 0; j <= count; j++) {
                const k = Math.min(profile.length - 2, Math.floor(j / detail)), t = (j - k * detail) / detail;
                const u = cat(k, t, 0), r1 = Math.max(.0005, cat(k, t, 1)), r2 = Math.max(.0005, cat(k, t, 2)), c1 = cat(k, t, 3), c2 = cat(k, t, 4);
                for (let i = 0; i <= segments; i++) {
                    const angle = i / segments * Math.PI * 2, flute = pleats ? (1 + pleats * Math.cos(angle * 16) * Math.pow(1 - j / count, 1.2)) : 1;
                    let x = axis === 'y' ? c1 + Math.cos(angle) * r1 * flute : u, y = axis === 'y' ? u : c1 + Math.cos(angle) * r1, z = c2 + Math.sin(angle) * r2 * flute;
                    // Subtle nose, brow and cheek planes are part of the head surface.
                    if (mat === 'skin' && axis === 'y' && profile[0][0] > 1.5 && Math.sin(angle) < 0) {
                        const front = Math.pow(Math.max(0, -Math.sin(angle)), 6);
                        z -= front * (.024 * Math.exp(-Math.pow(x / .026, 2) - Math.pow((y - 1.657) / .034, 2)) + .006 * Math.exp(-Math.pow((y - 1.695) / .020, 2)));
                    }
                    pos.push(x, y, z);
                    uv.push(i / segments, j / count);
                    if (j < count && i < segments) {
                        const a = j * (segments + 1) + i, b = a + segments + 1;
                        if (axis === 'x')
                            ind.push(a, a + 1, b, b, a + 1, b + 1);
                        else
                            ind.push(a, b, a + 1, b, b + 1, a + 1);
                    }
                }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
            g.setIndex(ind);
            g.computeVertexNormals();geom(g, mat, w);
        }
        // The clothed body is one continuous skin surface. Covered body triangles do not exist
        // under another clothing shell. Shared shoulder/hip vertices cannot open into gaps.
        buildContinuousBody();
        for (const s of [-1, 1]) {
            const side = s === 1 ? 'right' : 'left';
            for (const [f, z, len] of ([['index', -.030, .078], ['middle', -.010, .086], ['ring', .012, .079], ['pinky', .032, .063], ['thumb', -.041, .066]] as [string,number,number][])) {
                const start = f === 'thumb' ? .787 : .817;
                const fw = (x:number, y:number, zz:number) => { const t = Math.max(0, Math.min(2.999, (Math.abs(x) - start) / (len / 3))), j = Math.min(2, Math.floor(t)); return blend(side + 'hand' + f + (j + 1), side + 'hand' + f + (j + 2), t - j); };
                const fp = Array.from({ length: 7 }, (_, i) => [s * (start + i * len / 6), i === 6 ? .001 : (f === 'thumb' ? .009 : .008) * (1 - i * .055), i === 6 ? .001 : .008 * (1 - i * .055), f === 'thumb' ? 1.417 : 1.425, z - (f === 'thumb' ? i * .003 : 0)]);
                if (s < 0)
                    fp.reverse();
                loft('skin', fw, fp, 'x', 16, 3);
            }
            const footW = (x:number, y:number, z:number) => blend(side + 'foot', side + 'toebase', (-z - .115) / .085);
            ell('sole', footW, [s * .102, .044, -.063], [.058, .027, .171]);
            ell('white', footW, [s * .102, .083, -.068], [.053, .053, .159]);
            ell('kit', fixed(side + 'foot'), [s * .102, .097, .059], [.051, .033, .025]);
            tube('lime', footW, [[s * .153, .067, .049], [s * .155, .070, -.025], [s * .147, .069, -.10]], .008);
            for (let j = 0; j < 5; j++)
                tube('dark', footW, [[s * .08, .127 - j * .002, -.03 - j * .020], [s * .125, .127 - j * .002, -.042 - j * .020]], .0022);
            for (let j = 0; j < 3; j++)
                tube('sole', footW, [[s * .058, .033, -.13 - j * .029], [s * .147, .033, -.13 - j * .029]], .003);
            tube('lime', fixed(side + 'foot'), [[s * .102, .088, .084], [s * .102, .14, .074]], .010);
        }
        const headW = (x:number,y:number,z:number)=>blend('neck','head',(y-1.535)/.065);
        loft('skin', headW, [[1.535, .046, .044], [1.552, .047, .046], [1.587, .067, .069], [1.637, .085, .080], [1.695, .087, .082], [1.748, .086, .080], [1.787, .071, .067], [1.82, .020, .025]], 'y', 64, 7);
        for (const s of [-1, 1]) {
            ell('skin', headW, [s * .087, 1.675, .007], [.014, .028, .020]);
            ell('eye', headW, [s * .037, 1.691, -.084], [.020, .011, .006]);
            ell('iris', headW, [s * .037, 1.691, -.090], [.008, .008, .003]);
            ell('dark', headW, [s * .037, 1.691, -.092], [.0039, .005, .002]);
            tube('hair', headW, [[s * .017, 1.712, -.080], [s * .038, 1.715, -.078], [s * .057, 1.710, -.069]], .003);
            tube('hair', headW, [[s * .019, 1.697, -.082], [s * .037, 1.701, -.083], [s * .055, 1.695, -.075]], .0018);
        }
        ell('skin',headW,[0,1.653,-.099],[.013,.015,.010]);
        tube('lip', headW, [[-.019, 1.613, -.075], [0, 1.611, -.084], [.019, 1.613, -.075]], .0026);
        // Fitted cap, bill and panel seams. Hair is a small opaque mesh, not alpha strands.
        const cap = new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI * .49);
        m.compose(new THREE.Vector3(0, 1.718, .008), new THREE.Quaternion(), new THREE.Vector3(.099, .12, .098));
        geom(cap, 'kit', headW, m);
        ell('kit', headW, [0, 1.727, -.103], [.118, .008, .092]);
        ell('white', headW, [0, 1.723, -.106], [.115, .0025, .091]);
        for (const a of [0, Math.PI / 3, -Math.PI / 3, Math.PI]) {
            const points = [];
            for (let j = 1; j <= 12; j++) {
                const t = j / 12 * Math.PI * .48;
                points.push([Math.sin(t) * Math.sin(a) * .099, 1.718 + Math.cos(t) * .12, .008 - Math.sin(t) * Math.cos(a) * .098]);
            }
            tube('dark', headW, points, .0012);
        }
        for (const x of [-.009, .008])
            tube('lime', headW, [[x - .008, 1.75, -.092], [x + .005, 1.773, -.082]], .003);
        ell('hair', headW, [0, 1.678, .064], [.083, .074, .048]);
        tube('hair', (x:number, y:number, z:number) => y > 1.58 ? blend('head', 'hair1', (1.72 - y) / .14) : blend('hair1', 'hair2', (1.58 - y) / .17), [[0, 1.716, .091], [0, 1.663, .163], [.015, 1.545, .214], [.026, 1.40, .25], [.036, 1.36, .265]], .032);
        ell('lime', fixed('hair1'), [0, 1.694, .126], [.034, .012, .026]);
        root.updateMatrixWorld(true);
        for (const [name, data] of Object.entries(groups)) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(data.p, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
            g.setIndex(data.idx);
            g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(data.si, 4));
            g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(data.sw, 4));
            g.setAttribute('normal',new THREE.Float32BufferAttribute(data.n,3));
            const mesh = new THREE.SkinnedMesh(g, materials[name]);
            mesh.name = 'Athlete / ' + name;
            mesh.frustumCulled = false;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            root.add(mesh);
            mesh.bind(skeleton);
        }
        root.userData.height = 1.838;
        root.userData.units = "metres";
        root.userData.connectedGarment = true;
        return { scene: root, animations: [], userData: { originalAsset: true } };
    }
}
