import {test,expect} from '@playwright/test';
import {multiplayer,practice} from '../browser/scenarios';

test('public hosted practice',async({browser,baseURL})=>practice(browser,baseURL!));
test('public multiplayer and reconnect',async({browser,baseURL})=>multiplayer(browser,baseURL!));
test('Roboflow receives synthetic video through TURN and returns cloud poses',async({browser,baseURL})=>{
 test.skip(process.env.RALLY_TEST_CAMERA!=='1','Explicitly opt in to consuming Roboflow credits.');
 const context=await browser.newContext({permissions:['camera']});
 try{
  await context.addInitScript(()=>{
   const Original=window.RTCPeerConnection;
   (window as any).__rallyTestPeers=[];
   window.RTCPeerConnection=class extends Original{
    constructor(config?:RTCConfiguration){super({...config,iceTransportPolicy:'relay'});(window as any).__rallyTestPeers.push(this);}
   };
  });
  const page=await context.newPage();let poses=0;
  page.on('websocket',socket=>socket.on('framereceived',({payload})=>{
   if(typeof payload==='string'&&payload.startsWith('42')){try{if(JSON.parse(payload.slice(2))[0]==='pose')poses++;}catch{}}
  }));
  await page.goto(baseURL!);
  await page.getByRole('button',{name:'Play together'}).click();
  await page.getByRole('button',{name:'Create a room'}).click();
  const prepared=page.waitForResponse(r=>r.url().endsWith('/api/vision/prepare'));
  await page.locator('#retry').click();
  const prepare=await prepared;
  expect(prepare.status(),await prepare.text()).toBe(200);
  await expect.poll(()=>poses,{timeout:90000,message:'Cloud inference must deliver fresh pose callbacks'}).toBeGreaterThan(3);
  const relay=await page.evaluate(async()=>{
   const peers=(window as any).__rallyTestPeers as RTCPeerConnection[];
   for(const pc of peers){
    const stats=await pc.getStats();let selected:any;
    stats.forEach(s=>{if(s.type==='transport'&&s.selectedCandidatePairId)selected=stats.get(s.selectedCandidatePairId);});
    if(selected&&stats.get(selected.localCandidateId)?.candidateType==='relay')return true;
   }
   return false;
  });
  expect(relay,'The camera must work through the managed TURN relay').toBe(true);
  const stopped=page.waitForResponse(r=>r.url().endsWith('/api/vision/stop'));
  await page.getByRole('button',{name:'Use keyboard instead'}).click();
  expect((await stopped).status()).toBe(204);
  await expect(page.locator('#ready-button')).toBeEnabled();
 }finally{await context.close();}
});
