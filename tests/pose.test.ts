import {describe,it,expect} from 'vitest';
import {PoseInput,type Landmark,elbowAngle,type PoseSample} from '../apps/server/src/motion/pose';
import {scoreForm} from '../apps/server/src/motion/form';
function body(raised=false):Landmark[]{const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));p[11]={x:.4,y:.3,visibility:1};p[12]={x:.6,y:.3,visibility:1};p[23]={x:.43,y:.65,visibility:1};p[24]={x:.57,y:.65,visibility:1};p[13]={x:.35,y:.4,visibility:1};p[15]={x:.3,y:raised?.2:.48,visibility:1};p[16]={x:.7,y:.48,visibility:1};return p;}
function calibrate(mapper:PoseInput){for(let t=0;t<=500;t+=50)mapper.update(body(),t);for(let t=550;t<=1050;t+=50)mapper.update(body(true),t);for(let t=1100;t<=2100;t+=50)mapper.update(body(),t);}
describe('body calibrated tracking',()=>{
 it('requires sustained body, raised hand, and neutral calibration',()=>{const m=new PoseInput();expect(m.update(body(true),0).calibrated).toBe(false);m.reset();calibrate(m);expect(m.stage).toBe('ready');expect(m.selected).toBe('left');expect(m.history.at(-1)?.paddleX).toBeCloseTo(0);});
 it('does not accept an intermittent raised wrist',()=>{const m=new PoseInput();for(let t=0;t<=500;t+=50)m.update(body(),t);m.update(body(true),550);m.update(body(),650);m.update(body(true),1000);expect(m.selected).toBe(null);});
 it('mirrors movement right and remains invariant to camera translation and scale',()=>{const a=new PoseInput(),b=new PoseInput();calibrate(a);calibrate(b);const p=body();p[15].x-=.05;const r=a.update(p,2150);const transformed=p.map(v=>({...v,x:v.x*.7+.1,y:v.y*.7+.1}));const s=b.update(transformed,2150);expect(r.input.x).toBeGreaterThan(0);expect(s.input.x).toBeCloseTo(r.input.x);expect(s.input.y).toBeCloseTo(r.input.y);});
 it('expires samples and resets calibration explicitly',()=>{const m=new PoseInput();calibrate(m);for(let t=2150;t<=3200;t+=50)m.update(body(),t);expect(m.history.every(p=>p.time>=2500)).toBe(true);m.reset();expect(m.history).toHaveLength(0);expect(m.stage).toBe('body');});
 it('calibrates from a laptop webcam crop with the hips out of frame',()=>{
  // Sitting at a desk, MediaPipe still reports hip landmarks but with low visibility.
  const crop=(raised=false)=>body(raised).map((p,i)=>i===23||i===24?{...p,visibility:.05}:p);
  const m=new PoseInput();
  for(let t=0;t<=500;t+=50)m.update(crop(),t);
  for(let t=550;t<=1050;t+=50)m.update(crop(true),t);
  for(let t=1100;t<=2100;t+=50)m.update(crop(),t);
  expect(m.stage).toBe('ready');expect(m.selected).toBe('left');
 });
 it('still refuses a body it cannot see the shoulders of',()=>{
  const m=new PoseInput();
  const noShoulders=body().map((p,i)=>i===11||i===12?{...p,visibility:.05}:p);
  for(let t=0;t<=1200;t+=50)m.update(noShoulders,t);
  expect(m.stage).toBe('body');
 });
 it('calculates a straight elbow',()=>expect(elbowAngle({x:0,y:0},{x:1,y:0},{x:2,y:0})).toBeCloseTo(180));
});
const sample=(sequence:number,time:number,x:number,speed:number):PoseSample=>({sequence,time,wristX:x,wristY:0,paddleX:0,paddleY:1.5,wristVX:speed,wristVY:0,wristSpeed:speed,elbowAngle:130,shoulderWidth:.2,confidence:1});
describe('sequence associated form',()=>{
 it('scores purposeful continuation higher than a stationary center hit',()=>{const hit={hitId:'a',inputSequence:2,accuracy:1};const moving=[sample(1,0,0,2),sample(2,100,.3,3),sample(3,260,.6,2)];const still=[sample(1,0,0,0),sample(2,100,0,0),sample(3,260,0,0)];expect(scoreForm(hit,moving)?.score).toBe(100);expect(scoreForm(hit,still)?.score).toBe(45);});
 it('rejects missing input history',()=>expect(scoreForm({hitId:'a',inputSequence:99,accuracy:1},[])).toBe(null));
});
