/** A hard, cross-platform process-tree timeout. Use node/python executables, not shell aliases. */
import {spawn,spawnSync} from 'node:child_process';
const [milliseconds,command,...args]=process.argv.slice(2),ms=Number(milliseconds);
if(!command||!Number.isInteger(ms)||ms<100||ms>3600000){console.error('Usage: node tools/run-bounded.mjs <100..3600000 ms> <executable> [args...]');process.exit(2)}
const win=process.platform==='win32';let timedOut=false;
const started=Date.now();
const child=spawn(command,args,{stdio:'inherit',shell:false,detached:!win,windowsHide:true});
const terminate=()=>{
 if(!child.pid)return;
 if(win)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{timeout:5000,stdio:'ignore',windowsHide:true});
 else {try{process.kill(-child.pid,'SIGKILL')}catch{try{child.kill('SIGKILL')}catch{}}}
};
const timer=setTimeout(()=>{timedOut=true;console.error(`TIMEOUT ${ms}ms: ${command}`);terminate()},ms);
child.on('error',e=>{clearTimeout(timer);console.error(e.message);process.exitCode=1});
child.on('exit',(code,signal)=>{clearTimeout(timer);console.log(`Finished after ${Date.now()-started}ms, code=${code}, signal=${signal||'none'}`);process.exitCode=timedOut?124:(code??1)});
process.once('SIGINT',()=>{terminate();process.exit(130)});
process.once('SIGTERM',()=>{terminate();process.exit(143)});
