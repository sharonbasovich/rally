import {test,expect} from '@playwright/test';

test('real browser worker processes synthetic video without cloud inference',async({browser,baseURL})=>{
 const context=await browser.newContext({permissions:['camera'],viewport:{width:800,height:600}});
 try{
  const page=await context.newPage(),requests:string[]=[],errors:string[]=[];let frames=0;
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',s=>s.on('framesent',({payload})=>{if(typeof payload==='string'&&payload.includes('"browser-pose"'))frames++;}));
  await page.goto(baseURL!);await page.getByRole('button',{name:'Play together'}).click();await page.getByRole('button',{name:'Create a room'}).click();
  await page.locator('#retry').click();
  await expect.poll(()=>frames,{timeout:45000,message:'The actual WASM worker must process camera frames'}).toBeGreaterThan(3);
  expect(requests.some(r=>r.includes('pose_landmarker_lite.task'))).toBe(true);
  expect(requests.some(r=>/roboflow|\/api\/vision\//.test(r))).toBe(false);
  await page.getByRole('button',{name:'Use keyboard instead'}).click();await expect(page.locator('#ready-button')).toBeEnabled();
  expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.srcObject)).toBeNull();expect(errors).toEqual([]);
 }finally{await context.close();}
});
