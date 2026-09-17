import {test,expect} from '@playwright/test';

test('tracking loss stays in game and network recovery keeps the camera and calibration',async({browser,baseURL},testInfo)=>{
 const camera=await browser.newContext({permissions:['camera'],viewport:{width:1100,height:750}}),partner=await browser.newContext({viewport:{width:800,height:600}});
 try{
  // Deterministic landmarks exercise calibration and occlusion. The separate
  // local-tracking test covers the real WASM model with synthetic camera video.
  await camera.addInitScript(()=>{
   (window as any).hideHand=false;(window as any).workersStarted=0;
   window.Worker=class {
    onmessage:((event:any)=>void)|null=null;onerror:any;started=0;stopped=false;
    constructor(){(window as any).workersStarted++;}
    postMessage(data:any){
     if(data.type==='init'){this.started=performance.now();queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));return;}
     if(data.type!=='frame'||this.stopped)return;data.bitmap.close();const elapsed=performance.now()-this.started;
     const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
     p[11]={x:.4,y:.3,visibility:1};p[12]={x:.6,y:.3,visibility:1};p[23]={x:.43,y:.65,visibility:1};p[24]={x:.57,y:.65,visibility:1};p[13]={x:.35,y:.4,visibility:1};p[15]={x:.3,y:elapsed>1000&&elapsed<2500?.2:.48,visibility:1};p[16]={x:.7,y:.48,visibility:1};
     queueMicrotask(()=>{if(!this.stopped)this.onmessage?.({data:{type:'pose',timestamp:data.timestamp,landmarks:(window as any).hideHand?[]:p}});});
    }
    terminate(){this.stopped=true;}
   } as any;
  });
  const first=await camera.newPage(),second=await partner.newPage();let state:any;
  first.on('websocket',s=>s.on('framereceived',({payload})=>{if(typeof payload==='string'&&payload.startsWith('42["snapshot"'))state=JSON.parse(payload.slice(2))[1];}));
  await first.goto(baseURL!);await first.getByRole('button',{name:'Play together'}).click();await first.getByRole('button',{name:'Create a room'}).click();
  const link=await first.locator('#share-address').getAttribute('href');await first.locator('#retry').click();
  await second.goto(link!);await second.getByRole('button',{name:'Join room',exact:true}).click();await second.locator('#setup-keyboard').click();await second.locator('#ready-button').click();
  await expect(first.locator('#ready-button')).toBeEnabled({timeout:20000});await first.locator('#ready-button').click();
  await expect.poll(()=>state?.phase,{timeout:15000}).toBe('playing');
  const trackId=await first.locator('video').evaluate((v:HTMLVideoElement)=>(v.srcObject as MediaStream).getVideoTracks()[0].id);
  await first.evaluate(()=>{(window as any).hideHand=true;});
  await expect(first.locator('#tracking-title')).toHaveText('HAND OUT OF VIEW');await expect(first.locator('#tracking-feedback')).toBeVisible();
  const elapsed=state.game.elapsed;await expect.poll(()=>state?.game.elapsed,{timeout:6000}).toBeGreaterThan(elapsed+2);expect(state.phase).toBe('playing');await expect(first.locator('#overlay')).not.toHaveClass(/visible/);
  await first.screenshot({path:testInfo.outputPath('tracking-warning.png')});
  await first.evaluate(()=>{(window as any).hideHand=false;});await expect(first.locator('#tracking-feedback')).toBeHidden();
  await camera.setOffline(true);await expect(first.locator('body')).toHaveAttribute('data-connected','false',{timeout:15000});
  await expect(first.locator('#pause-title')).toHaveText('Reconnecting you…');await expect(second.locator('#pause-title')).toHaveText('Waiting for your friend…',{timeout:15000});
  await camera.setOffline(false);await expect.poll(()=>state?.phase,{timeout:20000}).toBe('playing');
  await expect(first.locator('#ready-button')).toHaveCount(0);await expect(first.locator('#tracking-feedback')).toBeHidden();
  expect(await first.locator('video').evaluate((v:HTMLVideoElement)=>(v.srcObject as MediaStream).getVideoTracks()[0].id)).toBe(trackId);
  expect(await first.evaluate(()=>(window as any).workersStarted)).toBe(1);
 }finally{await camera.close();await partner.close();}
});
