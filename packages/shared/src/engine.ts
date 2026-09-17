export {CONFIG,POSE_CONFIG,FORM_CONFIG} from './config';
import {CONFIG as C} from './config';
export type Power='mega'|'smash'|'shield'|'giant'|'clone';
export const POWER:Record<Power,{name:string;icon:string;color:string;duration:number;description:string}>={
 mega:{name:'Big Racket',icon:'↕',color:'#70caed',duration:C.BIG_RACKET_DURATION,description:'A bigger racket for the next 8 seconds.'},
 smash:{name:'Smash',icon:'ϟ',color:'#ffad61',duration:86400,description:'Your next return gets a burst of speed.'},
 shield:{name:'Shield',icon:'◇',color:'#a69af6',duration:86400,description:'One missed return. One second chance.'},
 giant:{name:'Giga Ball',icon:'●',color:'#ff5fa2',duration:C.GIANT_BALL_DURATION,description:'The real ball becomes enormous for 8 seconds.'},
 clone:{name:'Decoy Ball',icon:'◈',color:'#5df2df',duration:C.CLONE_BALL_DURATION,description:'A bright hologram copies the ball for 7 seconds.'},
};
export const TABLE_Y=C.TABLE_Y,HALF_W=C.HALF_WIDTH,HALF_L=C.HALF_LENGTH,GRAVITY=C.GRAVITY;
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export interface Vec3{x:number;y:number;z:number}
export interface RacketInput{x:number;y:number;swing:number;tilt:number;speed?:number;extension?:number;swingAge?:number;motionX?:number;motionY?:number;sequence?:number}
export interface Racket extends RacketInput{z:number;impact:number;vx:number;vy:number}
export interface Ball extends Vec3{vx:number;vy:number;vz:number;trail:Vec3[];extra:boolean;bounces:number;lastSide:number;netCooldown:number;smash:boolean;life?:number}
export interface Box extends Vec3{phase:number;id:number;power:Power}
export interface Particle extends Vec3{vx:number;vy:number;vz:number;life:number;color:string;size:number;spin:number;drag:number}
export interface Popup extends Vec3{text:string;life:number;color:string}
export type Grade='PERFECT'|'GREAT'|'OK'|'WEAK'|'MISS'|'SAVED';
export type GameEvent={type:'hit'|'bounce'|'box'|'miss'|'net'|'end'|'grade'|'point';hitId?:string;inputSequence?:number;accuracy?:number;power?:Power;side?:number;grade?:Grade};
export interface PlayerStats{meter:number;perfect:number;great:number;quality:number;lastGrade:Grade|null;gradeLife:number;powerCount:number}
interface PendingGrade{hitId:string;side:number;due:number;accuracy:number;timing:number;speed:number;extension:number;mx:number;my:number}
export const neutralInput=():RacketInput[]=>[{x:-.2,y:1.5,swing:0,tilt:0},{x:.2,y:1.5,swing:0,tilt:0}];
export class Game{
 points:[number,number]=[0,0];winner:number|null=null;hitCounter=0;score=0;rally=0;best=0;collected=0;time=0;elapsed=0;serve:number=C.INITIAL_SERVE_DELAY;ended=false;
 rackets:Racket[]=neutralInput().map((p,i)=>({...p,z:i===0?C.HIT_PLANE_Z:-C.HIT_PLANE_Z,impact:0,vx:0,vy:0}));
 balls:Ball[]=[];boxes:Box[]=[];playerEffects:Partial<Record<Power,number>>[]=[{},{}];
 playerStats:PlayerStats[]=[0,1].map(()=>({meter:0,perfect:0,great:0,quality:0,lastGrade:null,gradeLife:0,powerCount:0}));
 particles:Particle[]=[];popups:Popup[]=[];events:GameEvent[]=[];pendingGrades:PendingGrade[]=[];
 shake=0;nextBox:number=C.TARGET_INITIAL_DELAY;boxId=0;lastPower:Power|null=null;reveal=0;serveSide=0;
 constructor(public random:()=>number=Math.random,public externalForm=false){this.balls=[this.newBall()];}
 get radius(){return C.BALL_RADIUS*(this.playerEffects.some(effect=>!!effect.giant)?C.GIANT_BALL_MULTIPLIER:1);}
 racketScaleFor(side:number){return this.playerEffects[side].mega?C.BIG_RACKET_MULTIPLIER:1;}
 newBall():Ball{const side=this.serveSide,dir=side===0?-1:1,r=this.rackets[side];return{x:r.x,y:1.55,z:dir*-2.5,vx:-r.x*.5,vy:1.4,vz:dir*5.1,trail:[],extra:false,bounces:0,lastSide:side,netCooldown:0,smash:false};}
 burst(x:number,y:number,z:number,color:string,count=28,force=1){for(let i=0;i<count;i++){const a=this.random()*Math.PI*2,elevation=.15+this.random()*.85,s=(1.2+this.random()*4.2)*force;this.particles.push({x,y,z,vx:Math.cos(a)*s*(1-elevation*.3),vy:(.8+this.random()*4.4)*force*elevation,vz:Math.sin(a)*s*(1-elevation*.3),life:.55+this.random()*1.05,color:i%5===0?'#ffffff':color,size:.018+this.random()*.065*force,spin:(this.random()-.5)*18,drag:.35+this.random()*.8});}if(this.particles.length>520)this.particles.splice(0,this.particles.length-520);}
 activate(power:Power,side=0){this.playerEffects[side]={[power]:POWER[power].duration};this.lastPower=power;this.reveal=1.1;if(power==='clone'){this.balls=this.balls.filter(b=>!b.extra);const real=this.balls[0];if(real)this.balls.push({...real,x:clamp(-real.x+(side===0 ? .34 : -.34),-1.45,1.45),vx:-real.vx+(side===0 ? .65 : -.65),vy:real.vy*.92+.35,trail:[],extra:true,smash:false,bounces:0,netCooldown:0,life:C.CLONE_BALL_DURATION});}this.events.push({type:'box',power,side});}
 updateRackets(dt:number,inputs:RacketInput[]){this.rackets.forEach((r,i)=>{const target=inputs[i],oldX=r.x,oldY=r.y,alpha=1-Math.exp(-C.PADDLE_SMOOTHING*dt);
  r.x+=(clamp(target.x,-C.PADDLE_X_RANGE,C.PADDLE_X_RANGE)-r.x)*alpha;r.y+=(clamp(target.y,C.PADDLE_MIN_Y,C.PADDLE_MAX_Y)-r.y)*alpha;
  r.vx=dt?(r.x-oldX)/dt:0;r.vy=dt?(r.y-oldY)/dt:0;r.swing=clamp(target.swing,0,1);r.tilt=clamp(target.tilt,-.8,.8);
  r.speed=target.speed??Math.hypot(r.vx,r.vy);r.extension=target.extension??.7;r.swingAge=target.swingAge??(r.swing>.1?0:1);r.motionX=target.motionX??r.vx;r.motionY=target.motionY??r.vy;
  r.sequence=target.sequence;r.z=(i===0?1:-1)*C.HIT_PLANE_Z;r.impact=Math.max(0,r.impact-dt*5);
 });}
 strike(b:Ball,side:number,saved=false){const r=this.rackets[side],dir=side===0?-1:1,scale=this.racketScaleFor(side);
  const accuracy=clamp(1-Math.hypot((b.x-r.x)/(C.PADDLE_RADIUS_X*scale+this.radius),(b.y-r.y)/(C.PADDLE_RADIUS_Y*scale+this.radius)),0,1);
  const offset=clamp((b.x-r.x)/(.5*scale),-1,1),smash=!!this.playerEffects[side].smash;
  const speed=Math.min(C.MAX_RETURN_SPEED,C.BASE_RETURN_SPEED+this.rally*C.RALLY_SPEED_GAIN+r.swing*C.SWING_SPEED_GAIN)*(smash?C.SMASH_MULTIPLIER:1);
  const landingZ=dir*C.LANDING_Z,travel=Math.abs(landingZ-r.z)/speed,landingX=clamp(offset*1.05+r.tilt*.5+r.vx*.04,-C.LANDING_X,C.LANDING_X);
  b.z=r.z+dir*.09;b.vz=dir*speed;b.vx=(landingX-b.x)/travel;b.vy=(TABLE_Y+this.radius-b.y+.5*GRAVITY*travel*travel)/travel;
  const netTime=Math.abs(b.z/b.vz),netLift=(TABLE_Y+C.NET_HEIGHT+this.radius+C.NET_CLEARANCE-b.y+.5*GRAVITY*netTime*netTime)/netTime;
  b.vy=clamp(Math.max(C.MIN_LIFT,b.vy,netLift),C.MIN_LIFT,C.MAX_VERTICAL_SPEED);b.vx=clamp(b.vx,-C.MAX_LATERAL_SPEED,C.MAX_LATERAL_SPEED);
  const total=Math.hypot(b.vx,b.vy,b.vz);if(total>C.MAX_BALL_SPEED){const f=C.MAX_BALL_SPEED/total;b.vx*=f;b.vy*=f;b.vz*=f;}
  b.bounces=0;b.lastSide=side;b.netCooldown=0;b.smash=smash;delete this.playerEffects[side].smash;
  this.rally++;this.best=Math.max(this.best,this.rally);this.score+=10;r.impact=1;this.shake=smash?.09:.028;
  this.burst(b.x,b.y,b.z,side===0?'#ff9a76':'#8ae5ff',smash?38:16,smash ? .95 : .5);const hitId=String(++this.hitCounter);this.events.push({type:'hit',side,hitId,inputSequence:r.sequence??0,accuracy});
  if(saved){this.playerStats[side].lastGrade='SAVED';this.playerStats[side].gradeLife=1.4;this.events.push({type:'grade',side,grade:'SAVED'});return;}
  this.pendingGrades.push({hitId,side,due:this.elapsed+C.FORM_AFTER_MS/1000,accuracy,timing:clamp(1-(r.swingAge??1)/.26,0,1),speed:clamp((r.speed??0)/2.3,0,1),extension:clamp(r.extension??.7,0,1),mx:r.motionX??0,my:r.motionY??0});
 }
  confirmForm(hitId:string,side:number,score:number){const q=this.pendingGrades.find(q=>q.hitId===hitId&&q.side===side);if(!q||!Number.isFinite(score))return false;this.pendingGrades=this.pendingGrades.filter(v=>v!==q);this.awardGrade(side,clamp(Math.round(score),0,100));return true;}
  awardGrade(side:number,quality:number){
  const grade:Grade=quality>=C.PERFECT_THRESHOLD?'PERFECT':quality>=C.GREAT_THRESHOLD?'GREAT':quality>=C.OK_THRESHOLD?'OK':'WEAK',shownQuality=quality,points=grade==='PERFECT'?C.POWER_PER_PERFECT:grade==='GREAT'?C.POWER_PER_GREAT:grade==='OK'?C.POWER_PER_OK:0,displayGrade=grade==='GREAT'?'GOOD':grade;
  const stats=this.playerStats[side],r=this.rackets[side];stats.lastGrade=grade;stats.gradeLife=1.4;stats.quality=shownQuality;stats.meter+=points;if(grade==='PERFECT')stats.perfect++;if(grade==='GREAT')stats.great++;this.score+=points;
  this.popups.push({x:r.x,y:r.y+.35,z:r.z,text:`${displayGrade} +${points}`,life:1,color:grade==='PERFECT'?'#ffe3a6':'#ffffff'});this.events.push({type:'grade',side,grade});
  if(grade==='PERFECT'){this.burst(r.x,r.y,r.z,'#ffe077',18,.6);this.shake=Math.max(this.shake,.014);}
  if(stats.meter>=100){stats.meter-=100;const powers:Power[]=['mega','smash','shield','giant','clone'];this.activate(powers[stats.powerCount++%powers.length],side);}
 }
 finishGrades(){for(const q of [...this.pendingGrades]){if(q.due>this.elapsed)continue;if(this.externalForm){if(this.elapsed-q.due>C.FORM_TIMEOUT)this.pendingGrades=this.pendingGrades.filter(v=>v!==q);continue;}
  const r=this.rackets[q.side],dot=q.mx*(r.motionX??0)+q.my*(r.motionY??0),follow=dot>.04?1:.25;
  this.confirmForm(q.hitId,q.side,100*(q.accuracy*.35+q.timing*.25+q.speed*.2+q.extension*.1+follow*.1));
 }}
 point(loser:number){const winner=1-loser,winnerRacket=this.rackets[winner];this.points[winner]++;this.rally=0;this.playerStats[loser].lastGrade='MISS';this.playerStats[loser].gradeLife=1.4;this.burst(winnerRacket.x,winnerRacket.y+.2,winnerRacket.z,winner===0?'#ff8d68':'#6fddff',110,1.55);this.shake=.055;this.events.push({type:'miss',side:loser},{type:'point',side:winner});
  if(this.points[1-loser]>=C.MATCH_TARGET_SCORE){this.winner=1-loser;this.ended=true;this.events.push({type:'end',side:this.winner});}
 }
 step(dt:number,inputs:RacketInput[]){if(this.ended)return;dt=clamp(dt,0,C.MAX_STEP);this.elapsed+=dt;this.time=this.elapsed;
  this.updateRackets(dt,inputs);this.shake=Math.max(0,this.shake-dt*.38);this.reveal=Math.max(0,this.reveal-dt);
  for(const stats of this.playerStats)stats.gradeLife=Math.max(0,stats.gradeLife-dt);
  for(const effects of this.playerEffects)for(const key of Object.keys(effects) as Power[]){effects[key]!-=dt;if(effects[key]!<=0)delete effects[key];}
  for(const b of this.balls)if(b.extra)b.life=(b.life??0)-dt;if(!this.playerEffects.some(effect=>!!effect.clone))this.balls=this.balls.filter(b=>!b.extra);else this.balls=this.balls.filter(b=>!b.extra||(b.life??0)>0);
  for(const p of this.particles){p.life-=dt;const damping=Math.exp(-p.drag*dt);p.vx*=damping;p.vz*=damping;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=6.5*dt;const surface=Math.abs(p.x)<HALF_W&&Math.abs(p.z)<HALF_L?TABLE_Y+.03:.035;if(p.y<surface&&p.vy<0){p.y=surface;p.vy*=-.48;p.vx*=.72;p.vz*=.72;}}this.particles=this.particles.filter(p=>p.life>0);
  for(const p of this.popups){p.life-=dt;p.y+=dt*.5;}this.popups=this.popups.filter(p=>p.life>0);this.finishGrades();
  this.nextBox-=dt;
  if(this.nextBox<=0&&this.boxes.length<C.MAX_TARGETS){const positions=[{x:-.65,y:TABLE_Y+.02,z:-1.4},{x:.65,y:TABLE_Y+.02,z:1.4}];const pos=positions.find(p=>!this.boxes.some(b=>b.z===p.z))!;const powers:Power[]=['mega','smash','shield','giant','clone'];this.boxes.push({...pos,phase:this.random()*6,id:this.boxId,power:powers[this.boxId++%powers.length]});this.nextBox=C.TARGET_INTERVAL;}
  if(this.serve>0){this.serve-=dt;const r=this.rackets[this.serveSide];this.balls[0].x=r.x;return;}
  const speed=Math.max(1,...this.balls.map(b=>Math.hypot(b.vx,b.vy,b.vz))),count=Math.max(1,Math.ceil(speed*dt/C.SUBSTEP_DISTANCE)),sub=dt/count,lost=new Set<Ball>();
  for(let s=0;s<count;s++)for(const b of this.balls){if(lost.has(b))continue;const prev={x:b.x,y:b.y,z:b.z};b.vy-=GRAVITY*sub;b.x+=b.vx*sub;b.y+=b.vy*sub;b.z+=b.vz*sub;b.netCooldown-=sub;
   if(b.extra){if(b.vy<0&&prev.y>=TABLE_Y+C.BALL_RADIUS&&b.y<=TABLE_Y+C.BALL_RADIUS&&Math.abs(b.x)<HALF_W&&Math.abs(b.z)<HALF_L){b.y=TABLE_Y+C.BALL_RADIUS;b.vy=Math.abs(b.vy)*C.RESTITUTION;b.bounces++;}if(Math.abs(b.x)>HALF_W){b.x=Math.sign(b.x)*HALF_W;b.vx*=-1;}if(Math.abs(b.z)>3.25){b.z=Math.sign(b.z)*3.24;b.vz*=-1;}continue;}
   if(b.vy<0&&prev.y>=TABLE_Y+this.radius&&b.y<=TABLE_Y+this.radius&&Math.abs(b.x)<HALF_W&&Math.abs(b.z)<HALF_L){
    b.y=TABLE_Y+this.radius;b.vy=Math.abs(b.vy)*C.RESTITUTION;b.bounces++;this.burst(b.x,TABLE_Y+.08,b.z,'#eaf9ff',10,.45);this.events.push({type:'bounce'});
    for(const box of [...this.boxes])if(Math.hypot(b.x-box.x,b.z-box.z)<C.TARGET_RADIUS){this.boxes=this.boxes.filter(v=>v!==box);this.collected++;this.score+=50;this.burst(box.x,TABLE_Y+.25,box.z,POWER[box.power].color,26,.7);this.shake=Math.max(this.shake,.018);this.activate(box.power,b.lastSide);}
    if(b.bounces>2)lost.add(b);
   }
   if(prev.z*b.z<=0&&Math.abs(b.x)<HALF_W+.05&&b.y<TABLE_Y+C.NET_HEIGHT+this.radius&&b.y>TABLE_Y&&b.netCooldown<=0){b.z=prev.z>0?.05:-.05;b.vz*=-.42;b.vy=Math.abs(b.vy)*.35+.55;b.netCooldown=.25;this.burst(b.x,b.y,0,'#d8f3ff',24,.65);this.shake=Math.max(this.shake,.018);this.events.push({type:'net'});}
   for(let i=0;i<2;i++){const r=this.rackets[i],plane=r.z,toward=i===0?b.vz>0:b.vz<0,crossed=i===0?(prev.z<=plane&&b.z>=plane):(prev.z>=plane&&b.z<=plane);
    if(toward&&crossed){const t=(plane-prev.z)/(b.z-prev.z),ix=prev.x+(b.x-prev.x)*t,iy=prev.y+(b.y-prev.y)*t,scale=this.racketScaleFor(i);
     b.x=ix;b.y=iy;b.z=plane;
     if(((ix-r.x)/(C.PADDLE_RADIUS_X*scale+this.radius))**2+((iy-r.y)/(C.PADDLE_RADIUS_Y*scale+this.radius))**2<=1)this.strike(b,i);
     else if(this.playerEffects[i].shield){delete this.playerEffects[i].shield;b.x=r.x;b.y=r.y;this.strike(b,i,true);}
     else lost.add(b);
    }
   }
   if(Math.abs(b.z)>3.7||Math.abs(b.x)>3.4||b.y<.2||b.y>7)lost.add(b);
  }
  if(lost.size){for(const b of lost)this.point(b.vz>0?0:1);this.balls=this.balls.filter(b=>!lost.has(b));}
  if(!this.balls.some(b=>!b.extra)){this.balls=[];for(const effects of this.playerEffects)delete effects.clone;this.serveSide=1-this.serveSide;this.balls=[this.newBall()];this.serve=C.SERVE_DELAY;}
  for(const b of this.balls){b.trail.unshift({x:b.x,y:b.y,z:b.z});b.trail.length=Math.min(b.trail.length,8+Math.min(this.rally,16));}
 }
 demoInputs():RacketInput[]{return this.rackets.map((r,i)=>{const b=this.balls.find(b=>i===0?b.vz>0:b.vz<0)??this.balls[0];return{x:b?b.x:r.x,y:b?clamp(b.y,1.05,2.6):1.5,swing:b&&Math.abs(b.z)>2.3?.35:0,tilt:Math.sin(this.elapsed*.4+i)*.2,speed:2,extension:.85,swingAge:0};});}
}
