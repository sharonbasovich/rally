import {expect,type Browser} from '@playwright/test';
export async function multiplayer(browser:Browser,baseURL:string){
 const a=await browser.newContext({viewport:{width:800,height:600}}),b=await browser.newContext({viewport:{width:800,height:600}});
 try{
  const first=await a.newPage(),second=await b.newPage(),errors:string[]=[];
  const states:any[]=[null,null];
  for(const [i,page] of [first,second].entries()){
   page.on('pageerror',e=>errors.push(e.message));
   page.on('websocket',socket=>socket.on('framereceived',({payload})=>{
    if(typeof payload!=='string'||!payload.startsWith('42'))return;
    try{const [event,data]=JSON.parse(payload.slice(2));if(event==='snapshot')states[i]=data;}catch{}
   }));
  }
  await first.goto(baseURL);
  await first.getByRole('button',{name:'Play together'}).click();
  await expect(first.locator('#server-address')).toHaveCount(0);
  await first.getByRole('button',{name:'Create a room'}).click();
  const link=await first.locator('#share-address').getAttribute('href');
  expect(link).toMatch(/room=[A-F0-9]{6}/);
  await first.getByRole('button',{name:'Use keyboard instead'}).click();
  await second.goto(link!);
  await second.getByRole('button',{name:'Join room',exact:true}).click();
  await second.getByRole('button',{name:'Use keyboard instead'}).click();
  await first.locator('#ready-button').click();
  await second.locator('#ready-button').click();
  await expect(first.locator('.game-screen')).toBeVisible();
  await expect(second.locator('.game-screen')).toBeVisible();
  try{await expect.poll(()=>states.every(s=>s?.phase==='playing'),{timeout:15000}).toBe(true);}catch(error){console.log('Resume states:',states.map(s=>s&&({phase:s.phase,players:s.players,reason:s.reason})));throw error;}
  const before=states[0].game.rackets[0].x;
  await first.keyboard.down('d');
  await expect.poll(()=>states[0]?.game.rackets[0].x,{timeout:5000}).toBeGreaterThan(before+.1);
  await first.keyboard.up('d');
  await first.getByRole('button',{name:'Pause game'}).click();
  await expect.poll(()=>states.every(s=>s?.phase==='paused')).toBe(true);
  expect(states[0].game.points).toEqual(states[1].game.points);
  await b.setOffline(true);
  await expect(second.locator('body')).toHaveAttribute('data-connected','false',{timeout:15000});
  await b.setOffline(false);
  await expect(second.locator('body')).toHaveAttribute('data-connected','true',{timeout:15000});
  await expect(second.locator('#setup-keyboard')).toHaveCount(0);
  await expect(second.locator('#resume')).toBeVisible({timeout:15000});
  await second.locator('#resume').click();
  try{await expect.poll(()=>states.every(s=>s?.phase==='playing'),{timeout:15000}).toBe(true);}catch(error){console.log('Resume states:',states.map(s=>s&&({phase:s.phase,players:s.players,reason:s.reason})));throw error;}
  await b.setOffline(true);
  await expect(second.locator('body')).toHaveAttribute('data-connected','false',{timeout:15000});
  await expect(first.locator('#pause-title')).toHaveText(/Waiting for your friend/,{timeout:15000});
  await b.setOffline(false);
  await expect.poll(()=>states.every(s=>s?.phase==='playing'),{timeout:20000}).toBe(true);
  await expect(second.locator('#setup-keyboard')).toHaveCount(0);
  expect(errors).toEqual([]);
 }finally{await a.close();await b.close();}
}
export async function practice(browser:Browser,baseURL:string){
 const context=await browser.newContext();try{const page=await context.newPage();const resources:string[]=[];page.on('request',r=>resources.push(r.url()));await page.goto(baseURL);await page.getByRole('button',{name:'Try without camera'}).click();await expect(page.locator('.game-screen')).toBeVisible();await expect(page.locator('#overlay')).not.toHaveClass(/visible/,{timeout:10000});expect(resources.some(r=>/mediapipe|\.task|\.wasm|tracking.worker/.test(r))).toBe(false);await page.getByRole('button',{name:'Rally home'}).click();await page.getByRole('button',{name:'Two players, one keyboard'}).click();await expect(page.locator('.game-screen')).toBeVisible();await expect(page.locator('.control-player.right')).toContainText('Enter');}finally{await context.close();}
}
export async function unavailableCamera(browser:Browser,baseURL:string){
 const context=await browser.newContext({permissions:['camera']});await context.route('**/*.task',route=>route.abort());try{const page=await context.newPage();await page.goto(baseURL);await page.getByRole('button',{name:'Play together'}).click();await page.getByRole('button',{name:'Create a room'}).click();await page.locator('#retry').click();await expect(page.locator('#camera-status')).toContainText(/could not start|could not load|declined/,{timeout:10000});await page.getByRole('button',{name:'Use keyboard instead'}).click();await expect(page.locator('#ready-button')).toBeEnabled();expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.srcObject)).toBeNull();}finally{await context.close();}
}
