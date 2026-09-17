import {io,type Socket} from 'socket.io-client';
import {Game,type GameEvent} from './engine';
import type {Snapshot} from '@rally/shared/protocol';
import {CONFIG} from '@rally/shared/config';
export type {Snapshot};
export class Network {
 socket:Socket|null=null;side=0;code='';latest:Snapshot|null=null;connected=false;error='';lastReceived=0;rtt=0;token='';mode:Snapshot['mode']='multiplayer';
 onUpdate:(s:Snapshot)=>void=()=>{};onEvents:(events:GameEvent[])=>void=()=>{};onReconnect:()=>void=()=>{};onDisconnect:()=>void=()=>{};
 buffer:{time:number;data:Snapshot}[]=[];private retry:ReturnType<typeof setTimeout>|null=null;
 async api(path:string,body:unknown,keepalive=false){
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.token}`},body:JSON.stringify(body),keepalive,signal:keepalive?undefined:AbortSignal.timeout(65000)});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'The court could not connect. Please try again.');}return r.status===204?null:r.json();
 }
 async connect(_url:string,kind:'create'|'join',code='',mode:Snapshot['mode']='multiplayer'){
  this.close();this.error='';this.latest=null;
  try{this.token=sessionStorage.getItem('rally-session')??'';}catch{}
  if(!this.token){const s=await this.api('/api/session',{});this.token=s.token;try{sessionStorage.setItem('rally-session',this.token);}catch{}}
  const socket=io({autoConnect:false,timeout:7000,reconnection:true,auth:{token:this.token}});this.socket=socket;let joined=false;
  socket.on('snapshot',(s:Snapshot)=>{const time=performance.now();this.latest=s;this.lastReceived=time;this.buffer.push({time,data:s});if(this.buffer.length>32)this.buffer.shift();this.onUpdate(s);});
  socket.on('events',(events:GameEvent[])=>this.onEvents(events));
  socket.on('disconnect',()=>{this.connected=false;this.error='Connection lost. Reconnecting…';this.onDisconnect();});
  socket.on('room-error',(message:string)=>{this.error=message;});
  socket.on('connect',()=>{if(joined)socket.timeout(7000).emit('join',{code:this.code},(err:Error|null,r:{error?:string;side:number;mode:Snapshot['mode']})=>{if(err||r?.error){this.error=r?.error||'Your room could not reconnect. Return to the menu.';return;}this.side=r.side;this.mode=r.mode;this.connected=true;this.error='';this.buffer=[];this.onReconnect();});});
  return new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>{if(!joined){socket.disconnect();reject(new Error(this.error||'The court did not answer. Please retry.'));}},10000);
   socket.on('connect_error',(error:Error)=>{if(joined&&error.message.includes('already connected')){if(this.retry)clearTimeout(this.retry);this.retry=setTimeout(()=>{if(this.socket===socket)socket.connect();},2000);}this.error=error.message.includes('Session')?error.message:'The court is unavailable. Please retry shortly.';if(error.message.includes('expired'))try{sessionStorage.removeItem('rally-session');}catch{}if(!joined){clearTimeout(timeout);socket.disconnect();reject(new Error(this.error));}});
   socket.once('connect',()=>socket.emit(kind,{code,mode},(result:{error?:string;code:string;side:number;mode:Snapshot['mode']})=>{clearTimeout(timeout);if(result.error){socket.disconnect();reject(new Error(result.error));return;}this.code=result.code;this.side=result.side;this.mode=result.mode;joined=true;this.connected=true;try{sessionStorage.setItem('rally-last-room',this.code);}catch{}resolve();}));socket.connect();
  });
 }
 send(keys:Set<string>,ready:boolean,sequence:number,reliable=false){if(this.connected){const emitter=reliable?this.socket:this.socket?.volatile;emitter?.emit('input',{keys:[...keys],ready,sequence});}}
 sample(now:number):Game|null{
  if(!this.latest)return null;const target=now-CONFIG.NETWORK_INTERPOLATION_MS,game=Object.assign(new Game(),this.latest.game);
  const a=[...this.buffer].reverse().find(v=>v.time<=target),b=this.buffer.find(v=>v.time>target);
  if(a&&b){const alpha=Math.min(1,(target-a.time)/(b.time-a.time));game.balls=this.latest.game.balls.map((ball,i)=>{const old=a.data.game.balls[i],next=b.data.game.balls[i];if(!old||!next||Math.hypot(next.x-old.x,next.y-old.y,next.z-old.z)>1.4)return{...ball};return{...next,x:old.x+(next.x-old.x)*alpha,y:old.y+(next.y-old.y)*alpha,z:old.z+(next.z-old.z)*alpha};});game.rackets=this.latest.game.rackets.map((r,i)=>{const old=a.data.game.rackets[i],next=b.data.game.rackets[i];return old&&next?{...next,x:old.x+(next.x-old.x)*alpha,y:old.y+(next.y-old.y)*alpha}:{...r};});}
  return game;
 }
 async browserCamera(){if(!this.connected||!this.socket)throw new Error('Reconnect to the room before starting your camera.');const result=await this.socket.timeout(5000).emitWithAck('browser-camera');if(!result?.ok)throw new Error('Browser tracking is unavailable on this server.');}
 browserPose(points:unknown[],sequence:number,age:number){if(this.connected)this.socket?.volatile.emit('browser-pose',{points,sequence,age});}
 async keyboard(){if(!this.connected)return;await new Promise<void>(resolve=>{this.socket?.timeout(2000).emit('keyboard',()=>resolve());});}
 ping(){const start=performance.now();this.socket?.timeout(1500).emit('latency',Date.now(),(error:Error|null)=>{if(!error)this.rtt=Math.round(performance.now()-start);});}
 pause(){this.socket?.emit('pause');}resume(){this.socket?.emit('resume');}replay(){this.socket?.emit('replay');}
 suspend(){if(this.retry)clearTimeout(this.retry);this.retry=null;this.socket?.disconnect();this.connected=false;}
 close(){if(this.retry)clearTimeout(this.retry);this.retry=null;if(this.code)try{sessionStorage.removeItem('rally-last-room');}catch{}const s=this.socket;this.socket=null;s?.removeAllListeners();s?.emit('leave');s?.disconnect();this.connected=false;this.buffer=[];this.code='';}
}
