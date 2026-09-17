import {CONFIG,neutralInput} from '@rally/shared';
import type {GameState} from '@rally/shared/protocol';
export {CONFIG,POWER,TABLE_Y,GRAVITY,clamp,neutralInput} from '@rally/shared';
export type {Power,RacketInput,GameEvent,Vec3} from '@rally/shared';
/** Render-only state. No collision detection, scoring, AI, or game clock runs here. */
export class Game implements GameState {
 points:[number,number]=[0,0];winner:number|null=null;score=0;rally=0;best=0;collected=0;time=0;elapsed=0;serve=0;ended=false;
 rackets:GameState['rackets']=neutralInput().map((p,i)=>({...p,z:(i===0?1:-1)*CONFIG.HIT_PLANE_Z,impact:0,vx:0,vy:0}));
 balls:GameState['balls']=[];boxes:GameState['boxes']=[];playerEffects:GameState['playerEffects']=[{},{}];
 playerStats:GameState['playerStats']=[0,1].map(()=>({meter:0,perfect:0,great:0,quality:0,lastGrade:null,gradeLife:0,powerCount:0}));
 particles:GameState['particles']=[];popups:GameState['popups']=[];shake=0;reveal=0;
 get radius(){return CONFIG.BALL_RADIUS*(this.playerEffects.some(e=>e.giant)?CONFIG.GIANT_BALL_MULTIPLIER:1);}
 racketScaleFor(side:number){return this.playerEffects[side].mega?CONFIG.BIG_RACKET_MULTIPLIER:1;}
}
