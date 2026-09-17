const origin=process.env.RALLY_LIVE_URL,expected=process.env.RALLY_EXPECTED_SHA;
if(!origin||!expected)throw new Error('A deployment origin and expected commit are required.');
const deadline=Date.now()+240000;
while(Date.now()<deadline){
 try{
  const response=await fetch(new URL('/health',origin),{signal:AbortSignal.timeout(5000),cache:'no-store'});
  const health=await response.json();
  if(response.ok&&health.ok&&health.version===expected){console.log('Verified deployed commit:',expected);process.exit(0);}
 }catch{}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
throw new Error('The expected release did not become ready; live camera tests were not started.');
