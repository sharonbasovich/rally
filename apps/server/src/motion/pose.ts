import {clamp, type RacketInput} from '@rally/shared';
export interface Landmark{x:number;y:number;z?:number;visibility?:number}
export type CalibrationStage='body'|'hand'|'neutral'|'ready';
import {POSE_CONFIG} from '@rally/shared/config';
export {POSE_CONFIG} from '@rally/shared/config';
export interface PoseSample{sequence:number;time:number;wristX:number;wristY:number;paddleX:number;paddleY:number;wristVX:number;wristVY:number;wristSpeed:number;elbowAngle:number;shoulderWidth:number;confidence:number}
export interface PoseResult{input:RacketInput;wrist:{x:number;y:number}|null;head:boolean;shoulders:boolean;hand:boolean;selected:'left'|'right'|null;points:Landmark[];calibrationStage:CalibrationStage;calibrated:boolean;progress:number;confidence:number;elbowAngle:number;sequence:number}
export function elbowAngle(shoulder:Landmark,elbow:Landmark,wrist:Landmark){const ax=shoulder.x-elbow.x,ay=shoulder.y-elbow.y,bx=wrist.x-elbow.x,by=wrist.y-elbow.y;return Math.acos(clamp((ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by)||1),-1,1))*180/Math.PI;}
export class PoseInput{
 selected:'left'|'right'|null=null;stage:CalibrationStage='body';history:PoseSample[]=[];sequence=0;
 private since:number|null=null;private candidate:'left'|'right'|null=null;private neutral:{x:number;y:number}[]=[];private center={x:0,y:0};private previous:PoseSample|null=null;private body:{x:number;y:number;width:number}|null=null;private lastTime:number|null=null;private lastPeak=0;
 reset(){this.selected=null;this.stage='body';this.history=[];this.sequence=0;this.since=null;this.candidate=null;this.neutral=[];this.previous=null;this.body=null;this.lastTime=null;this.lastPeak=0;}
 update(points:Landmark[],now:number):PoseResult{
  if(this.lastTime!==null&&now-this.lastTime>250){this.since=null;this.neutral=[];this.previous=null;}this.lastTime=now;
  this.history=this.history.filter(p=>now-p.time<=POSE_CONFIG.historyMs);
  const visible=(i:number)=>!!points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)&&(points[i].visibility??1)>POSE_CONFIG.visibility;
  const r:PoseResult={input:{x:0,y:1.5,swing:0,tilt:0},wrist:null,head:visible(0),shoulders:visible(11)&&visible(12),hand:false,selected:this.selected,points,calibrationStage:this.stage,calibrated:this.stage==='ready',progress:0,confidence:0,elbowAngle:0,sequence:this.sequence};
  const finish=()=>{r.selected=this.selected;r.calibrationStage=this.stage;r.calibrated=this.stage==='ready';return r;};
  if(!r.shoulders){this.since=null;this.neutral=[];this.previous=null;return finish();}
  const left=points[11],right=points[12],midX=(left.x+right.x)/2,midY=(left.y+right.y)/2,width=Math.hypot(left.x-right.x,left.y-right.y);
  // A laptop webcam at desk distance crops the hips out of frame, which used to stall
  // calibration on the body stage forever. Hips are the better torso scale when they are
  // there; otherwise derive it from shoulder breadth, which trunk length tracks at ~1.35x.
  const hips=visible(23)&&visible(24);
  const torso=hips?Math.hypot((points[23].x+points[24].x)/2-midX,(points[23].y+points[24].y)/2-midY):width*1.35;
  if(width<.08||torso<.08){this.since=null;r.shoulders=false;return finish();}
  if(this.stage==='body'){
   if(this.body&&(Math.hypot(midX-this.body.x,midY-this.body.y)>.04||Math.abs(width-this.body.width)>.04))this.since=null;
   this.body={x:midX,y:midY,width};this.since??=now;r.progress=clamp((now-this.since)/POSE_CONFIG.bodyMs,0,1);
   if(r.progress===1){this.stage='hand';this.since=null;}return finish();
  }
  if(this.stage==='hand'){
   const raised=[15,16].filter(i=>visible(i)&&points[i].y<points[i-4].y-.025).sort((a,b)=>points[a].y-points[b].y);const candidate=raised.length?(raised[0]===15?'left':'right'):null;
   if(candidate!==this.candidate){this.since=null;this.candidate=candidate;}if(!candidate){this.since=null;return finish();}
   this.since??=now;r.progress=clamp((now-this.since)/POSE_CONFIG.handMs,0,1);
   if(r.progress===1){this.selected=candidate;this.stage='neutral';this.since=null;}return finish();
  }
  const indices=this.selected==='left'?[11,13,15]:[12,14,16];if(!indices.every(visible)){this.since=null;this.neutral=[];this.previous=null;return finish();}
  const [shoulder,elbow,wrist]=indices.map(i=>points[i]);const nx=(POSE_CONFIG.mirror?midX-wrist.x:wrist.x-midX)/width,ny=(midY-wrist.y)/torso;
  r.hand=true;r.wrist={x:1-wrist.x,y:wrist.y};r.elbowAngle=elbowAngle(shoulder,elbow,wrist);r.confidence=Math.min(...[11,12,...(hips?[23,24]:[]),...indices].map(i=>points[i].visibility??1));
  if(this.stage==='neutral'){
   // Wait for the raised hand to lower, then average a comfortable, steady pose.
   if(wrist.y<shoulder.y){this.since=null;this.neutral=[];return finish();}
   const last=this.neutral.at(-1);if(last&&Math.hypot(nx-last.x,ny-last.y)>.16){this.since=null;this.neutral=[];}
   this.since??=now;this.neutral.push({x:nx,y:ny});r.progress=clamp((now-this.since)/POSE_CONFIG.neutralMs,0,1);
   if(r.progress<1)return finish();this.center={x:this.neutral.reduce((s,p)=>s+p.x,0)/this.neutral.length,y:this.neutral.reduce((s,p)=>s+p.y,0)/this.neutral.length};this.stage='ready';this.previous=null;
  }
  const dt=this.previous?clamp((now-this.previous.time)/1000,.008,.2):1/30;
  // Blend aggressively enough to stay attached to a moving hand while filtering
  // MediaPipe's small frame-to-frame wrist jitter. The local racket renderer
  // applies a second frame-rate-independent spring, so this stays fluid without
  // adding the heavy drag of a long moving average.
  const rawSpeed=this.previous?Math.hypot(nx-this.previous.wristX,ny-this.previous.wristY)/dt:0;
  const alpha=clamp(1-Math.exp(-(18+Math.min(rawSpeed*5,18))*dt),.42,.94);
  const x=this.previous?this.previous.wristX+alpha*(nx-this.previous.wristX):nx,y=this.previous?this.previous.wristY+alpha*(ny-this.previous.wristY):ny;
  const vx=this.previous?(x-this.previous.wristX)/dt:0,vy=this.previous?(y-this.previous.wristY)/dt:0,speed=Math.hypot(vx,vy);
  if(speed>.65&&speed>=(this.previous?.wristSpeed??0)*.9)this.lastPeak=now;
  r.input={x:clamp((x-this.center.x)*1.8,-1.7,1.7),y:clamp(1.5+(y-this.center.y)*1.15,1.03,2.7),swing:clamp(speed*.25,0,1),tilt:clamp(vx*.05,-.7,.7),speed:clamp(speed,0,10),extension:clamp((r.elbowAngle-55)/85,0,1),swingAge:(now-this.lastPeak)/1000,motionX:clamp(vx,-10,10),motionY:clamp(vy,-10,10)};
  const sample:PoseSample={sequence:++this.sequence,time:now,wristX:x,wristY:y,paddleX:r.input.x,paddleY:r.input.y,wristVX:vx,wristVY:vy,wristSpeed:speed,elbowAngle:r.elbowAngle,shoulderWidth:width,confidence:r.confidence};this.previous=sample;this.history.push(sample);r.sequence=this.sequence;return finish();
 }
}

