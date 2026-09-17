import {afterEach,describe,expect,it,vi} from 'vitest';
import {Tracking} from '../apps/client/src/tracking';
import type {Network} from '../apps/client/src/network';
afterEach(()=>vi.unstubAllGlobals());
function fixture(){const track={stop:vi.fn(),onended:null},stream={getTracks:()=>[track],getVideoTracks:()=>[track]},media=vi.fn(async()=>stream);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:media}});const video={srcObject:null,play:vi.fn(async()=>{})};const network={connected:true,keyboard:vi.fn(async()=>{}),api:vi.fn(async()=>{throw new Error('provider unavailable');})};return{track,stream,media,video,network,tracking:new Tracking(video as unknown as HTMLVideoElement,network as unknown as Network)};}
describe('camera capture lifecycle',()=>{
 it('stops capture when cloud startup fails and offers an actionable error',async()=>{const f=fixture();await f.tracking.start();expect(f.track.stop).toHaveBeenCalledOnce();expect(f.video.srcObject).toBeNull();expect(f.tracking.error).toBe(true);expect(f.tracking.status).toBe('provider unavailable');});
 it('does not capture twice when two starts overlap during keyboard acknowledgement',async()=>{const f=fixture();let ack!:()=>void;f.network.keyboard.mockImplementationOnce(()=>new Promise<void>(r=>{ack=r;}));const first=f.tracking.start();const second=f.tracking.start();ack();await Promise.all([first,second]);expect(f.media).toHaveBeenCalledOnce();expect(f.track.stop).toHaveBeenCalledOnce();});
 it('stops a late camera grant after leaving without contacting the provider',async()=>{const f=fixture();let grant!:(s:typeof f.stream)=>void;f.media.mockImplementationOnce(()=>new Promise(r=>{grant=r;}));const started=f.tracking.start();await vi.waitFor(()=>expect(grant).toBeTypeOf('function'));await f.tracking.stop();grant(f.stream);await started;expect(f.track.stop).toHaveBeenCalledOnce();expect(f.network.api).not.toHaveBeenCalled();});
});
