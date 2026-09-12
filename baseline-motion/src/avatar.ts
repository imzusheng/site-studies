namespace Rally {
    export interface FootState { p: V; from: V; anchor: V; target: V; phase: number; stance: boolean; pitch: number; yaw: number; lift: number; }
    /** Tennis motion planner. All coordinates used by collision also drive the visible racquet. */
    export class Actor {
        x=0; z=8.2; vx=0; vz=0; side=1; charge=0; charging=false; swing=-1; windup=.21;
        stroke:Stroke='topspin'; hand=1; power=.5; hit=false; dash=0; dashCooldown=0; stamina=1;
        tilt=0; moveIntent=0; aim=0; overcharge=0; timingError=0;
        racket=new RacketPose(); previous=new RacketPose(); rpose=new RacketPose(); lastContact=new RacketPose();
        from=new V(); contact=new V(); follow=new V(); plan=new V(); grip=new V(); shoulder=new V();
        a=new V(); b=new V(); c=new V(); d=new V(); e=new V(); f=new V(); n=new V(); u=new V(); v=new V();
        tmp=new V(); j=new V(); pole=new V(); age=0; strain=0; step=0; tossing=false;
        activeFoot=-1; nextFoot=0; feet=[new V(),new V()]; footFrom=new V(); footTo=new V();
        bodyYaw=0; bodyY=0; lean=0; prep=0; gait=0; movingBlend=0; moveYaw=0;
        footState:FootState[]=[]; visual:HumanRig|null=null;
        readyLocal=new V(.20,1.30,-.55);fromV=new V(.45,.89,0); fromN=new V(0,0,1); followV=new V();
        actionPhase='READY'; avatarHeight=1.88; visualHandError=0; peakHeel=0;
        constructor(public color:RGB, side=1){this.side=side;this.z=side*8.2;for(let i=0;i<2;i++)this.footState.push({p:this.feet[i],from:new V(),anchor:new V(),target:new V(),phase:0,stance:true,pitch:0,yaw:0,lift:0});this.reset(this.x,this.z);}
        local(out:V,x:number,y:number,z:number){return out.set(this.x+x*this.side,y,this.z+z*this.side);}
        getWindup(setup:Setup,serve=false){return (serve?.26:this.charging&&this.charge>.1?.215:.27)+(setup.weight-300)*.00023;}
        reset(x:number,z:number){this.x=x;this.z=z;this.hand=1;this.vx=this.vz=0;this.swing=-1;this.charging=false;this.charge=0;this.hit=false;this.tossing=false;this.dash=this.dashCooldown=0;this.stamina=1;this.timingError=0;this.prep=this.gait=this.movingBlend=this.moveYaw=0;this.bodyYaw=this.bodyY=0;for(let i=0;i<2;i++){let f=this.footState[i];this.local(f.p,i===0?-.18:.18,.11,0);f.anchor.copy(f.p);f.from.copy(f.p);f.target.copy(f.p);f.stance=true;f.pitch=0;f.phase=(i*.5)%1;}this.pose(0,DEFAULT_SETUP);this.previous.copy(this.racket);}
        start(predicted:V,setup:Setup,serve=false){
            this.windup=this.getWindup(setup,serve);this.power=clamp(this.charge,.22,1);this.overcharge=Math.max(0,this.charge-1);
            this.from.set((this.racket.p.x-this.x)*this.side,this.racket.p.y,(this.racket.p.z-this.z)*this.side);
            this.fromV.copy(this.racket.v);this.fromV.x*=this.side;this.fromV.z*=this.side;
            this.fromN.copy(this.racket.n);this.fromN.x*=this.side;this.fromN.z*=this.side;
            let lx=(predicted.x-this.x)*this.side,ly=predicted.y,lz=(predicted.z-this.z)*this.side;
            if(Math.abs(lx)>.16)this.hand=lx<0?-1:1;
            this.stroke=serve?'serve':chooseStroke(ly,lz,lx,Math.hypot(this.vx,this.vz),this.power,Math.abs(this.z)<4,0);
            // 触球点必须落在肩部可达包络内(臂长+腕偏移≈0.61m),否则 IK 会把拍面拉离来球;
            // 触球深度取预测来球的纵向位置,保证拍面真的扫过来球所在平面。
            this.contact.set(this.hand*clamp(Math.abs(lx),.24,.95),clamp(ly,.52,2.30),clamp(lz,-.62,-.38));
            if(Math.abs(lx)>.95){ // 偏宽的救球在身侧更近处触球
                this.contact.set(this.hand*clamp(Math.abs(lx),.40,1.10),clamp(ly,.52,2.30),-.32);
            }
            if(serve){this.hand=1;this.contact.x=clamp(lx,.35,.75);}
            this.follow.set(-this.hand*.37,clamp(ly+.65,1.25,2.06),-.35);
            if(this.stroke==='slice')this.follow.set(this.hand*.05,Math.max(.65,ly-.12),-1.04);
            if(this.stroke==='volley')this.follow.set(this.hand*.3,ly+.15,-1.05);
            if(this.stroke==='smash'||serve)this.follow.set(-.20,1.05,-.52);
            this.charging=false;this.charge=0;this.hit=false;this.tossing=false;this.swing=0;
            this.aim=clamp(this.moveIntent*2.5-this.x*.32,-3.15,3.15);
        }
        /** Authored Hermite arcs replace position jumps; impact and follow-through have distinct velocity profiles. */
        hermite(out:V,p0:V,p1:V,m0:V,m1:V,t:number){let t2=t*t,t3=t2*t;out.copy(p0).scale(2*t3-3*t2+1).addScaled(m0,t3-2*t2+t).addScaled(p1,-2*t3+3*t2).addScaled(m1,t3-t2);return out;}
        // 拍面长轴沿“肩→触球点”方向,让握把位于肩与球之间——这是手臂唯一够得到的构型。
        contactAxis(out:V){const h=this.hand;return out.set(this.contact.x-h*.16,this.contact.y-1.50,this.contact.z-.02).norm();}
        pose(dt:number,setup:Setup){
            this.age+=dt;this.strain=Math.max(0,this.strain-dt*9);this.previous.copy(this.racket);
            const h=this.hand,t=this.swing, speed=Math.hypot(this.vx,this.vz);
            this.prep=damp(this.prep,this.charging?clamp(this.charge*3):this.tossing?1:0,14,dt);
            let twist=0,load=0,px=.20,py=1.30,pz=-.55,nx=0,ny=.01,nz=1;
            this.v.set(.38,.92,0);this.actionPhase='READY';
            if(t>=0){
                const axis=this.contactAxis(this.b);
                if(t<this.windup){
                    const q=clamp(t/this.windup),k=q*q;
                    // The hand leads; the racquet head releases from behind the body into contact.
                    this.c.set(h*.18,-.16,-.34);this.d.set(-h*.13,.20,-1.05);
                    this.hermite(this.a,this.from,this.contact,this.c,this.d,k);
                    this.v.lerp(this.fromV,axis,smooth(q)).norm();
                    twist=mix(-h*.67,h*.04,k);load=Math.sin(q*Math.PI)*.09;
                    nx=mix(h*.58,this.aim*.035,smooth(q));nz=1;this.actionPhase=q<.42?'引拍 / LOAD':'前挥 / SWING';
                }else if(t<this.windup+.36){
                    const q=clamp((t-this.windup)/.36);
                    this.c.set(-h*.32,.42,-.65);this.d.set(-h*.10,.06,.30);
                    this.hermite(this.a,this.contact,this.follow,this.c,this.d,q);
                    this.followV.set(-h*.74,.66,.15).norm();
                    this.v.lerp(axis,this.followV,smooth(q)).norm();
                    twist=mix(h*.04,h*.88,smooth(q));load=-Math.sin(q*Math.PI)*.012;
                    nx=mix(this.aim*.035,-h*.62,smooth(q));nz=1;this.actionPhase=q<.10?'触球 / CONTACT':'随挥 / FOLLOW';
                }else{
                    const q=smooth((t-this.windup-.36)/.25);this.a.set(mix(this.follow.x,.20,q),mix(this.follow.y,1.30,q),mix(this.follow.z,-.55,q));
                    this.followV.set(-h*.74,.66,.15).norm();this.b.set(.38,.92,0);this.v.lerp(this.followV,this.b,q).norm();twist=h*.88*(1-q);this.actionPhase='回位 / RECOVER';
                }
                px=this.a.x;py=this.a.y;pz=this.a.z;
            }else if(this.tossing){px=.68;py=2.12;pz=.10;this.v.set(.16,.85,-.5).norm();twist=-.65;load=.12;this.actionPhase='抛球 / TROPHY';}
            else if(this.charging||this.prep>.01){
                const k=this.prep;px=mix(.20,h*.87,k);py=mix(1.30,1.18,k);pz=mix(-.55,h<0?-.12:.21,k);
                this.b.set(h*.8,.44,.41).norm();this.v.lerp(this.v,this.b,k).norm();twist=-h*.67*k;load=k*.08;nx=h*.72*k;this.actionPhase=h>0?'正手准备 / FOREHAND':'反手准备 / BACKHAND';
            }else{py+=Math.sin(this.age*2.1)*.015;this.actionPhase=speed>.3?'步法 / FOOTWORK':'准备 / SPLIT STEP';}
            // Deep incoming balls lower the pelvis before contact rather than stretching the arms.
            const crouch=t>=0?clamp((.95-this.contact.y)*.40,0,.21):0;
            const bob=this.movingBlend*(.024*Math.cos(this.gait*TAU*2)-.013);
            this.bodyY=-load-crouch+bob;this.bodyYaw=damp(this.bodyYaw,twist+this.moveYaw*.26,22,dt);
            this.lean=damp(this.lean,clamp(-this.vz*this.side*.018,-.10,.13),12,dt);
            this.n.set(nx,ny,nz).norm();
            if(t<0&&dt>0){
                const alpha=1-Math.exp(-18*dt);
                this.readyLocal.x=mix(this.readyLocal.x,px,alpha);this.readyLocal.y=mix(this.readyLocal.y,py,alpha);this.readyLocal.z=mix(this.readyLocal.z,pz,alpha);
                px=this.readyLocal.x;py=this.readyLocal.y;pz=this.readyLocal.z;
                this.b.copy(this.racket.v);this.b.x*=this.side;this.b.z*=this.side;this.v.lerp(this.b,this.v,alpha).norm();
                this.b.copy(this.racket.n);this.b.x*=this.side;this.b.z*=this.side;this.n.lerp(this.b,this.n,alpha).norm();
            }else this.readyLocal.set(px,py,pz);
            this.racket.n.copy(this.n);this.v.addScaled(this.racket.n,-this.v.dot(this.racket.n)).norm();
            this.racket.v.copy(this.v);this.racket.u.cross(this.racket.v,this.racket.n).norm();
            this.local(this.racket.p,px,py,pz);
            for(const q of [this.racket.n,this.racket.u,this.racket.v]){q.x*=this.side;q.z*=this.side;}
            const hs=Math.sqrt(setup.head/100);this.racket.rx=.245*hs;this.racket.ry=.315*hs;
            this.grip.copy(this.racket.p).addScaled(this.racket.v,-.50);
            if(this.visual)this.visual.update(this,true);
        }
        tick(dt:number,setup:Setup){this.dash=Math.max(0,this.dash-dt);this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.stamina=clamp(this.stamina+dt*.15);if(this.charging)this.charge=Math.min(1.25,this.charge+dt/.72);if(this.swing>=0){this.swing+=dt;if(this.swing>this.windup+.61)this.swing=-1;}this.stepFeet(dt);this.pose(dt,setup);}
        stepFeet(dt:number){
            const speed=Math.hypot(this.vx,this.vz);this.movingBlend=damp(this.movingBlend,clamp(speed/.8),13,dt);
            const sx=speed>.05?this.vx/speed:0,sz=speed>.05?this.vz/speed:-this.side;
            const running=speed>3.8,stanceLength=running?.43:.57,cycle=clamp(1.65/Math.max(speed,1),.34,.76);
            if(speed>.12)this.gait+=dt/cycle;
            this.moveYaw=damp(this.moveYaw,clamp(Math.atan2(this.vx*this.side,-this.vz*this.side),-.65,.65)*this.movingBlend,8,dt);
            for(let i=0;i<2;i++){
                const f=this.footState[i],q=(this.gait+i*.5)%1,right=i===1?1:-1;
                f.phase=q;f.yaw=this.moveYaw*.55+right*.10;
                if(speed<.13&&this.movingBlend<.25){
                    this.local(this.tmp,right*.19,.11,0);
                    if(f.p.dist(this.tmp)>.045){f.p.x=damp(f.p.x,this.tmp.x,10,dt);f.p.z=damp(f.p.z,this.tmp.z,10,dt);}
                    f.p.y=damp(f.p.y,.11,12,dt);f.pitch=damp(f.pitch,0,14,dt);f.stance=true;f.anchor.copy(f.p);continue;
                }
                if(q<stanceLength){
                    if(!f.stance){f.anchor.copy(f.p);f.anchor.y=.11;f.stance=true;}
                    const k=q/stanceLength;
                    // A planted toe stays in world space while the heel rises for toe-off.
                    f.pitch=k<.20?mix(.22,0,smooth(k/.20)):k>.55?mix(0,-.58,smooth((k-.55)/.45)):0;
                    f.p.copy(f.anchor);f.p.y=.11+Math.max(0,-Math.sin(f.pitch))*.145;
                    const roll=Math.max(0,-Math.sin(f.pitch))*.024;f.p.x-=sx*roll;f.p.z-=sz*roll;
                }else{
                    if(f.stance){f.from.copy(f.p);f.stance=false;}
                    const k=(q-stanceLength)/(1-stanceLength),future=cycle*stanceLength*.52;
                    this.local(f.target,right*.19,.11,0);f.target.x+=this.vx*future;f.target.z+=this.vz*future;
                    f.p.lerp(f.from,f.target,smooth(k));f.p.y=.11+Math.sin(Math.PI*k)*(running?.31:.18);
                    f.pitch=mix(-.54,.23,smooth(k));
                }
                this.peakHeel=Math.max(this.peakHeel,.11+Math.max(0,-Math.sin(f.pitch))*.145);
                // Large teleport/reset is handled by reset(), not a leg stretched across the court.
                const far=Math.hypot(f.p.x-this.x,f.p.z-this.z);
                if(far>.95){this.local(f.p,right*.2,.15,-.02);f.anchor.copy(f.p);f.from.copy(f.p);f.stance=false;}
            }
        }
        joint(root:V,end:V,out:V,pole:V,l1=.32,l2=.29){this.a.copy(end).sub(root);const dist=Math.max(.001,this.a.len()),d=Math.min(dist,l1+l2-.001);this.a.scale(1/dist);const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(.0001,l1*l1-along*along));this.b.copy(pole).addScaled(this.a,-pole.dot(this.a)).norm();return out.copy(root).addScaled(this.a,along).addScaled(this.b,height);}
        draw(r:Renderer){if(this.visual){this.visual.root.visible=true;this.visual.update(this);}this.drawRacket(r);}
        drawRacket(r:Renderer){
            const p=this.racket;r.basis('torus',C.ink,p.p,p.u,p.v,p.n,p.rx*1.025,p.ry*1.025,.31);r.basis('torus',this.color,p.p,p.u,p.v,p.n,p.rx,p.ry,.22);
            // V-throat and a real-sized handle; hand is attached at the same .50 m offset.
            this.c.copy(p.p).addScaled(p.u,-.11).addScaled(p.v,-.26);this.d.copy(p.p).addScaled(p.v,-.41);r.segment(this.c,this.d,.018,C.ink);
            this.c.copy(p.p).addScaled(p.u,.11).addScaled(p.v,-.26);r.segment(this.c,this.d,.018,C.ink);
            this.c.copy(p.p).addScaled(p.v,-.40);this.d.copy(p.p).addScaled(p.v,-.62);r.segment(this.c,this.d,.024,C.white);
            for(let k=0;k<7;k++){this.c.copy(p.p).addScaled(p.v,-.43-k*.025);this.d.copy(this.c).addScaled(p.v,-.006);r.segment(this.c,this.d,.027,C.ink);}
            for(let i=-7;i<=7;i++){const x=i/8*p.rx,y=p.ry*Math.sqrt(1-x*x/(p.rx*p.rx));this.c.copy(p.p).addScaled(p.u,x).addScaled(p.v,-y).addScaled(p.n,-this.strain*.015);this.d.copy(p.p).addScaled(p.u,x).addScaled(p.v,y).addScaled(p.n,-this.strain*.015);r.segment(this.c,this.d,.0017,C.line);}
            for(let i=-8;i<=8;i++){const y=i/9*p.ry,x=p.rx*Math.sqrt(1-y*y/(p.ry*p.ry));this.c.copy(p.p).addScaled(p.u,-x).addScaled(p.v,y);this.d.copy(p.p).addScaled(p.u,x).addScaled(p.v,y);r.segment(this.c,this.d,.0017,C.line);}
        }
    }
}
