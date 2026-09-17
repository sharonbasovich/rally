import {createApplication} from './app';
const production=process.env.NODE_ENV==='production';
const port=Number(process.env.PORT??3001);
const origin=process.env.PUBLIC_ORIGIN??(process.env.RENDER_EXTERNAL_URL||`http://localhost:5174`);
if(production&&new URL(origin).protocol!=='https:')throw new Error('PUBLIC_ORIGIN must be the HTTPS address players use.');
const application=createApplication({origin,production});
application.http.listen(port,'0.0.0.0',()=>console.log(`Rally listening on port ${port}; camera ${application.vision.enabled?'configured':'not configured'}`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void application.close().then(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
