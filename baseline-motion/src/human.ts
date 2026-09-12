declare const BASELINE_ENGINE: any;
namespace Rally {
    type BoneInfo={ bone:any; position:any; quaternion:any; scale:any };
    const MODEL_URLS=[
        'https://threejs.org/examples/models/gltf/Michelle.glb',
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/Michelle.glb',
        'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Michelle.glb'
    ];
    export async function loadHumanAsset(progress:(s:string)=>void){
        const loader=new BASELINE_ENGINE.GLTFLoader();
        const draco=new BASELINE_ENGINE.DRACOLoader();
        draco.setDecoderPath((window as any).BASELINE_DECODER_PATH||'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/');
        loader.setDRACOLoader(draco);
        const embedded=(window as any).BASELINE_MODEL_DATA;
        if(embedded){try{const bytes=Uint8Array.from(atob(embedded),(c:string)=>c.charCodeAt(0));return await loader.parseAsync(bytes.buffer,'');}finally{draco.dispose();}}
        const errors:string[]=[];
        for(const url of MODEL_URLS){
            try{
                progress('正在载入蒙皮人物与贴图…');
                const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
                if(!response.ok)throw new Error(String(response.status));
                const bytes=await response.arrayBuffer();
                if(new DataView(bytes).getUint32(0,true)!==0x46546c67)throw new Error('模型内容不是 GLB');
                const gltf=await loader.parseAsync(bytes,'');
                draco.dispose();return gltf;
            }catch(e){errors.push(String(e));}
        }
        draco.dispose();throw new Error('人物资源未能载入。可以重试，或选择本地 Mixamo GLB。未启用方块人物替代。\n'+errors.join('\n'));
    }
    /** A real SkinnedMesh rig. No boxes, capsules or substitute body geometry are rendered. */
    export class HumanRig {
        root:any;model:any; bones:Record<string,any>={};rest:BoneInfo[]=[];baseYaw=0;restHipY=0;
        v=Array.from({length:24},()=>new THREE.Vector3());q=Array.from({length:12},()=>new THREE.Quaternion());
        matrix=new THREE.Matrix4();up=new THREE.Vector3(0,1,0);right=new THREE.Vector3(1,0,0);
        palm:Record<string,any>={};fingerCurls:any[]=[];triangles=0;diagnostic={handGap:0,reachCorrection:0,feet:[0,0]};
        constructor(source:any,scene:any){
            this.root=new THREE.Group();this.model=BASELINE_ENGINE.cloneSkeleton(source.scene);this.root.add(this.model);scene.add(this.root);
            // GLB 骨骼载入时已是绑定姿态；skeleton.pose() 假定根骨骼父级为单位矩阵，
            // 遇到带缩放的父节点（如本模型的 Character scale 0.01）会把骨架缩放重复叠加。
            this.model.traverse((o:any)=>{if(o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;this.triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;}
                if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if('roughness' in m)m.roughness=Math.max(.42,m.roughness);if(m.map)m.map.anisotropy=8;} }
                if(o.isBone){const key=o.name.toLowerCase().replace(/mixamorig[:_]?/g,'').replace(/[^a-z0-9]/g,'');this.bones[key]=o;}});
            this.root.updateMatrixWorld(true);
            // 蒙皮网格的世界包围盒在渲染器更新骨架之前不可靠（会塌缩到接近 0），
            // 因此高度与落地面从骨骼世界坐标测量。
            const box=new THREE.Box3();
            this.model.traverse((o:any)=>{if(o.isBone)box.expandByPoint(this.pos(o,new THREE.Vector3()));});
            const height=box.max.y-box.min.y;
            const required=['hips','spine','rightarm','rightforearm','righthand','leftarm','leftforearm','lefthand','rightupleg','rightleg','rightfoot','righttoebase','leftupleg','leftleg','leftfoot','lefttoebase'];
            const missing=required.filter(n=>!this.bones[n]);if(missing.length||height<.1){this.root.removeFromParent();throw new Error('需要完整 Mixamo 骨骼，缺少：'+missing.join(', '));}
            const scale=1.88/height;this.model.scale.multiplyScalar(scale);this.model.position.y-=box.min.y*scale;
            this.root.updateMatrixWorld(true);
            const r=this.pos(this.bones.rightarm,this.v[0]),l=this.pos(this.bones.leftarm,this.v[1]);this.v[2].subVectors(r,l);this.baseYaw=Math.atan2(this.v[2].z,this.v[2].x);
            this.restHipY=this.pos(this.bones.hips,this.v[0]).y;
            this.model.traverse((o:any)=>{if(o.isBone)this.rest.push({bone:o,position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()});});
            for(const side of ['right','left'])this.capturePalm(side);
        }
        pos(b:any,out:any){return b.getWorldPosition(out);}
        capturePalm(side:string){
            const h=this.bones[side+'hand'],middle=this.bones[side+'handmiddle1'],index=this.bones[side+'handindex1'],pinky=this.bones[side+'handpinky1'];
            if(!h||!middle||!index||!pinky)return;
            const hp=this.pos(h,new THREE.Vector3()),forward=this.pos(middle,new THREE.Vector3()).sub(hp).normalize();
            const across=this.pos(index,new THREE.Vector3()).sub(this.pos(pinky,new THREE.Vector3())).normalize();
            across.addScaledVector(forward,-across.dot(forward)).normalize();const normal=new THREE.Vector3().crossVectors(across,forward).normalize();
            const inv=h.getWorldQuaternion(new THREE.Quaternion()).invert();
            const localForward=forward.clone().applyQuaternion(inv),localAcross=across.clone().applyQuaternion(inv),localNormal=normal.clone().applyQuaternion(inv);
            const restBasis=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(localAcross,localForward,localNormal));
            this.palm[side]={basis:restBasis.invert(),length:Math.max(.035,this.pos(middle,new THREE.Vector3()).distanceTo(hp))};
            for(const finger of ['thumb','index','middle','ring','pinky'])for(let n=1;n<=3;n++){
                const bone=this.bones[side+'hand'+finger+n];if(!bone)continue;const child=bone.children.find((b:any)=>b.isBone);if(!child)continue;
                const direction=this.pos(child,new THREE.Vector3()).sub(this.pos(bone,new THREE.Vector3())).normalize();
                const axis=new THREE.Vector3().crossVectors(direction,normal.clone().negate()).normalize().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
                this.fingerCurls.push({side,bone,axis,angle:([.62,.96,.58][n-1])*(finger==='thumb'?.55:1)});
            }
        }
        setWorldQuaternion(bone:any,world:any){bone.parent.getWorldQuaternion(this.q[8]).invert();bone.quaternion.copy(this.q[8]).multiply(world);bone.updateWorldMatrix(false,true);}
        rotateWorld(bone:any,axis:any,angle:number){if(!bone)return;bone.getWorldQuaternion(this.q[9]);this.q[10].setFromAxisAngle(axis,angle).multiply(this.q[9]);this.setWorldQuaternion(bone,this.q[10]);}
        aim(bone:any,child:any,target:any){
            const root=this.pos(bone,this.v[12]);this.v[13].subVectors(this.pos(child,this.v[13]),root).normalize();this.v[14].subVectors(target,root).normalize();
            this.q[0].setFromUnitVectors(this.v[13],this.v[14]);bone.getWorldQuaternion(this.q[1]);this.q[0].multiply(this.q[1]);this.setWorldQuaternion(bone,this.q[0]);
        }
        solve(upper:any,lower:any,end:any,target:any,pole:any){
            if(!upper||!lower||!end)return;
            const p=this.pos(upper,this.v[4]),m=this.pos(lower,this.v[5]),e=this.pos(end,this.v[6]);
            const l1=p.distanceTo(m),l2=m.distanceTo(e),direction=this.v[7].subVectors(target,p);const originalDistance=direction.length(),d=Math.min(originalDistance,l1+l2-.0005);
            direction.multiplyScalar(1/Math.max(originalDistance,.0001));
            const along=(l1*l1-l2*l2+d*d)/(2*Math.max(d,.001));const height=Math.sqrt(Math.max(.000001,l1*l1-along*along));
            const bend=this.v[8].subVectors(pole,p);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
            const elbow=this.v[9].copy(p).addScaledVector(direction,along).addScaledVector(bend,height);
            this.aim(upper,lower,elbow);this.aim(lower,end,target);
        }
        hand(side:string,grip:any,wrist:any,normal:any){
            const bone=this.bones[side+'hand'],p=this.palm[side];if(!bone||!p)return;
            const forward=this.v[15].subVectors(grip,wrist).normalize(),n=this.v[16].copy(normal);
            n.addScaledVector(forward,-n.dot(forward)).normalize();if(n.lengthSq()<.01)n.set(0,1,0);
            const across=this.v[17].crossVectors(forward,n).normalize();n.crossVectors(across,forward).normalize();
            this.matrix.makeBasis(across,forward,n);this.q[2].setFromRotationMatrix(this.matrix).multiply(p.basis);this.setWorldQuaternion(bone,this.q[2]);
        }
        update(a:Actor,constrain=false){
            for(const x of this.rest){x.bone.position.copy(x.position);x.bone.quaternion.copy(x.quaternion);x.bone.scale.copy(x.scale);}
            this.root.position.set(a.x,0,a.z);this.root.rotation.set(0,this.baseYaw+(a.side===-1?Math.PI:0),0);this.root.updateMatrixWorld(true);
            const hips=this.bones.hips;this.pos(hips,this.v[0]);this.v[0].y=this.restHipY+a.bodyY;hips.parent.worldToLocal(this.v[0]);hips.position.copy(this.v[0]);hips.updateWorldMatrix(false,true);
            this.rotateWorld(hips,this.up,a.bodyYaw*.33);this.right.set(a.side,0,0);this.rotateWorld(hips,this.right,a.lean);
            this.rotateWorld(this.bones.spine,this.up,a.bodyYaw*.36);this.rotateWorld(this.bones.spine1,this.up,a.bodyYaw*.21);this.rotateWorld(this.bones.spine2,this.up,a.bodyYaw*.10);
            this.rotateWorld(this.bones.neck,this.up,-a.bodyYaw*.50);this.rotateWorld(this.bones.head,this.up,-a.bodyYaw*.20);
            for(let i=0;i<2;i++){
                const side=i?'right':'left',f=a.footState[i],foot=this.bones[side+'foot'],toe=this.bones[side+'toebase'];if(!foot)continue;
                const ankle=this.v[0].set(f.p.x,f.p.y,f.p.z),pole=this.v[1].set(a.x+(i?.20:-.20)*a.side,.58,a.z-.7*a.side);
                this.solve(this.bones[side+'upleg'],this.bones[side+'leg'],foot,ankle,pole);
                if(toe){const yaw=f.yaw;const forward=this.v[2].set(Math.sin(yaw)*a.side,0,-Math.cos(yaw)*a.side);const aim=this.v[3].copy(ankle).add(forward);this.aim(foot,toe,aim);
                    const axis=this.v[3].crossVectors(forward,this.up).normalize();this.rotateWorld(foot,axis,f.pitch);
                    // Toe counter-rotation keeps the forefoot near horizontal during push-off.
                    if(f.pitch<-.08)this.rotateWorld(toe,axis,-f.pitch*.82);
                }
                this.diagnostic.feet[i]=this.pos(foot,this.v[0]).y;
            }
            const racket=a.racket;let shoulder=this.pos(this.bones.rightarm,this.v[18]);let grip=this.v[19].set(racket.p.x,racket.p.y,racket.p.z).addScaledVector(this.v[20].set(racket.v.x,racket.v.y,racket.v.z),-.50);
            let wrist=this.v[21].subVectors(grip,shoulder).normalize().multiplyScalar(-.065).add(grip);
            const upper=shoulder.distanceTo(this.pos(this.bones.rightforearm,this.v[0])),lower=this.pos(this.bones.rightforearm,this.v[0]).distanceTo(this.pos(this.bones.righthand,this.v[1]));
            const reach=shoulder.distanceTo(wrist),limit=upper+lower+.045;this.diagnostic.reachCorrection=Math.max(0,reach-limit); // +0.05 容差:略微超臂长时保留计划拍面,避免碰撞点被拉离来球
            if(constrain&&reach>limit){const change=this.v[22].subVectors(wrist,shoulder).multiplyScalar(limit/reach).add(shoulder).sub(wrist);wrist.add(change);grip.add(change);racket.p.x+=change.x;racket.p.y+=change.y;racket.p.z+=change.z;}
            this.v[1].set(a.x+(a.hand<0?.34:.60)*a.side,1.10+a.bodyY,a.z+(a.hand<0?-.40:.09)*a.side);
            this.solve(this.bones.rightarm,this.bones.rightforearm,this.bones.righthand,wrist,this.v[1]);
            this.v[22].set(racket.n.x,racket.n.y,racket.n.z);this.hand('right',grip,wrist,this.v[22]);
            const twoHand=a.hand<0&&(a.charging||a.swing>=0);const ready=a.swing<0&&!a.charging&&Math.hypot(a.vx,a.vz)<.8&&!a.tossing;
            let leftGrip=this.v[19],leftWrist=this.v[21];
            if(twoHand||ready){leftGrip.set(racket.p.x,racket.p.y,racket.p.z).addScaledVector(this.v[20].set(racket.v.x,racket.v.y,racket.v.z),twoHand?-.41:-.34);const ls=this.pos(this.bones.leftarm,this.v[18]);leftWrist.subVectors(leftGrip,ls).normalize().multiplyScalar(-.062).add(leftGrip);}
            else if(a.tossing){leftGrip.set(a.x-.12*a.side,2.18,a.z-.48*a.side);leftWrist.copy(leftGrip).addScaledVector(this.up,-.07);}
            else{const speed=Math.min(6,Math.hypot(a.vx,a.vz)),wave=Math.sin(a.gait*TAU)*speed*.025;leftGrip.set(a.x-(.44+speed*.015)*a.side,1.03+a.bodyY+wave,a.z-(.25+Math.abs(a.bodyYaw)*.13)*a.side);leftWrist.copy(leftGrip).addScaledVector(this.up,.06);}
            this.v[1].set(a.x-.57*a.side,1.06+a.bodyY,a.z-.12*a.side);this.solve(this.bones.leftarm,this.bones.leftforearm,this.bones.lefthand,leftWrist,this.v[1]);
            this.v[22].set(racket.n.x,racket.n.y,racket.n.z);this.hand('left',leftGrip,leftWrist,this.v[22]);
            for(const f of this.fingerCurls){let strength=f.side==='right'?1:twoHand||ready?1:.20;if(a.tossing&&f.side==='left')strength=.05;this.q[3].setFromAxisAngle(f.axis,f.angle*strength);f.bone.quaternion.multiply(this.q[3]);}
            this.root.updateMatrixWorld(true);
            this.pos(this.bones.righthand,this.v[0]);this.v[1].set(racket.p.x,racket.p.y,racket.p.z).addScaledVector(this.v[2].set(racket.v.x,racket.v.y,racket.v.z),-.50);
            this.diagnostic.handGap=Math.abs(this.v[0].distanceTo(this.v[1])-.065);a.visualHandError=this.diagnostic.handGap;
        }
        dispose(){this.root.parent?.remove(this.root);/* Geometry/textures are shared between clones and are not disposed here. */}
    }
}
