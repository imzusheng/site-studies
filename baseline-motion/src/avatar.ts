namespace Rally {
    export interface FootState { p: V; from: V; anchor: V; target: V; phase: number; stance: boolean; pitch: number; yaw: number; lift: number; adjusting:boolean; adjustment:number; }
    /** Tennis motion planner. All coordinates used by collision also drive the visible racquet. */
    export class Actor {
        x=0; z=8.2; vx=0; vz=0; side=1; charge=0; charging=false; swing=-1; windup=.21;
        stroke:Stroke='topspin'; hand=1; power=.5; hit=false; dash=0; dashCooldown=0; stamina=1;
        tilt=0; ballOffset=.73; moveIntent=0; aim=0; overcharge=0; timingError=0;
        racket=new RacketPose(); previous=new RacketPose(); rpose=new RacketPose(); lastContact=new RacketPose();
        from=new V(); contact=new V(); follow=new V(); plan=new V(); grip=new V(); shoulder=new V();
        a=new V(); b=new V(); c=new V(); d=new V(); e=new V(); f=new V(); n=new V(); u=new V(); v=new V();
        tmp=new V(); j=new V(); pole=new V(); age=0; strain=0; step=0; tossing=false;
        activeFoot=-1; nextFoot=0; feet=[new V(),new V()]; footFrom=new V(); footTo=new V();
        bodyYaw=0; pelvisYaw=0; bodyY=0; lean=0; prep=0; gait=0; movingBlend=0; moveYaw=0;
        footState:FootState[]=[]; visual:HumanRig|null=null;
        readyLocal=new V(.16,1.53,-.31);fromV=new V(.45,.89,0); fromN=new V(0,0,1); followV=new V();
        actionPhase='READY'; avatarHeight=1.88; visualHandError=0; peakHeel=0;
        constructor(public color:RGB, side=1){this.side=side;this.z=side*8.2;for(let i=0;i<2;i++)this.footState.push({p:this.feet[i],from:new V(),anchor:new V(),target:new V(),phase:0,stance:true,pitch:0,yaw:0,lift:0,adjusting:false,adjustment:0});this.reset(this.x,this.z);}
        local(out:V,x:number,y:number,z:number){return out.set(this.x+x*this.side,y,this.z+z*this.side);}
        getContactDepth(){return Math.abs(this.ballOffset)>.95?.32:this.hand<0?.34:.52;}
        getWindup(setup:Setup,serve=false){return (serve?.26:this.charging&&this.charge>.1?.145:.205)+(setup.weight-300)*.00018;}
        reset(x:number,z:number){this.x=x;this.z=z;this.hand=1;this.vx=this.vz=0;this.swing=-1;this.charging=false;this.charge=0;this.hit=false;this.tossing=false;this.dash=this.dashCooldown=0;this.stamina=1;this.timingError=0;this.prep=this.gait=this.movingBlend=this.moveYaw=0;this.bodyYaw=this.pelvisYaw=this.bodyY=0;for(let i=0;i<2;i++){let f=this.footState[i];this.local(f.p,i===0?-.18:.18,.11,0);f.anchor.copy(f.p);f.from.copy(f.p);f.target.copy(f.p);f.stance=true;f.adjusting=false;f.adjustment=0;f.pitch=0;f.phase=(i*.5)%1;}this.pose(0,DEFAULT_SETUP);this.previous.copy(this.racket);}
        start(predicted:V,setup:Setup,serve=false){
            this.windup=this.getWindup(setup,serve);this.power=clamp(this.charge,.22,1);this.overcharge=Math.max(0,this.charge-1);
            this.from.set((this.racket.p.x-this.x)*this.side,this.racket.p.y,(this.racket.p.z-this.z)*this.side);
            this.fromV.copy(this.racket.v);this.fromV.x*=this.side;this.fromV.z*=this.side;
            this.fromN.copy(this.racket.n);this.fromN.x*=this.side;this.fromN.z*=this.side;
            let lx=(predicted.x-this.x)*this.side,ly=predicted.y,lz=(predicted.z-this.z)*this.side;
            if(Math.abs(lx)>.16)this.hand=lx<0?-1:1;
            this.stroke=serve?'serve':chooseStroke(ly,lz,lx,Math.hypot(this.vx,this.vz),this.power,Math.abs(this.z)<4,0);
            // Keep the ball's predicted position. Reach is anatomical (upper arm + forearm +
            // grip socket + real racquet), not an artificially short shoulder-to-ball ray.
            this.contact.set(this.hand*clamp(Math.abs(lx),.28,1.26),clamp(ly,.40,2.42),clamp(lz,-.78,-.30));
            if(serve){this.hand=1;this.contact.x=clamp(lx,.28,.78);}
            this.local(this.plan,this.contact.x,this.contact.y,this.contact.z);
            this.follow.set(-this.hand*.46,clamp(ly+.50,1.50,1.96),.04);
            if(this.stroke==='slice')this.follow.set(this.hand*.10,Math.max(.70,ly-.10),-.77);
            if(this.stroke==='volley')this.follow.set(this.hand*.38,ly+.12,-.79);
            if(this.stroke==='smash'||serve)this.follow.set(-.20,1.12,-.50);
            this.charging=false;this.charge=0;this.hit=false;this.tossing=false;this.swing=0;
            this.aim=clamp(this.moveIntent*2.5-this.x*.32,-3.15,3.15);
        }
        /** Authored Hermite arcs replace position jumps; impact and follow-through have distinct velocity profiles. */
        hermite(out:V,p0:V,p1:V,m0:V,m1:V,t:number){let t2=t*t,t3=t2*t;out.copy(p0).scale(2*t3-3*t2+1).addScaled(m0,t3-2*t2+t).addScaled(p1,-2*t3+3*t2).addScaled(m1,t3-t2);return out;}
        /** The frame is driven by the stroke, never re-aimed along shoulder -> ball.
         * The grip orientation is constant in this frame; the arm solves toward its socket. */
        contactAxis(out:V){
            if(this.stroke==='serve'||this.stroke==='smash')return out.set(.32,.95,0).norm();
            return out.set(this.hand,clamp((this.contact.y-1.24)*1.05,-.65,.78),.025).norm();
        }
        followAxis(out:V){return this.stroke==='serve'||this.stroke==='smash'?out.set(-.70,-.55,-.08).norm():out.set(-this.hand*.70,.45,.55).norm();}
        pose(dt:number,setup:Setup){
            this.age+=dt;this.strain=Math.max(0,this.strain-dt*9);this.previous.copy(this.racket);
            const h=this.hand,t=this.swing,speed=Math.hypot(this.vx,this.vz);
            this.prep=damp(this.prep,this.charging?clamp(this.charge*4):this.tossing?1:0,18,dt);
            let twist=0,hip=0,load=.022,px=.16,py=1.53,pz=-.31,nx=0,ny=.01,nz=1;
            this.v.set(.28,.96,0);this.actionPhase='准备 / READY';
            if(t>=0){
                // Keep the planned impact in court coordinates while the player finishes a
                // step. Moving the body must not drag the target away from the real ball.
                this.contact.set(clamp((this.plan.x-this.x)*this.side,-1.26,1.26),this.plan.y,clamp((this.plan.z-this.z)*this.side,-.78,-.30));
                const axis=this.contactAxis(this.b);
                if(t<this.windup){
                    const q=clamp(t/this.windup),k=smooth(q);
                    // Curved acceleration out of the take-back, with the hand leading the head.
                    this.c.set(h*.22,-.24,-.27);this.d.set(-h*.16,.22,-.60);
                    this.hermite(this.a,this.from,this.contact,this.c,this.d,k);
                    this.v.lerp(this.fromV,axis,smooth(q)).norm();
                    twist=h>0?mix(-.84,.13,k):mix(1.10,.72,k);hip=h>0?mix(-.38,.31,smooth(clamp(q*1.45))):mix(.50,.37,k);
                    load=mix(.068,.022,k);nx=mix(h*.54,this.aim*.035,k);
                    this.actionPhase=q<.32?'落拍 / DROP':'前挥 / DRIVE';
                }else if(t<this.windup+.38){
                    const q=clamp((t-this.windup)/.38),k=smooth(q);
                    this.c.set(-h*.68,.51,-.32);this.d.set(-h*.06,.12,.25);
                    this.hermite(this.a,this.contact,this.follow,this.c,this.d,k);
                    this.followAxis(this.followV);
                    this.v.lerp(axis,this.followV,k).norm();
                    twist=mix(h>0?.13:.72,h*.90,k);hip=mix(h>0?.31:.37,h*.51,k);
                    load=.02;nx=mix(this.aim*.035,h*.62,k);
                    this.actionPhase=q<.075?'触球 / CONTACT':'随挥 / FOLLOW';
                }else{
                    const q=smooth((t-this.windup-.38)/.25);
                    this.a.set(mix(this.follow.x,.16,q),mix(this.follow.y,1.53,q),mix(this.follow.z,-.31,q));
                    this.followAxis(this.followV);this.b.set(.28,.96,0);this.v.lerp(this.followV,this.b,q).norm();
                    twist=h*.90*(1-q);hip=h*.51*(1-q);nx=h*.62*(1-q);this.actionPhase='回位 / RECOVER';
                }
                px=this.a.x;py=this.a.y;pz=this.a.z;
            }else if(this.tossing){
                px=.55;py=1.90;pz=.14;this.v.set(.20,.97,.10).norm();
                twist=-.65;hip=-.30;load=.065;nx=.26;this.actionPhase='抛球 / TROPHY';
            }else if(this.charging||this.prep>.01){
                const k=this.prep;px=mix(.16,h>0?.74:-.57,k);py=mix(1.53,1.52,k);pz=mix(-.31,h<0?-.05:.27,k);
                this.b.set(h>0?.52:-.75,h>0?.79:.60,h>0?.20:-.405).norm();this.v.lerp(this.v,this.b,k).norm();
                twist=(h>0?-.84:1.10)*k;hip=(h>0?-.38:.50)*k;load=.022+k*.045;nx=h*.54*k;
                this.actionPhase=h>0?'正手引拍 / FOREHAND':'双反引拍 / BACKHAND';
            }else{py+=Math.sin(this.age*2.1)*.006;this.actionPhase=speed>.3?'步法 / FOOTWORK':'准备 / READY';}
            const crouch=t>=0?clamp((1.08-this.contact.y)*.33,0,.20):0;
            const bob=this.movingBlend*(.018*Math.cos(this.gait*TAU*2)-.013);
            this.bodyY=-load-crouch+bob;
            this.bodyYaw=damp(this.bodyYaw,twist+this.moveYaw*.20,30,dt);
            this.pelvisYaw=damp(this.pelvisYaw,hip+this.moveYaw*.30,35,dt);
            this.lean=damp(this.lean,.06+clamp(-this.vz*this.side*.016,-.06,.09),15,dt);
            this.n.set(nx,ny,nz).norm();
            if(t<0&&dt>0){
                const alpha=1-Math.exp(-22*dt);
                this.readyLocal.x=mix(this.readyLocal.x,px,alpha);this.readyLocal.y=mix(this.readyLocal.y,py,alpha);this.readyLocal.z=mix(this.readyLocal.z,pz,alpha);
                px=this.readyLocal.x;py=this.readyLocal.y;pz=this.readyLocal.z;
                this.b.copy(this.racket.v);this.b.x*=this.side;this.b.z*=this.side;this.v.lerp(this.b,this.v,alpha).norm();
                this.b.copy(this.racket.n);this.b.x*=this.side;this.b.z*=this.side;this.n.lerp(this.b,this.n,alpha).norm();
            }else this.readyLocal.set(px,py,pz);
            this.racket.n.copy(this.n);this.v.addScaled(this.racket.n,-this.v.dot(this.racket.n)).norm();
            this.racket.v.copy(this.v);this.racket.u.cross(this.racket.v,this.racket.n).norm();
            this.local(this.racket.p,px,py,pz);
            for(const q of [this.racket.n,this.racket.u,this.racket.v]){q.x*=this.side;q.z*=this.side;}
            const hs=Math.sqrt(setup.head/100);this.racket.rx=RACKET.rx*hs;this.racket.ry=RACKET.ry*hs;
            this.grip.copy(this.racket.p).addScaled(this.racket.v,-RACKET.grip);
            if(this.visual)this.visual.update(this,true);
        }
        tick(dt:number,setup:Setup){this.dash=Math.max(0,this.dash-dt);this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.stamina=clamp(this.stamina+dt*.15);if(this.charging)this.charge=Math.min(1.25,this.charge+dt/.72);if(this.swing>=0){this.swing+=dt;if(this.swing>this.windup+.63)this.swing=-1;}this.stepFeet(dt);this.pose(dt,setup);}
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
                    const width=.19+this.prep*.03;
                    this.local(this.tmp,right*width,.11,0);
                    const other=this.footState[1-i];
                    if(!f.adjusting&&f.p.dist(this.tmp)>.08&&!other.adjusting){f.adjusting=true;f.adjustment=0;f.from.copy(f.p);f.target.copy(this.tmp);}
                    if(f.adjusting){
                        f.adjustment+=dt/.20;const k=clamp(f.adjustment);f.p.lerp(f.from,f.target,smooth(k));f.p.y=.11+Math.sin(k*Math.PI)*.065;
                        f.stance=false;f.pitch=0;
                        if(k>=1){f.adjusting=false;f.stance=true;f.anchor.copy(f.p);}
                    }else{
                        const rear=i===(this.hand>0?1:0),swingLift=this.swing>=0?Math.sin(Math.PI*clamp(this.swing/(this.windup+.38))):0;
                        const pitch=rear?-(.12*this.prep+.45*swingLift):0;
                        f.pitch=damp(f.pitch,pitch,20,dt);
                        f.p.y=.11+Math.max(0,-Math.sin(f.pitch))*.145;f.stance=true;
                        f.yaw=right*.10+this.bodyYaw*(rear?.32:.12);
                    }
                    this.peakHeel=Math.max(this.peakHeel,f.p.y);continue;
                }
                f.adjusting=false;
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
        draw(r:Renderer){if(this.visual)this.visual.root.visible=true;this.drawRacket(r);}
        drawRacket(r:Renderer){
            const p=this.racket;
            // 27-inch scale. An elliptical tubular frame, not a stretched giant torus.
            for(let k=0;k<48;k++){
                const t=k/48*TAU,t1=(k+1)/48*TAU;
                this.c.copy(p.p).addScaled(p.u,(p.rx+.001)*Math.cos(t)).addScaled(p.v,(p.ry+.001)*Math.sin(t));
                this.d.copy(p.p).addScaled(p.u,(p.rx+.001)*Math.cos(t1)).addScaled(p.v,(p.ry+.001)*Math.sin(t1));
                r.segment(this.c,this.d,.009,k<10||k>38?this.color:C.ink);
            }
            this.c.copy(p.p).addScaled(p.u,-.055).addScaled(p.v,-.145);this.d.copy(p.p).addScaled(p.v,-RACKET.handleTop);r.segment(this.c,this.d,.008,C.ink);
            this.c.copy(p.p).addScaled(p.u,.055).addScaled(p.v,-.145);r.segment(this.c,this.d,.008,C.ink);
            this.c.copy(p.p).addScaled(p.v,-RACKET.handleTop);this.d.copy(p.p).addScaled(p.v,-RACKET.butt);r.segment(this.c,this.d,.015,C.white);
            for(let k=0;k<9;k++){this.c.copy(p.p).addScaled(p.v,-RACKET.handleTop-.008-k*.017);this.d.copy(this.c).addScaled(p.v,-.002);r.segment(this.c,this.d,.0158,C.ink);}
            for(let i=-7;i<=7;i++){const x=i/8*p.rx,y=p.ry*Math.sqrt(1-x*x/(p.rx*p.rx));this.c.copy(p.p).addScaled(p.u,x).addScaled(p.v,-y).addScaled(p.n,-this.strain*.006);this.d.copy(p.p).addScaled(p.u,x).addScaled(p.v,y).addScaled(p.n,-this.strain*.006);r.segment(this.c,this.d,.0008,C.line);}
            for(let i=-8;i<=8;i++){const y=i/9*p.ry,x=p.rx*Math.sqrt(1-y*y/(p.ry*p.ry));this.c.copy(p.p).addScaled(p.u,-x).addScaled(p.v,y);this.d.copy(p.p).addScaled(p.u,x).addScaled(p.v,y);r.segment(this.c,this.d,.0008,C.line);}
        }
    }
}
