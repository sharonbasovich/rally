import {PoseInput,type PoseResult,type Landmark} from '../../server/src/motion/pose';
import {Network} from './network';

/** One frame in flight: slow devices drop frames instead of building a queue. */
export class Tracking {
 stream:MediaStream|null=null;ready=false;seen=0;result:PoseResult|null=null;status='Camera is off';error=false;generation=0;
 private cancelLoad:(()=>void)|null=null;private worker:Worker|null=null;private timer:ReturnType<typeof setTimeout>|null=null;
 private pose=new PoseInput();private validAt=0;private frame=0;private lastVideoTime=-1;
 constructor(public video:HTMLVideoElement,private network:Network){}
 async start(){
  const stopped=this.stop(),generation=this.generation;await stopped;if(generation!==this.generation)return;
  this.error=false;this.status='Allow camera access to join the court';
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access needs HTTPS. You can still use the keyboard.');
   const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}},audio:false});
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;this.video.srcObject=stream;await this.video.play();if(generation!==this.generation)return;
   stream.getTracks().forEach(t=>{t.onended=()=>{void this.fail('Camera disconnected. Retry it or use the keyboard.');};});
   this.status='Loading motion tracking in your browser…';
   const worker=new Worker(new URL('./tracking.worker.ts',import.meta.url),{type:'module'});this.worker=worker;
   await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Motion tracking took too long to load. Retry or use the keyboard.')),30000);
    this.cancelLoad=()=>{clearTimeout(timeout);reject(new Error('Camera stopped.'));};
    worker.onerror=()=>{clearTimeout(timeout);reject(new Error('Browser tracking could not load. Retry or use the keyboard.'));};
    worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timeout);resolve();}else if(data.type==='error'){clearTimeout(timeout);reject(new Error('Browser tracking could not start. Try another browser or use the keyboard.'));}};
    worker.postMessage({type:'init',delegate:'CPU',base:new URL(import.meta.env.BASE_URL,location.href).href});
   });
   this.cancelLoad=null;if(generation!==this.generation)return;
   await this.network.browserCamera();if(generation!==this.generation){await this.network.keyboard();return;}
   this.ready=true;this.status='Step into view. Keep shoulders and arms visible.';
   worker.onerror=()=>{if(generation===this.generation)void this.fail('Motion tracking stopped. Restart the camera or use the keyboard.');};
   worker.onmessage=({data})=>{
    if(generation!==this.generation)return;
    if(data.type==='error'){void this.fail('Motion tracking stopped. Restart the camera or use the keyboard.');return;}
    if(data.type!=='pose')return;
    if(this.timer)clearTimeout(this.timer);
    const age=performance.now()-data.timestamp;
    if(age>=500)this.status='Tracking is running slowly on this device. Close other camera apps or use the keyboard.';
    if(age<500){const points=data.landmarks as Landmark[];this.receive(this.pose.update(points,data.timestamp));this.network.browserPose(points,++this.frame,age);}
    this.timer=setTimeout(()=>{void this.capture(generation);},Math.max(0,1000/30-age));
   };
   void this.capture(generation);
  }catch(e){if(generation!==this.generation)return;await this.fail((e as Error).name==='NotAllowedError'?'Camera permission was declined. Retry or use the keyboard.':(e as Error).message);}
 }
 private async capture(generation:number){
  if(generation!==this.generation||!this.worker)return;
  if(this.video.readyState<2||this.video.currentTime===this.lastVideoTime){this.timer=setTimeout(()=>{void this.capture(generation);},16);return;}
  this.lastVideoTime=this.video.currentTime;
  try{
   const timestamp=performance.now(),bitmap=await createImageBitmap(this.video);
   if(generation!==this.generation||!this.worker){bitmap.close();return;}
   this.worker.postMessage({type:'frame',bitmap,timestamp},[bitmap]);
   this.timer=setTimeout(()=>{if(generation===this.generation)void this.fail('Motion tracking stopped responding. Restart the camera or use the keyboard.');},10000);
  }catch{if(generation===this.generation)void this.fail('This browser could not read camera frames. Try another browser or use the keyboard.');}
 }
 receive(result:PoseResult){if(!this.stream)return;this.result=result;this.seen=performance.now();if(result.calibrated&&result.hand)this.validAt=this.seen;this.status=({body:'Step into view on your own. Keep shoulders and arms visible.',hand:'Raise your playing hand and hold it there.',neutral:'Lower your hand comfortably in front of you. Hold still.',ready:result.hand?'Ready — move your hand to rally!':'Keep your playing hand and shoulders in view.'})[result.calibrationStage];}
 detected(now:number){return this.validAt>0&&now-this.validAt<1500;}
 async fail(message:string){const stopped=this.stop(),generation=this.generation;await stopped;if(generation!==this.generation)return;this.error=true;this.status=message;}
 async stop(){this.generation++;this.cancelLoad?.();this.cancelLoad=null;this.ready=false;this.seen=0;this.validAt=0;this.result=null;this.pose.reset();this.frame=0;this.lastVideoTime=-1;if(this.timer)clearTimeout(this.timer);this.timer=null;this.worker?.terminate();this.worker=null;this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;this.video.srcObject=null;await this.network.keyboard();}
}
