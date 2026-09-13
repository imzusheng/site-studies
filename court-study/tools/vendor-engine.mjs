/** Explicit one-time build step. All runtime code is cached in the resulting file. */
import {build} from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
fs.mkdirSync(path.join(root,'vendor'),{recursive:true});
await build({entryPoints:[path.join(root,'tools/vendor-entry.js')],outfile:path.join(root,'vendor/three.bundle.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:['es2020'],legalComments:'inline'});
console.log('Cached Three.js engine. Subsequent HTML builds need no network.');
