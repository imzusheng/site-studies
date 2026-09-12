"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process"),esbuild=require("esbuild");
cp.execFileSync(process.execPath,[path.join(__dirname,"node_modules/typescript/bin/tsc"),"--pretty","false"],{cwd:__dirname,stdio:"inherit"});
esbuild.buildSync({entryPoints:[path.join(__dirname,"tools/vendor.mjs")],bundle:true,format:"iife",outfile:path.join(__dirname,"dist/vendor.js"),minify:true});
const read=n=>fs.readFileSync(path.join(__dirname,n),"utf8"),escape=s=>s.replace(/<\/script/gi,"<\\/script");
const vendor="<script>"+escape(read("dist/vendor.js"))+"</script>";
const html=read("template.html").replace("/*__CSS__*/",()=>read("style.css")).replace("/*__APP__*/",()=>escape(read("dist/game.js"))).replace("<!--__VENDOR__-->",()=>vendor);
for(const file of ["index.html","baseline-motion.html"])fs.writeFileSync(path.join(__dirname,"dist",file),html);
console.log("Built offline BASELINE: "+Math.round(Buffer.byteLength(html)/1024)+" KiB");
