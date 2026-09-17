import type {Game} from './engine';
export type GameState=Pick<Game,'points'|'winner'|'score'|'rally'|'best'|'collected'|'time'|'elapsed'|'serve'|'ended'|'rackets'|'balls'|'boxes'|'playerEffects'|'playerStats'|'shake'|'reveal'|'popups'|'particles'>;
export interface Snapshot {code:string;mode:'multiplayer'|'practice'|'duo';phase:'lobby'|'countdown'|'playing'|'paused'|'results';countdown:number;reason:string;players:{side:number;connected:boolean;ready:boolean;replay:boolean}[];game:GameState;serverTime:number}
export interface InputPacket {keys:string[];ready:boolean;sequence:number}
