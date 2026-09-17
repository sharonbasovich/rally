import express from 'express';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Server} from 'socket.io';
import {CONFIG} from '@rally/shared';
import {Rooms,type Room,type Mode} from './rooms';
import {Roboflow,landmarks,type VisionConfig} from './roboflow';

export interface AppOptions {origin:string;production?:boolean;vision?:Roboflow;maxRooms?:number}
export function createApplication(options:AppOptions){
 const app=express(),http=createServer(app),rooms=new Rooms(options.maxRooms??100);
 const config:VisionConfig={origin:options.origin,apiKey:process.env.ROBOFLOW_API_KEY??'',model:process.env.ROBOFLOW_MODEL_ID??'yolov8n-pose-640',maxStreams:Number(process.env.MAX_CAMERA_STREAMS??4),region:process.env.ROBOFLOW_REGION??'us'};
 const vision=options.vision??new Roboflow(config);
 const sessions=new Map<string,number>(),membership=new Map<string,{room:Room;side:number}>(),owners=new Map<string,string>();
 const budgets=new Map<string,{count:number;reset:number}>();
 const limit=(key:string,max:number,window=60000)=>{const now=Date.now();let b=budgets.get(key);if(!b||now>b.reset){b={count:0,reset:now+window};budgets.set(key,b);}return ++b.count<=max;};
 const originAllowed=(origin:string|undefined)=>origin===options.origin||(!options.production&&!origin);
 app.disable('x-powered-by');if(options.production)app.set('trust proxy',1);
 app.use((_req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(self), microphone=()'});if(options.production)res.set('Strict-Transport-Security','max-age=31536000');next();});
 app.use('/api',express.json({limit:'64kb'}),(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/health',(_req,res)=>res.json({ok:true}));
 app.post('/api/session',(req,res)=>{
  if(!originAllowed(req.headers.origin)){res.sendStatus(403);return;}
  if(!limit(`session:${req.ip}`,30)||sessions.size>=2000){res.status(429).json({error:'Please wait a minute before reconnecting.'});return;}
  const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+86400000);res.json({token,cameraAvailable:vision.enabled});
 });
 const bearer=(value:unknown)=>typeof value==='string'&&value.startsWith('Bearer ')?value.slice(7):'';
 app.post('/api/vision/results',(req,res)=>{
  const lease=vision.authenticate(bearer(req.headers.authorization));if(!lease){res.sendStatus(401);return;}
  const socketId=owners.get(lease.owner),m=socketId?membership.get(socketId):null;if(!m){res.sendStatus(410);return;}
  const body=req.body;const raw=typeof body?.timestamp==='string'?body.timestamp:'';
  const time=Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(raw)?raw:`${raw}Z`),now=Date.now();
  if(!Number.isSafeInteger(body?.frame)||body.frame<=lease.lastFrame||!Number.isFinite(time)||time<=lease.lastTimestamp||time>now+250||now-time>500){res.sendStatus(202);return;}
  try{const points=landmarks(body.predictions);lease.lastFrame=body.frame;lease.lastTimestamp=time;const result=rooms.pose(m.room,m.side,points,time);if(result)io.to(socketId!).volatile.emit('pose',{result,age:Math.max(0,now-time)});res.sendStatus(204);}catch{res.sendStatus(400);}
 });
 app.use('/api/vision',(req,res,next)=>{
  const token=bearer(req.headers.authorization),expires=sessions.get(token),socket=owners.get(token);
  if(!originAllowed(req.headers.origin)||!expires||expires<Date.now()||!socket||!membership.has(socket)){res.status(401).json({error:'Reconnect to your room to use the camera.'});return;}
  res.locals.token=token;res.locals.member=membership.get(socket);next();
 });
 app.post('/api/vision/prepare',async(req,res)=>{
  const token=res.locals.token as string,m=res.locals.member as {room:Room;side:number};
  if(!limit(`camera:${token}`,6,60000)||!limit(`camera-ip:${req.ip}`,12,60000)){res.status(429).json({error:'Please wait a minute before restarting the camera.'});return;}
  let id='';try{const lease=vision.reserve(token);id=lease.id;rooms.setCamera(m.room,m.side,true);const iceServers=await vision.iceServers();if(lease.closed)throw new Error('Camera session cancelled.');res.json({id,iceServers});}
  catch(error){if(id)await vision.stop(id);res.status(503).json({error:(error as Error).message});}
 });
 app.post('/api/vision/start',async(req,res)=>{
  const lease=vision.leases.get(req.body?.id);if(!lease||lease.owner!==res.locals.token||lease.pipelineId||!limit(`start:${lease.id}`,1,900000)){res.sendStatus(409);return;}
  const offer=req.body?.offer;if(offer?.type!=='offer'||typeof offer.sdp!=='string'||offer.sdp.length>60000||!offer.sdp.startsWith('v=0')){res.status(400).json({error:'Invalid camera connection.'});return;}
  try{res.json(await vision.start(lease,{type:'offer',sdp:offer.sdp}));}catch(error){res.status(503).json({error:(error as Error).message});}
 });
 app.post('/api/vision/stop',async(req,res)=>{const lease=vision.leases.get(req.body?.id);if(lease&&lease.owner===res.locals.token){await vision.stop(lease.id);if(![...vision.leases.values()].some(l=>l.owner===lease.owner)){const m=res.locals.member;rooms.setCamera(m.room,m.side,false);}}res.sendStatus(204);});
 const io=new Server(http,{maxHttpBufferSize:8192,allowRequest:(req,callback)=>callback(null,originAllowed(req.headers.origin)),cors:{origin:options.origin,methods:['GET','POST']}});
 io.use((socket,next)=>{const token=socket.handshake.auth?.token,expiry=sessions.get(token);if(typeof token!=='string'||!expiry||expiry<Date.now())return next(new Error('Session expired. Reload to reconnect.'));if(owners.has(token))return next(new Error('Session already connected.'));owners.set(token,socket.id);next();});
 io.on('connection',socket=>{
  const token=socket.handshake.auth.token as string;
  socket.use(([event],next)=>{if(!limit(`events:${socket.id}`,100,1000)){socket.disconnect(true);return;}if(['create','join'].includes(event)&&!limit(`join:${token}`,12)){socket.emit('room-error','Too many attempts. Please wait a minute.');next(new Error('Rate limited'));return;}next();});
  const join=(kind:'create'|'join',data:{code?:unknown;mode?:unknown},reply:(r:unknown)=>void)=>{
   if(typeof reply!=='function')return;if(membership.has(socket.id)){reply({error:'Leave your current room first.'});return;}
   if(!limit(`rooms:${socket.handshake.address}`,30)){reply({error:'Please wait a minute before opening another court.'});return;}
   try{const mode:Mode=data?.mode==='practice'||data?.mode==='duo'?data.mode:'multiplayer';const m=kind==='create'?{room:rooms.create(token,socket.id,mode),side:0}:rooms.join(String(data?.code??'').slice(0,6),token,socket.id);
    membership.set(socket.id,m);socket.join(m.room.code);reply({code:m.room.code,side:m.side,mode:m.room.mode});io.to(m.room.code).emit('snapshot',rooms.snapshot(m.room));
   }catch(e){reply({error:(e as Error).message});}
  };
  socket.on('create',(data,reply)=>join('create',data,reply));socket.on('join',(data,reply)=>join('join',data,reply));
  socket.on('input',data=>{const m=membership.get(socket.id);if(m)rooms.input(m.room,m.side,data);});
  socket.on('keyboard',(reply)=>{const m=membership.get(socket.id);if(m){void vision.stopOwner(token);rooms.setCamera(m.room,m.side,false);}if(typeof reply==='function')reply();});
  socket.on('latency',(timestamp,reply)=>{if(typeof reply==='function')reply(timestamp);});
  socket.on('pause',()=>{const m=membership.get(socket.id);if(m&&['playing','countdown'].includes(m.room.phase)){m.room.phase='paused';m.room.reason='Time out. Resume when both players are ready.';}});
  socket.on('resume',()=>{const m=membership.get(socket.id);if(m)rooms.resume(m.room);});
  socket.on('replay',()=>{const m=membership.get(socket.id);if(m)rooms.replay(m.room,m.side);});
  socket.on('leave',()=>{const m=membership.get(socket.id);void vision.stopOwner(token);if(m){rooms.leave(m.room,m.side);socket.leave(m.room.code);membership.delete(socket.id);}});
  socket.on('disconnect',()=>{owners.delete(token);void vision.stopOwner(token);const m=membership.get(socket.id);if(m){rooms.disconnect(m.room,m.side);membership.delete(socket.id);}});
 });
 app.use(express.static(fileURLToPath(new URL('../../client/dist/',import.meta.url)),{index:'index.html'}));
 app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(400).json({error:'Invalid request.'});});
 let previous=performance.now(),accumulator=0,broadcast=0;
 const tick=setInterval(()=>{const now=performance.now();accumulator+=Math.min(.1,(now-previous)/1000);previous=now;
  while(accumulator>=1/CONFIG.PHYSICS_HZ){for(const room of rooms.rooms.values())rooms.tick(room,1/CONFIG.PHYSICS_HZ);accumulator-=1/CONFIG.PHYSICS_HZ;}
  if(now-broadcast>=1000/30){for(const room of rooms.rooms.values()){if(room.game.events.length)io.to(room.code).emit('events',room.game.events);io.to(room.code).volatile.emit('snapshot',rooms.snapshot(room));room.game.events=[];}broadcast=now;}
 },8);
 const cleanup=setInterval(()=>{const now=Date.now();rooms.expire(now);for(const [key,b] of budgets)if(b.reset<now)budgets.delete(key);for(const [token,expires] of sessions)if(expires<now&&!owners.has(token))sessions.delete(token);void vision.sweep(now);},10000);
 async function close(){clearInterval(tick);clearInterval(cleanup);await Promise.all([...vision.leases.keys()].map(id=>vision.stop(id)));await new Promise<void>(resolve=>io.close(()=>resolve()));}
 return {app,http,io,rooms,vision,close};
}
