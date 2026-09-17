import {it,expect} from 'vitest';
import {Rooms} from '../apps/server/src/rooms';
import {recoveryState} from '../apps/client/src/recovery';
import type {Snapshot} from '../packages/shared/src/protocol';
function match(){const rooms=new Rooms(),room=rooms.create('a','a');rooms.join(room.code,'b','b');for(let i=0;i<2;i++)rooms.input(room,i,{keys:[],ready:true,sequence:1});rooms.tick(room,3.1);return{rooms,room};}
it('retains camera calibration and resumes with countdown after a brief disconnect',()=>{
 const {rooms,room}=match(),p=room.players[0]!;p.camera=true;p.pose.stage='ready';p.pose.selected='left';p.input.x=.8;
 rooms.disconnect(room,0);const joined=rooms.join(room.code,'a','new');const restored=joined.room.players[0]!;
 expect(restored.pose).toBe(p.pose);expect(restored.pose.stage).toBe('ready');expect(restored.camera).toBe(true);expect(restored.input.x).toBe(.8);
 rooms.input(room,0,{keys:[],ready:true,sequence:1});rooms.tick(room,.01);expect(room.phase).toBe('countdown');expect(room.countdown).toBeGreaterThan(2.9);
});
it('does not automatically resume an intentional pause after reconnect',()=>{
 const {rooms,room}=match();room.phase='paused';room.pauseCause='manual';rooms.disconnect(room,0);rooms.join(room.code,'a','new');rooms.input(room,0,{keys:[],ready:true,sequence:1});rooms.tick(room,.01);expect(room.phase).toBe('paused');expect(rooms.resume(room)).toBe(true);
});
it('requires initial camera calibration before starting a new game',()=>{
 const rooms=new Rooms(),room=rooms.create('a','a');rooms.join(room.code,'b','b');rooms.setCamera(room,0,true);for(let i=0;i<2;i++)rooms.input(room,i,{keys:[],ready:true,sequence:1});rooms.tick(room,.1);expect(room.phase).toBe('lobby');
});
it('shows who needs recovery and enables Resume only for a ready intentional pause',()=>{
 const {rooms,room}=match();room.phase='paused';room.pauseCause='manual';let snapshot=rooms.snapshot(room) as Snapshot;
 expect(recoveryState(false,false,false,snapshot,0).title).toBe('Reconnecting you…');expect(recoveryState(true,false,true,snapshot,0).resume).toBe(false);
 expect(recoveryState(true,true,false,snapshot,0).title).toBe('This room is unavailable');
 expect(recoveryState(true,false,false,snapshot,0).resume).toBe(true);
 rooms.disconnect(room,1);snapshot=rooms.snapshot(room) as Snapshot;expect(recoveryState(true,false,false,snapshot,0).title).toBe('Waiting for your friend…');expect(recoveryState(true,false,false,snapshot,0).resume).toBe(false);
});
