import {cp,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
await mkdir(new URL('apps/client/public/wasm/',root),{recursive:true});
await cp(fileURLToPath(new URL('node_modules/@mediapipe/tasks-vision/wasm/',root)),fileURLToPath(new URL('apps/client/public/wasm/',root)),{recursive:true});
