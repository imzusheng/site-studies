'use strict';
// PURE LOGIC HARNESS. World and audio are intentionally not rendered. This is NOT a WebGL test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/game.js'),'utf8');
const noop=()=>{};
const fakeNode={setAttribute:noop,removeAttribute:noop,addEventListener:noop};
const context=vm.createContext({console,Math,Float32Array,Uint16Array,window:{addEventListener:noop},document:{addEventListener:noop,getElementById:()=>fakeNode},localStorage:{getItem:()=>null,setItem:noop},requestAnimationFrame:noop});
vm.runInContext(source.slice(0,source.lastIndexOf('var Rally;')),context);
const R=context.Rally;
R.World=class NonRenderingWorld {constructor(){this.r={canvas:fakeNode};this.effects=[];this.cameraKick=0;}resetTrail(){}effect(){}update(){} addEffect(){} spark(){}};
function createGame(){const g=new R.Game(fakeNode);g.assetsReady=true;g.sound={unlock:noop,hit:noop,tone:noop,bounce:noop,dash:noop,point:noop,swing:noop};return g;}
module.exports={R,createGame,context};
