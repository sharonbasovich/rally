import {randomBytes} from 'node:crypto';
import {Game,clamp,neutralInput,CONFIG,type RacketInput,type GameEvent} from '@rally/shared';
import {PoseInput,type Landmark,type PoseResult} from './motion/pose';
import {scoreForm} from './motion/form';
export type Phase='lobby'|'countdown'|'playing'|'paused'|'results';
export type Mode='multiplayer'|'practice'|'duo';
export interface Player {token:string;socketId:string|null;ready:boolean;lastInput:number;sequence:number;disconnectedAt?:number;input:RacketInput;keys:Set<string>;camera:boolean;pose:PoseInput;result:PoseResult|null;poseAt:number}
interface GradeJob {game:Game;due:number;event:GameEvent;camera:boolean;score:number}
export interface Room {code:string;mode:Mode;players:(Player|null)[];game:Game;phase:Phase;countdown:number;reason:string;pauseCause:'manual'|'connection'|null;updated:number;replays:Set<number>;grades:GradeJob[]}
const allowedKeys=new Set(['KeyA','KeyD','KeyW','KeyS','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter']);
function player(token:string,socketId:string,side=0):Player{return{token,socketId,ready:false,lastInput:Date.now(),sequence:-1,input:neutralInput()[side],keys:new Set(),camera:false,pose:new PoseInput(),result:null,poseAt:0};}
export class Rooms {
 rooms=new Map<string,Room>();
 constructor(public maxRooms=100){}
 create(token:string,socketId:string,mode:Mode='multiplayer'){
  this.expire(Date.now());if(this.rooms.size>=this.maxRooms)throw new Error('All courts are busy. Please try again shortly.');
  let code='';do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(this.rooms.has(code));
  const room:Room={code,mode,players:[player(token,socketId),mode==='multiplayer'?null:player(`${token}:partner`,socketId,1)],game:new Game(Math.random,true),phase:'lobby',countdown:3,reason:'',pauseCause:null,updated:Date.now(),replays:new Set(),grades:[]};
  this.rooms.set(code,room);return room;
 }
 join(code:string,token:string,socketId:string){
  this.expire(Date.now());const room=this.rooms.get(code.toUpperCase());if(!room)throw new Error('Room not found. Check the six-character code.');
  let side=room.players.findIndex(p=>p?.token===token);if(side<0&&room.mode==='multiplayer')side=room.players.findIndex(p=>p===null);
  if(side<0)throw new Error('This room is full.');const previous=room.players[side];
  if(previous?.socketId&&previous.socketId!==socketId)throw new Error('This player is already connected in another tab.');
  room.players[side]=previous?{...previous,socketId,ready:false,sequence:-1,lastInput:Date.now(),disconnectedAt:undefined,keys:new Set()}:player(token,socketId,side);if(room.mode!=='multiplayer'){const partner=room.players[1];room.players[1]=partner?{...partner,socketId,ready:false,lastInput:Date.now(),disconnectedAt:undefined}:player(`${token}:partner`,socketId,1);}
  room.updated=Date.now();return{room,side};
 }
 input(room:Room,side:number,payload:unknown,now=Date.now()){
  if(!payload||typeof payload!=='object')return;const data=payload as Record<string,unknown>,p=room.players[side];if(!p)return;
  if(!Number.isSafeInteger(data.sequence)||(data.sequence as number)<=p.sequence||!Array.isArray(data.keys)||data.keys.length>10||data.keys.some(k=>!allowedKeys.has(k)))return;
  p.sequence=data.sequence as number;p.keys=new Set(data.keys as string[]);p.ready=data.ready===true;p.lastInput=now;room.updated=now;
  if(room.mode!=='multiplayer'){const partner=room.players[1]!;partner.ready=p.ready;partner.lastInput=now;partner.keys=p.keys;}
 }
 setCamera(room:Room,side:number,enabled:boolean){const p=room.players[side];if(!p)return;p.camera=enabled;p.pose.reset();p.poseAt=0;p.result=null;p.input=neutralInput()[side];}
 pose(room:Room,side:number,points:Landmark[],timestamp:number){
  const p=room.players[side];if(!p?.camera)return null;const r=p.pose.update(points,timestamp);p.result=r;
  if(r.calibrated&&r.hand){p.poseAt=timestamp;p.input={...r.input,sequence:r.sequence,x:side===1?-r.input.x:r.input.x,tilt:side===1?-r.input.tilt:r.input.tilt,motionX:side===1?-(r.input.motionX??0):r.input.motionX};}
  else p.input={...p.input,swing:0,speed:0,motionX:0,motionY:0};return r;
 }
 disconnect(room:Room,side:number){
  const sides=room.mode==='multiplayer'?[side]:[0,1];for(const i of sides){const p=room.players[i];if(p){p.socketId=null;p.ready=false;p.disconnectedAt=Date.now();p.keys.clear();p.input={...p.input,swing:0,speed:0,motionX:0,motionY:0};}}
  if(room.phase==='playing'||room.phase==='countdown'){room.phase='paused';room.pauseCause='connection';room.reason='A player disconnected. Waiting for them to return.';}
 }
 leave(room:Room,side:number){this.disconnect(room,side);room.players[side]=null;if(room.mode!=='multiplayer'||!room.players.some(p=>p?.socketId))this.rooms.delete(room.code);else{room.phase='lobby';room.game=new Game(Math.random,true);room.grades=[];room.replays.clear();}}
 expire(now:number){for(const [code,room] of this.rooms){room.players=room.players.map(p=>p&&!p.socketId&&now-(p.disconnectedAt??now)>CONFIG.SEAT_RECOVERY_MS?null:p);if(room.players.every(p=>p===null)||(!room.players.some(p=>p?.socketId)&&now-room.updated>1800000))this.rooms.delete(code);}}
 bothReady(room:Room,now:number){return room.players.every(p=>p?.socketId&&p.ready&&now-p.lastInput<CONFIG.INPUT_TIMEOUT_MS&&(room.phase!=='lobby'||!p.camera||now-p.poseAt<1500));}
 resume(room:Room){if(room.phase!=='paused'||!this.bothReady(room,Date.now()))return false;room.phase='countdown';room.countdown=3;room.reason='';room.pauseCause=null;return true;}
 replay(room:Room,side:number){if(room.phase!=='results')return;room.replays.add(side);if(room.mode!=='multiplayer'||room.replays.size===2){room.game=new Game(Math.random,true);room.grades=[];room.phase='lobby';room.replays.clear();room.countdown=3;for(const p of room.players)if(p)p.ready=false;}}
 private keyboard(p:Player,side:number,duo:boolean,dt:number){
  const keys=p.keys,left=keys.has(duo&&side===1?'ArrowLeft':'KeyA')||(!duo&&keys.has('ArrowLeft')),right=keys.has(duo&&side===1?'ArrowRight':'KeyD')||(!duo&&keys.has('ArrowRight'));
  const up=keys.has(duo&&side===1?'ArrowUp':'KeyW')||(!duo&&keys.has('ArrowUp')),down=keys.has(duo&&side===1?'ArrowDown':'KeyS')||(!duo&&keys.has('ArrowDown'));
  const swing=keys.has(duo&&side===1?'Enter':'Space')||(!duo&&keys.has('Enter')),dx=(Number(right)-Number(left))*3.4*(side===1?-1:1),dy=(Number(up)-Number(down))*2.8;
  p.input={x:clamp(p.input.x+dx*dt,-1.7,1.7),y:clamp(p.input.y+dy*dt,1.05,2.7),swing:swing?1:0,tilt:0,speed:swing?2.3:Math.hypot(dx,dy),extension:.85,swingAge:swing?0:1,motionX:dx,motionY:dy,sequence:p.sequence};
 }
 tick(room:Room,dt:number,now=Date.now()){
  const ready=this.bothReady(room,now);
  if(room.phase==='paused'&&room.pauseCause==='connection'&&ready){room.phase='countdown';room.countdown=3;room.pauseCause=null;room.reason='';}
  if(room.phase==='lobby'&&ready){room.phase='countdown';room.countdown=3;}
  if((room.phase==='playing'||room.phase==='countdown')&&!ready){room.phase='paused';room.pauseCause='connection';room.reason='Waiting for both players to reconnect.';}
  room.players.forEach((p,i)=>{if(p&&!p.camera)this.keyboard(p,i,room.mode==='duo',dt);else if(p&&now-p.poseAt>250)p.input={...p.input,swing:0,speed:0,motionX:0,motionY:0};});
  if(room.mode==='practice'&&room.players[1])room.players[1].input=room.game.demoInputs()[1];
  const inputs=room.players.map((p,i)=>p?.input??neutralInput()[i]);
  if(room.phase==='countdown'){room.game.updateRackets(dt,inputs);room.countdown-=dt;if(room.countdown<=0){room.countdown=0;room.phase='playing';}}
  else if(room.phase==='playing'){
   const start=room.game.events.length;room.game.step(dt,inputs);
   for(const event of room.game.events.slice(start)){if(event.type!=='hit'||event.side===undefined)continue;const p=room.players[event.side]!;const i=p.input;
    room.grades.push({game:room.game,due:now+CONFIG.FORM_AFTER_MS,event,camera:p.camera,score:100*((event.accuracy??0)*.35+(i.swing>.1?.25:0)+Math.min(1,(i.speed??0)/2.3)*.2+.085+(i.swing>.1?.1:0))});}
   if(room.game.ended)room.phase='results';
  }
  for(const job of room.grades.filter(j=>j.due<=now)){const e=job.event,p=room.players[e.side!];if(job.game!==room.game||!p)continue;const score=job.camera?scoreForm({hitId:e.hitId!,inputSequence:e.inputSequence!,accuracy:e.accuracy??0},p.pose.history)?.score??0:job.score;room.game.confirmForm(e.hitId!,e.side!,score);}
  room.grades=room.grades.filter(j=>j.due>now);
 }
 snapshot(room:Room){const g=room.game;return{code:room.code,mode:room.mode,phase:room.phase,countdown:room.countdown,reason:room.reason,pauseCause:room.pauseCause,players:room.players.map((p,i)=>({side:i,connected:!!p?.socketId,ready:!!p?.ready,responsive:!!p&&Date.now()-p.lastInput<CONFIG.INPUT_TIMEOUT_MS,replay:room.replays.has(i)})),game:{points:g.points,winner:g.winner,score:g.score,rally:g.rally,best:g.best,collected:g.collected,time:g.time,elapsed:g.elapsed,serve:g.serve,ended:g.ended,rackets:g.rackets,balls:g.balls,boxes:g.boxes,playerEffects:g.playerEffects,playerStats:g.playerStats,shake:g.shake,reveal:g.reveal,popups:g.popups,particles:[]},serverTime:Date.now()};}
}
