import {clamp} from '@rally/shared';
import {FORM_CONFIG as C} from '@rally/shared/config';
import type {PoseSample} from './pose';
export interface FormHit{hitId:string;inputSequence:number;accuracy:number;side?:number}
export interface FormScore{hitId:string;score:number;label:'PERFECT'|'GREAT'|'OK'|'WEAK';accuracy:number;timing:number;swingSpeed:number;extension:number;followThrough:number;confidence:number}
/** Evaluate after 160ms so the window includes actual follow-through. Missing history is not a perfect score. */
export function scoreForm(hit:FormHit,history:PoseSample[],poseSequence=hit.inputSequence):FormScore|null{
 const contact=history.find(s=>s.sequence===poseSequence);if(!contact)return null;
 const window=history.filter(s=>s.time>=contact.time-C.beforeMs&&s.time<=contact.time+C.afterMs);
 const peak=Math.max(.01,...window.map(s=>s.wristSpeed));const swingSpeed=clamp(contact.wristSpeed/C.speedTarget,0,1),timing=clamp(contact.wristSpeed/peak,0,1)*clamp(contact.wristSpeed/C.timingMinSpeed,0,1);
 const extension=contact.elbowAngle>=95&&contact.elbowAngle<=165?1:clamp(1-Math.min(Math.abs(contact.elbowAngle-95),Math.abs(contact.elbowAngle-165))/50,0,1);
 const after=window.filter(s=>s.time>contact.time).at(-1);const direction=Math.hypot(contact.wristVX,contact.wristVY);
 const continuation=after&&direction>.1?((after.wristX-contact.wristX)*contact.wristVX+(after.wristY-contact.wristY)*contact.wristVY)/direction:0;
 const followThrough=clamp(continuation/C.followDistance,0,1),accuracy=clamp(hit.accuracy,0,1),confidence=Math.min(...window.map(s=>s.confidence));
 const score=Math.round(100*(accuracy*.35+timing*.25+swingSpeed*.2+extension*.1+followThrough*.1));
 return {hitId:hit.hitId,score,label:score>=C.perfect?'PERFECT':score>=C.great?'GREAT':score>=C.ok?'OK':'WEAK',accuracy,timing,swingSpeed,extension,followThrough,confidence};
}

