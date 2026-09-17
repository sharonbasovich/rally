import type {PoseResult} from '../../server/src/motion/pose';
import {Network} from './network';
export class Tracking {
 stream:MediaStream|null=null;peer:RTCPeerConnection|null=null;ready=false;seen=0;result:PoseResult|null=null;status='Camera is off';error=false;generation=0;lease='';
 private watchdog:ReturnType<typeof setInterval>|null=null;
 constructor(public video:HTMLVideoElement,private network:Network){}
 async start(){
  const stopped=this.stop(),generation=this.generation;await stopped;if(generation!==this.generation)return;this.error=false;this.status='Allow camera access to join the court';
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access needs a secure connection. You can still use the keyboard.');
   const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:360},frameRate:{ideal:30,max:30}},audio:false});
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;this.video.srcObject=stream;await this.video.play();if(generation!==this.generation)return;this.status='Connecting your camera to the court…';
   const setup=await this.network.api('/api/vision/prepare',{});
   if(generation!==this.generation){void this.network.api('/api/vision/stop',{id:setup.id}).catch(()=>{});return;}this.lease=setup.id;
   const pc=new RTCPeerConnection({iceServers:setup.iceServers});this.peer=pc;
   pc.addTransceiver('video',{direction:'recvonly'});for(const track of stream.getVideoTracks()){pc.addTrack(track,stream);track.onended=()=>{void this.fail('Camera disconnected. Retry it or use the keyboard.');};}
   pc.createDataChannel('inference',{ordered:true});
   pc.onconnectionstatechange=()=>{if(generation!==this.generation)return;if(pc.connectionState==='failed')void this.fail('Camera connection lost. Retry it or use the keyboard.');};
   await pc.setLocalDescription(await pc.createOffer());
   await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>done(new Error('Camera connection timed out. Retry or use the keyboard.')),12000);const changed=()=>{if(pc.iceGatheringState==='complete')done();};const done=(error?:Error)=>{clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',changed);error?reject(error):resolve();};pc.addEventListener('icegatheringstatechange',changed);changed();});
   if(generation!==this.generation)return;
   const answer=await this.network.api('/api/vision/start',{id:this.lease,offer:{sdp:pc.localDescription!.sdp,type:'offer'}});
   if(generation!==this.generation)return;await pc.setRemoteDescription(answer);this.ready=true;this.status='Step into view. Keep your shoulders and arms visible.';
   const started=performance.now();this.watchdog=setInterval(()=>{const now=performance.now();if(now-(this.seen||started)>15000)void this.fail('Motion tracking stopped responding. Retry the camera or use the keyboard.');},1000);
  }catch(e){if(generation!==this.generation)return;await this.fail((e as Error).name==='NotAllowedError'?'Camera permission was declined. Retry or use the keyboard.':(e as Error).message);}
 }
 receive(result:PoseResult){if(!this.stream)return;this.result=result;this.seen=performance.now();this.status=({body:'Step into view on your own. Keep shoulders and arms visible.',hand:'Raise your playing hand and hold it there.',neutral:'Lower your hand comfortably in front of you. Hold still.',ready:'Ready — move your hand to rally!'})[result.calibrationStage];}
 detected(now:number){return !!this.result?.calibrated&&!!this.result.hand&&now-this.seen<500;}
 async fail(message:string){const stopped=this.stop(),generation=this.generation;await stopped;if(generation!==this.generation)return;this.error=true;this.status=message;}
 async stop(){this.generation++;this.ready=false;this.seen=0;this.result=null;if(this.watchdog)clearInterval(this.watchdog);this.watchdog=null;const id=this.lease;this.lease='';this.peer?.close();this.peer=null;this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;this.video.srcObject=null;if(id)void this.network.api('/api/vision/stop',{id},true).catch(()=>{});await this.network.keyboard();}
}
