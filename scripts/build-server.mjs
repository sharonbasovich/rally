import {build} from 'esbuild';
await build({entryPoints:['apps/server/src/index.ts'],outfile:'apps/server/dist/index.js',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',alias:{'@rally/shared/config':'./packages/shared/src/config.ts','@rally/shared':'./packages/shared/src/engine.ts'},sourcemap:true});
