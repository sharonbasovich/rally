import {it,expect} from 'vitest';
import {io} from 'socket.io-client';
import {createApplication} from '../apps/server/src/app';
import {Rooms} from '../apps/server/src/rooms';

it('validates browser landmarks, rejects replay, and ignores poses after keyboard switch',async()=>{
 const app=createApplication({origin:'http://localhost'});await new Promise<void>(r=>app.http.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${(app.http.address() as {port:number}).port}`;
 const {token}=await (await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
 const socket=io(base,{auth:{token},transports:['websocket'],reconnection:false});
 try{
  await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  const {code}=await socket.emitWithAck('create',{});expect(await socket.emitWithAck('browser-camera')).toEqual({ok:true});
  const p=app.rooms.rooms.get(code)!.players[0]!;
  const send=async(data:unknown)=>{socket.emit('browser-pose',data);await socket.emitWithAck('latency',0);};
  await send({sequence:1,age:10,points:[]});expect(p.result).not.toBeNull();const result=p.result;
  await send({sequence:1,age:10,points:[]});expect(p.result).toBe(result);
  await send({sequence:2,age:10,points:Array(33).fill({x:99,y:0,visibility:1})});expect(p.result).toBe(result);
  await send({sequence:2,age:900,points:[]});expect(p.result).toBe(result);
  await send({sequence:2,age:10,points:[]});expect(p.result).not.toBe(result);
  await socket.emitWithAck('keyboard');await send({sequence:3,age:10,points:[]});expect(p.camera).toBe(false);expect(p.result).toBeNull();
 }finally{socket.disconnect();await app.close();}
});

it('holds position through brief occlusion without replaying a swing, without pausing play',()=>{
 const rooms=new Rooms(),room=rooms.create('a','a');rooms.join(room.code,'b','b');const now=Date.now();
 room.players.forEach(p=>{p!.ready=true;p!.lastInput=now;});const p=room.players[0]!;p.camera=true;p.poseAt=now;p.input={...p.input,x:.7,swing:1,speed:3};room.phase='playing';
 rooms.pose(room,0,[],now+100);rooms.tick(room,.008,now+600);expect(room.phase).toBe('playing');expect(p.input.x).toBe(.7);expect(p.input.swing).toBe(0);
 rooms.tick(room,.008,now+1600);expect(room.phase).toBe('playing');expect(p.input.swing).toBe(0);
 rooms.tick(room,.008,now+5100);expect(room.phase).toBe('paused');expect(room.pauseCause).toBe('connection');
});
