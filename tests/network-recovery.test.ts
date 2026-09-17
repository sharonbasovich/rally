import {afterEach,expect,it,vi} from 'vitest';
import {io} from 'socket.io-client';
import {Network} from '../apps/client/src/network';
vi.mock('socket.io-client',()=>({io:vi.fn()}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(){
 vi.useFakeTimers();vi.stubGlobal('sessionStorage',{getItem:()=> 'issued-session',setItem:()=>{},removeItem:()=>{}});
 const listeners=new Map<string,Array<{once:boolean;fn:(...a:any[])=>void}>>();
 const dispatch=(event:string,...args:any[])=>{const handlers=listeners.get(event)??[];listeners.set(event,handlers.filter(h=>!h.once));for(const h of handlers)h.fn(...args);};
 const socket={
  on:vi.fn((event:string,fn:(...a:any[])=>void)=>{listeners.set(event,[...(listeners.get(event)??[]),{fn,once:false}]);}),
  once:vi.fn((event:string,fn:(...a:any[])=>void)=>{listeners.set(event,[...(listeners.get(event)??[]),{fn,once:true}]);}),
  connect:vi.fn(()=>dispatch('connect')),disconnect:vi.fn(),removeAllListeners:vi.fn(()=>listeners.clear()),
  emit:vi.fn((event:string,_data:unknown,reply?:(r:unknown)=>void)=>{if(event==='create')reply?.({code:'ABC123',side:0,mode:'multiplayer'});}),
 };
 vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>);
 return {socket,dispatch,network:new Network()};
}
it('retries seat recovery if the previous transport has not timed out yet',async()=>{
 const f=fixture();await f.network.connect('','create');
 f.dispatch('disconnect');f.dispatch('connect_error',new Error('Session already connected.'));
 // The retry must be delayed, rather than hammering the auth endpoint.
 expect(f.socket.connect).toHaveBeenCalledTimes(1);
 f.socket.connect.mockImplementation(()=>{});
 await vi.advanceTimersByTimeAsync(2000);
 expect(f.socket.connect).toHaveBeenCalledTimes(2);f.network.close();
});
it('does not reconnect after the player leaves during the recovery delay',async()=>{
 const f=fixture();await f.network.connect('','create');
 f.dispatch('connect_error',new Error('Session already connected.'));f.network.close();
 await vi.advanceTimersByTimeAsync(3000);expect(f.socket.connect).toHaveBeenCalledTimes(1);
});
