declare const BASELINE_ENGINE: any;
namespace Rally {
    type BoneInfo={ bone:any; position:any; quaternion:any; scale:any };
    const MODEL_URLS=[
        'https://threejs.org/examples/models/gltf/Michelle.glb',
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/Michelle.glb',
        'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Michelle.glb'
    ];
    export async function loadHumanAsset(progress:(s:string)=>void){progress("准备运动员…");return createClubAthlete();}
    export async function loadLegacyHumanAsset(progress:(s:string)=>void){
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
        v=Array.from({length:32},()=>new THREE.Vector3());q=Array.from({length:16},()=>new THREE.Quaternion());
        matrix=new THREE.Matrix4();up=new THREE.Vector3(0,1,0);right=new THREE.Vector3(1,0,0);
        palm:Record<string,any>={};fingerCurls:any[]=[];triangles=0;diagnostic={handGap:0,leftHandGap:0,reachCorrection:0,elbowAngle:0,feet:[0,0]};
        sockets:Record<string,any>={};
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
            const scale=this.model.userData.units==='metres'?1:1.80/height;this.model.scale.multiplyScalar(scale);if(this.model.userData.units!=='metres')this.model.position.y-=box.min.y*scale;
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
            this.palm[side]={basis:restBasis.invert(),forward:localForward,normal:localNormal,
                forearmNormal:normal.clone().applyQuaternion(this.bones[side+'forearm'].getWorldQuaternion(new THREE.Quaternion()).invert())};
            this.sockets[side]={grip:new THREE.Vector3(),wrist:new THREE.Vector3(),forward:new THREE.Vector3(),normal:new THREE.Vector3(),across:new THREE.Vector3()};
            for(const finger of ['thumb','index','middle','ring','pinky'])for(let n=1;n<=3;n++){
                const bone=this.bones[side+'hand'+finger+n];if(!bone)continue;const child=bone.children.find((b:any)=>b.isBone);if(!child)continue;
                const direction=this.pos(child,new THREE.Vector3()).sub(this.pos(bone,new THREE.Vector3())).normalize();
                const axis=new THREE.Vector3().crossVectors(direction,normal.clone()).normalize().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
                this.fingerCurls.push({side,bone,axis,angle:([.78,1.14,.72][n-1])*(finger==='thumb'?.62:1)});
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
        gripSocket(side:string,racket:RacketPose,offset:number){
            const g=this.sockets[side],sign=side==='right'?1:-1;
            // Fixed local grip transform: no lookAt(shoulder) and no frame-dependent palm flip.
            g.normal.set(racket.n.x,racket.n.y,racket.n.z).multiplyScalar(sign);
            g.forward.set(racket.v.x,racket.v.y,racket.v.z).multiplyScalar(.80)
                .addScaledVector(this.v[23].set(racket.u.x,racket.u.y,racket.u.z),.60*sign).normalize();
            g.across.crossVectors(g.forward,g.normal).normalize();g.normal.crossVectors(g.across,g.forward).normalize();
            g.grip.set(racket.p.x,racket.p.y,racket.p.z).addScaledVector(this.v[23].set(racket.v.x,racket.v.y,racket.v.z),-offset);
            g.wrist.copy(g.grip).addScaledVector(g.forward,-.052).addScaledVector(g.normal,-.020);
            return g;
        }
        orientHand(side:string,g:any){
            const hand=this.bones[side+'hand'],forearm=this.bones[side+'forearm'],p=this.palm[side];
            // Share pronation with the forearm rather than concentrating a 180-degree twist
            // at one wrist vertex ring. Twist around its own axis does not move the hand socket.
            const axis=this.v[24].subVectors(this.pos(hand,this.v[25]),this.pos(forearm,this.v[26])).normalize();
            const current=this.v[25].copy(p.forearmNormal).applyQuaternion(forearm.getWorldQuaternion(this.q[4]));
            current.addScaledVector(axis,-current.dot(axis)).normalize();
            const desired=this.v[26].copy(g.normal).addScaledVector(axis,-g.normal.dot(axis)).normalize();
            const cross=this.v[27].crossVectors(current,desired);
            const angle=Math.atan2(cross.dot(axis),clamp(current.dot(desired),-1,1));
            this.rotateWorld(forearm,axis,angle*.82);
            this.matrix.makeBasis(g.across,g.forward,g.normal);this.q[2].setFromRotationMatrix(this.matrix).multiply(p.basis);
            this.setWorldQuaternion(hand,this.q[2]);
        }
        socketError(side:string,g:any){
            const hand=this.bones[side+'hand'],p=this.palm[side];hand.getWorldQuaternion(this.q[5]);
            const actual=this.pos(hand,this.v[28]);
            actual.addScaledVector(this.v[29].copy(p.forward).applyQuaternion(this.q[5]),.052)
                .addScaledVector(this.v[30].copy(p.normal).applyQuaternion(this.q[5]),.020);
            return actual.distanceTo(g.grip);
        }
        update(a:Actor,constrain=false){
            for(const x of this.rest){x.bone.position.copy(x.position);x.bone.quaternion.copy(x.quaternion);x.bone.scale.copy(x.scale);}
            this.root.position.set(a.x,0,a.z);this.root.rotation.set(0,this.baseYaw+(a.side===-1?Math.PI:0),0);this.root.updateMatrixWorld(true);
            const hips=this.bones.hips;this.pos(hips,this.v[0]);this.v[0].y=this.restHipY+a.bodyY;hips.parent.worldToLocal(this.v[0]);hips.position.copy(this.v[0]);hips.updateWorldMatrix(false,true);
            this.rotateWorld(hips,this.up,a.pelvisYaw);this.right.set(a.side,0,0);this.rotateWorld(hips,this.right,-a.lean);
            const uncoil=a.bodyYaw-a.pelvisYaw;
            this.rotateWorld(this.bones.spine,this.up,uncoil*.45);this.rotateWorld(this.bones.spine1,this.up,uncoil*.35);this.rotateWorld(this.bones.spine2,this.up,uncoil*.20);
            // Scapular protraction contributes a few centimetres of functional reach without
            // scaling an upper arm or detaching the hand.
            this.rotateWorld(this.bones.rightshoulder,this.up,a.hand<0?.32:a.swing>=0?.12:0);
            this.rotateWorld(this.bones.neck,this.up,-a.bodyYaw*.50);this.rotateWorld(this.bones.head,this.up,-a.bodyYaw*.20);
            for(let i=0;i<2;i++){
                const side=i?'right':'left',f=a.footState[i],foot=this.bones[side+'foot'],toe=this.bones[side+'toebase'];if(!foot)continue;
                const ankle=this.v[0].set(f.p.x,f.p.y,f.p.z),pole=this.v[1].set(a.x+(i?.20:-.20)*a.side,.58,a.z-.7*a.side);
                this.solve(this.bones[side+'upleg'],this.bones[side+'leg'],foot,ankle,pole);
                if(toe){const forward=this.v[2].set(Math.sin(f.yaw)*a.side,0,-Math.cos(f.yaw)*a.side);const aim=this.v[3].copy(ankle).addScaledVector(forward,.143);aim.y-=.061;this.aim(foot,toe,aim);
                    const axis=this.v[3].crossVectors(forward,this.up).normalize();this.rotateWorld(foot,axis,f.pitch);
                    if(f.pitch<-.08)this.rotateWorld(toe,axis,-f.pitch*.90);
                }
                this.diagnostic.feet[i]=this.pos(foot,this.v[0]).y;
            }
            const racket=a.racket,twoHand=a.hand<0&&(a.charging||a.swing>=0||a.prep>.10);
            const ready=a.swing<0&&!a.charging&&Math.hypot(a.vx,a.vz)<.8&&!a.tossing;
            let correction=0;
            // Project the entire racquet (visible + collider together) into the true arm envelope.
            // Unlike the previous +4.5 cm slack, a hand may not detach to preserve a planned hit.
            for(let pass=0;pass<4;pass++){
                for(const side of twoHand?['right','left']:['right']){
                    const g=this.gripSocket(side,racket,side==='right'?RACKET.grip:RACKET.secondGrip);
                    const shoulder=this.pos(this.bones[side+'arm'],this.v[18]);
                    const l1=shoulder.distanceTo(this.pos(this.bones[side+'forearm'],this.v[0]));
                    const l2=this.v[0].distanceTo(this.pos(this.bones[side+'hand'],this.v[1]));
                    const d=shoulder.distanceTo(g.wrist),limit=l1+l2-.001;
                    if(d>limit&&constrain){const delta=this.v[22].subVectors(g.wrist,shoulder).multiplyScalar(limit/d).add(shoulder).sub(g.wrist);
                        racket.p.x+=delta.x;racket.p.y+=delta.y;racket.p.z+=delta.z;correction+=delta.length();}
                }
            }
            this.diagnostic.reachCorrection=correction;
            const rightGrip=this.gripSocket('right',racket,RACKET.grip);
            const pole=this.v[1].set(a.x+(a.hand<0?.43:.65)*a.side,1.14+a.bodyY,a.z+(a.hand<0?-.42:.10)*a.side);
            this.solve(this.bones.rightarm,this.bones.rightforearm,this.bones.righthand,rightGrip.wrist,pole);this.orientHand('right',rightGrip);
            const left=this.gripSocket('left',racket,twoHand?RACKET.secondGrip:.275);
            if(!twoHand&&!ready){
                if(a.tossing)left.grip.set(a.x-.16*a.side,1.99,a.z-.36*a.side);
                else{
                    const speed=Math.min(6,Math.hypot(a.vx,a.vz)),wave=Math.sin(a.gait*TAU)*speed*.023;
                    const armOpen=a.charging?a.prep*.13:0;
                    left.grip.set(a.x-(.38+armOpen+speed*.014)*a.side,1.09+a.bodyY+wave+armOpen*.6,a.z-(.22+Math.abs(a.bodyYaw)*.10)*a.side);
                }
                left.forward.set(-.4*a.side,a.tossing?.85:-.55,-.55*a.side).normalize();left.normal.set(0,0,a.side);
                left.across.crossVectors(left.forward,left.normal).normalize();left.normal.crossVectors(left.across,left.forward).normalize();
                left.wrist.copy(left.grip).addScaledVector(left.forward,-.052).addScaledVector(left.normal,-.020);
            }
            this.v[1].set(a.x-.55*a.side,1.12+a.bodyY,a.z-.05*a.side);
            this.solve(this.bones.leftarm,this.bones.leftforearm,this.bones.lefthand,left.wrist,this.v[1]);this.orientHand('left',left);
            for(const f of this.fingerCurls){const strength=f.side==='right'?1:twoHand||ready?1:a.tossing?.05:.14;this.q[3].setFromAxisAngle(f.axis,f.angle*strength);f.bone.quaternion.multiply(this.q[3]);}
            this.root.updateMatrixWorld(true);
            this.diagnostic.handGap=this.socketError('right',rightGrip);this.diagnostic.leftHandGap=twoHand||ready?this.socketError('left',left):0;
            const shoulder=this.pos(this.bones.rightarm,this.v[0]),elbow=this.pos(this.bones.rightforearm,this.v[1]),wrist=this.pos(this.bones.righthand,this.v[2]);
            this.v[3].subVectors(shoulder,elbow).normalize();this.v[4].subVectors(wrist,elbow).normalize();
            this.diagnostic.elbowAngle=Math.acos(clamp(this.v[3].dot(this.v[4]),-1,1))*180/Math.PI;
            a.visualHandError=this.diagnostic.handGap;
        }
        dispose(){this.root.parent?.remove(this.root);/* Geometry/textures are shared between clones and are not disposed here. */}
    }
}
