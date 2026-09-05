import { createTimeline, onScroll } from 'animejs';

// One scene, twenty-four editorial shots. Lens values are vertical FOV in degrees;
// distance and offsets use the physical model's millimetres.
export const SHOTS = Object.freeze([
 {id:'teaser',duration:1100,label:'把控制留在手边',look:'product',focus:'activeGlass',lens:11.56,az:0,el:45.5,distance:326.7,layout:'hero',title:'Luma Remote.',kicker:'A SMALL OBJECT. A BIG DIFFERENCE.',body:'把控制，留在手边。',spec:'开源桌面控制器 / A3.43'},
 {id:'surface',duration:1450,label:'日常的直觉',look:'paper',focus:'upperShell',lens:27,az:8,el:44,distance:240,title:'少一点寻找。\n多一点直觉。',kicker:'回到直觉',body:'常用的操作，不必每次都从菜单里寻找。\n让按键负责触发，旋钮负责调节，屏幕带来反馈。',spec:'6 枚快捷按键 / 1 只旋钮 / 2.0 英寸屏幕'},
 {id:'unfold',duration:2800,label:'进入内部',look:'paper',focus:'mainboard',lens:37,az:22,el:34,distance:385,title:'一件物品。\n一个完整世界。',kicker:'OPEN STRUCTURE',body:'外壳退开，结构浮现。\n从指尖的触感，一路走向内部的设计。',spec:'输入 / 显示 / 计算 / 结构'},
 {id:'constellation',duration:2200,label:'悬浮结构',look:'dark',focus:'mainboard',lens:39,az:24,el:-10,distance:300,title:'每个细节，\n都有自己的位置。',kicker:'WITHIN LUMA',body:'穿过零件之间的空间，\n看见藏在表面之下的协作。',spec:'同一个产品空间 / 连续探索'},
 {id:'core',duration:3000,label:'计算核心',look:'dark',focus:'mainboard',lens:30,az:20,el:-66,distance:172,title:'小小核心。\n完整想象。',kicker:'COMPUTE',body:'ESP32-S3-LCD-2。\n让显示、输入与无线连接，围绕同一块板协作。',spec:'ESP32-S3 / 2.0 英寸 LCD'},
 {id:'signal',duration:2400,label:'本地联动',look:'dark',focus:'mainboard',lens:32,az:-10,el:-56,distance:190,title:'一次操作，\n连接日常。',kicker:'LOCAL CONNECTION',body:'Wi-Fi、MQTT 与 Home Assistant。\n让实体输入成为智能空间的入口。',spec:'本地发现 / 状态反馈 / 实体控制'},
 {id:'recovery',duration:2400,label:'更新与恢复',look:'dark',focus:'mainboard',lens:32,az:-25,el:-48,distance:180,title:'继续进化，\n也能安全回来。',kicker:'UPDATE & RECOVER',body:'双槽 OTA 与启动自检。\n当新版本无法通过自检，回到可用的版本。',spec:'无线更新 / 启动自检 / 回滚'},
 {id:'display',duration:2600,label:'屏幕反馈',look:'dark',focus:'activeGlass',lens:31,az:12,el:55,distance:175,title:'状态，\n一眼可见。',kicker:'VISIBLE FEEDBACK',body:'一块 2.0 英寸屏幕，\n把调节、选择与状态变化带回眼前。',spec:'显示与操作，形成反馈'},
 {id:'optics',duration:2300,label:'显示层次',look:'paper',focus:'optical',lens:38,az:30,el:28,distance:290,title:'光，\n穿过每一层。',kicker:'BEHIND THE DISPLAY',body:'从背光到显示表面，\n用线条看清模组的层次与边界。',spec:'LCD 模组结构示意'},
 {id:'controls',duration:2600,label:'六枚快捷按键',look:'dark',focus:'keycapFocus',lens:32,az:105,el:35,distance:155,title:'常用操作，\n交给肌肉记忆。',kicker:'SIX TACTILE KEYS',body:'六枚独立的快捷按键。\n触发、切换、选择，各有明确的位置。',spec:'6 × Kailh Choc V2'},
 {id:'mechanism',duration:2400,label:'键轴结构',look:'paper',focus:'switchStems',lens:34,az:25,el:28,distance:175,title:'一次按下，\n不止一个动作。',kicker:'INSIDE THE SWITCH',body:'键帽、轴心、弹簧与触点。\n触感来自这些微小结构的配合。',spec:'机械输入 / 可替换键帽'},
 {id:'fit',duration:2300,label:'键帽配合',look:'paper',focus:'keycapFocus',lens:28,az:18,el:-45,distance:105,title:'微小间隙，\n决定装配的分寸。',kicker:'FIT MATTERS',body:'键帽接口为轴心套筒留出名义间隙。\n让打印、安装与替换，都从清楚的尺寸开始。',spec:'5.30 mm 接口 / 5.50 mm 套筒'},
 {id:'dial',duration:2700,label:'旋钮操作',look:'dark',focus:'knob',lens:29,az:-25,el:65,distance:120,title:'旋转，微调。\n按下，确认。',kicker:'ROTATE & PRESS',body:'一只 EC11 旋钮。\n让连续调节与明确确认，留在同一个动作范围。',spec:'22.5 mm 旋钮 / EC11'},
 {id:'encoder',duration:2300,label:'编码器安装',look:'paper',focus:'encoder',lens:31,az:35,el:25,distance:110,title:'转动之外，\n安装也有讲究。',kicker:'MECHANICAL INTERFACE',body:'围绕编码器轴、螺母与面板开口，\n为安装和操作留下各自的空间。',spec:'轴向定位 / 面板接口'},
 {id:'structure',duration:2800,label:'内部结构设计',look:'paper',focus:'upperShell',lens:34,az:-25,el:-48,distance:245,title:'看不见的地方，\n也值得设计。',kicker:'STRUCTURE BY DESIGN',body:'屏幕窗口、键轴孔位与内部安装面。\n让每一个开口，都回应一项真实功能。',spec:'壳体内侧 / 安装界面'},
 {id:'shoulder',duration:2400,label:'键轴承托',look:'paper',focus:'upperShell',lens:27,az:-45,el:-38,distance:215,title:'托住法兰。\n让孔位各司其职。',kicker:'SUPPORT AT THE SHOULDER',body:'台阶承托键轴法兰，通孔容纳下部轴体。\n把支撑与穿入，安排在不同的结构层。',spec:'局部肩部 / 法兰槽 / 支撑环'},
 {id:'material',duration:2400,label:'克制用料',look:'paper',focus:'upperShell',lens:30,az:8,el:-65,distance:250,title:'把材料，\n留给需要它的地方。',kicker:'LESS, WITH PURPOSE',body:'内部空腔保留空间，外皮形成轮廓。\n把支撑集中在定位台、螺丝柱与加强肋。',spec:'薄壁外壳 / 局部支撑'},
 {id:'stability',duration:2700,label:'稳定的安装',look:'dark',focus:'retainer',lens:32,az:10,el:50,distance:180,title:'稳定，\n从定位开始。',kicker:'A PLACE TO STAY',body:'独立固定架围绕主板定位。\n把安装约束交给结构，让装配更清楚。',spec:'独立固定架 / M3 安装'},
 {id:'closure',duration:2500,label:'三点闭合',look:'paper',focus:'serviceCover',lens:34,az:-12,el:55,distance:230,title:'三处连接。\n一个清楚的闭合路径。',kicker:'THREE-POINT CLOSURE',body:'三点 M3 服务螺丝配合定位边与局部加强肋。\n让底盖可拆，也让固定位置明确。',spec:'3 × M3 / 可拆服务闭合'},
 {id:'service',duration:2400,label:'可拆解维护',look:'dark',focus:'serviceCover',lens:34,az:35,el:45,distance:225,title:'打开之后，\n仍然井井有条。',kicker:'SERVICEABLE BY DESIGN',body:'宽平支撑面、短侧轨与开放引线侧。\n为软包电池保留空间，也为拆装留下入口。',spec:'电池托位 / 局部定位 / 开放引线侧'},
 {id:'craft',duration:2700,label:'可打印设计',look:'paper',focus:'upperShell',lens:38,az:-20,el:38,distance:285,title:'从一份文件，\n到一件实物。',kicker:'MADE TO BE MADE',body:'11 个可打印部件，准备在同一块打印板上。\n从外壳到键帽，让每个文件都对应一件真实部件。',spec:'STL / 3MF / 256 × 256 mm 打印板'},
 {id:'customize',duration:2300,label:'自由制作',look:'paper',focus:'keycapFocus',lens:38,az:25,el:65,distance:180,title:'保留结构。\n表达自己。',kicker:'MAKE IT YOURS',body:'从键帽、旋钮到外壳，\n用自己的材料与颜色，完成不同的表达。',spec:'开放设计 / 自由迭代'},
 {id:'reassemble',duration:3400,label:'回到整体',look:'dark',focus:'upperShell',lens:34,az:-16,el:47,distance:285,title:'所有细节，\n回到同一件物品。',kicker:'BACK TOGETHER',body:'结构、触感与反馈，\n最终汇成手边的一次操作。',spec:'从内部世界，回到日常'},
 {id:'final',duration:2700,label:'由你定义',look:'product',focus:'upperShell',lens:26,az:-15,el:56,distance:235,title:'手边的控制。\n由你定义。',kicker:'OPEN BY DESIGN',body:'机械结构与固件开放。\n让每一次改动，都有新的可能。',spec:'LUMA REMOTE / A3.43'},
]);
let cursor=0;
export const BEAT_RANGES=Object.freeze(SHOTS.map(s=>{const start=cursor;cursor+=s.duration;return[s.id,start,cursor];}));
export const TOTAL_TIME=cursor;
export const motion={filmTime:0};
export const scrollMotion={filmTime:0};
export const clamp=t=>Math.max(0,Math.min(1,t));
export const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a));return u*u*(3-2*u);};
export function beatAt(time){const t=clamp(time/TOTAL_TIME)*TOTAL_TIME;let index=BEAT_RANGES.findIndex(([,a,b])=>t>=a&&t<b);if(index<0)index=SHOTS.length-1;const[,a,b]=BEAT_RANGES[index];return{id:SHOTS[index].id,index,progress:clamp((t-a)/(b-a)),shot:SHOTS[index]};}
export function evaluateMotion(time){
 const t=Math.max(0,Math.min(TOTAL_TIME,Number(time)||0));const beat=beatAt(t);
 const assembly=BEAT_RANGES.find(([id])=>id==='reassemble');
 const opening=BEAT_RANGES.find(([id])=>id==='unfold');
 const fieldReady=BEAT_RANGES.find(([id])=>id==='constellation')[2];
 const explosion=smooth(opening[1]+350,fieldReady,t)*(1-smooth(assembly[1],assembly[2],t));
 let paper=0;
 for(const [id,a,b] of BEAT_RANGES){if(SHOTS.find(s=>s.id===id).look==='paper')paper=Math.max(paper,smooth(a-550,a+400,t)*(1-smooth(b-400,b+550,t)));}
 // Adjacent paper chapters form one uninterrupted light environment.
 for(let i=0;i<SHOTS.length-1;i++)if(SHOTS[i].look==='paper'&&SHOTS[i+1].look==='paper'){
  const boundary=BEAT_RANGES[i][2];paper=Math.max(paper,smooth(boundary-650,boundary-400,t)*(1-smooth(boundary+400,boundary+650,t)));
 }
 const hero=1-smooth(0,BEAT_RANGES[0][2],t);
 return{filmTime:t,shotId:beat.id,shotIndex:beat.index,shotProgress:beat.progress,explosion,field:explosion,paper,hero,
 lineArt:paper,technicalMix:explosion,focusCore:beat.shot.focus==='mainboard'?1:0,focusControls:['knob','keycapFocus','switchStems','encoder'].includes(beat.shot.focus)?1:0,signal:beat.id==='signal'?smooth(.1,.3,beat.progress)*(1-smooth(.8,1,beat.progress)):0};
}
export function createFilmTimeline(filmRoot,onUpdate=()=>{}){
 const timeline=createTimeline({autoplay:onScroll({target:filmRoot,enter:'top top',leave:'bottom bottom',sync:true}),onUpdate});
 for(const[id,start]of BEAT_RANGES)timeline.label(id,start);
 timeline.add(scrollMotion,{filmTime:[0,TOTAL_TIME],duration:TOTAL_TIME,ease:'linear'},0);return timeline;
}
