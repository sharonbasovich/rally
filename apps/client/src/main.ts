import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import './style.css';
import {Game,POWER,neutralInput,type Power,type RacketInput,type GameEvent} from './engine';
import {Renderer} from './renderer';
import {KeyboardInput} from './input';
import {Tracking} from './tracking';
import {Sound} from './audio';
import {Network,type Snapshot} from './network';
import {CONFIG} from '@rally/shared/config';

const paths:Record<string,string>={sound:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',mute:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',full:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',pause:'<path d="M8 5v14M16 5v14"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',camera:'<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',keyboard:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 16h10"/>',back:'<path d="m12 5-7 7 7 7m-7-7h15"/>',players:'<circle cx="8" cy="7" r="3"/><path d="M2 21v-3a6 6 0 0 1 12 0v3m3-16a3 3 0 0 1 0 6m0 4a5 5 0 0 1 5 5"/>',spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>'};
const icon=(n:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]??''}</svg>`;
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header class="topbar"><button class="wordmark" id="home" aria-label="Rally home">rally<span>!</span><i></i></button><div class="header-note">A LITTLE MOVEMENT. A LOT OF FUN.</div><div class="header-actions"><button class="icon-button" id="pause" aria-label="Pause game" hidden>${icon('pause')}</button><button class="icon-button" id="sound" aria-label="Mute sound" title="Mute sound">${icon('sound')}</button><button class="icon-button" id="fullscreen" aria-label="Enter fullscreen" title="Fullscreen">${icon('full')}</button></div></header><main id="screen"></main><footer class="site-footer"><span>Everybody’s got game.</span><span>Rally together. From your side of the table. <span class="footer-spark">✳</span></span></footer><div id="announcement" class="sr-only" aria-live="polite"></div>`;
const screen=document.querySelector<HTMLElement>('#screen')!,video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute('aria-label','Mirrored local camera preview');
const network=new Network(),tracking=new Tracking(video,network),keyboard=new KeyboardInput(),sound=new Sound();
window.addEventListener('pointerdown',()=>void sound.unlock(),{passive:true});window.addEventListener('keydown',()=>void sound.unlock(),{passive:true});
let game=new Game(),renderer:Renderer|null=null,view:'title'|'connect'|'setup'|'game'|'results'='title',mode:'camera'|'keyboard'='keyboard',session:'practice'|'shared'|'network'='practice';
let paused=false,countdown=0,countBeep=-1,ready=false,last=performance.now(),lastSend=0,lastEffects='',lastPhase='',missingFor=0;
const serverAddress=location.origin;let storedBest=0;
let sequence=0,lastPing=0;
try{storedBest=Number(localStorage.getItem('rally-best'))||0;}catch{}
const $=(id:string)=>document.getElementById(id)!;
const setText=(id:string,text:string)=>{const e=document.getElementById(id);if(e&&e.textContent!==text)e.textContent=text;};
const announce=(s:string)=>setText('announcement',s);
function setView(v:typeof view){view=v;document.body.dataset.view=v;$('pause').hidden=v!=='game';}
function canvas(){renderer?.dispose();try{renderer=new Renderer(document.querySelector<HTMLCanvasElement>('#arena')!);}catch{renderer=null;const host=document.querySelector('#arena')?.parentElement;if(host)host.innerHTML='<div class="graphics-error"><h2>Let’s get your court ready.</h2><p>This 3D game needs WebGL. Enable hardware acceleration in your browser, then reload.</p><button class="secondary" id="reload">Reload game</button></div>';$('reload').onclick=()=>location.reload();}}
function focusPrimary(){requestAnimationFrame(()=>screen.querySelector<HTMLButtonElement>('.primary')?.focus({preventScroll:true}));}
function title(){
 tracking.stop();network.close();session='practice';setView('title');paused=false;game=new Game();game.serve=0;game.boxes=[{x:-.65,y:.97,z:-1.4,phase:0,id:0,power:'mega'},{x:.65,y:.97,z:1.4,phase:2,id:1,power:'smash'}];
 screen.innerHTML=`<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> WELCOME TO YOUR NEW FAVORITE SPORT</div><h1>Ready. Set.<br><em>Rally!</em></h1><p class="intro">Your hands are the rackets.<br>Your living room is center court.</p><div class="play-actions"><button class="primary" id="play">Play together ${icon('arrow')}</button><button class="secondary practice-button" id="try">${icon('keyboard')} Try without camera</button><button class="text-button" id="shared">Two players, one keyboard</button></div><div class="hero-meta"><span>Any two browsers</span><i></i><span>First to 7</span><i></i><span>All play</span></div></div><div class="hero-art"><div class="art-caption"><span class="tiny-star">✳</span> THE RALLY CHANNEL</div><div class="hero-sticker">REAL MOVES.<br><b>GOOD TIMES.</b></div><canvas id="arena" aria-label="Live 3D table tennis preview with visible rackets, a lit table and power-up targets"></canvas><div class="floating-tag">${icon('players')} A whole new way to play.</div></div></section><section class="how-section" aria-label="How to play"><div class="section-label">PICK UP & PLAY<br><b>You already know how.</b></div><div class="how-step"><span class="step-number">1</span><div><h3>Find your teammate.</h3><p>Two laptops. One room code.</p></div></div><div class="how-step"><span class="step-number">2</span><div><h3>Make your move.</h3><p>Raise a hand. Move your virtual racket.</p></div></div><div class="how-step"><span class="step-number">3</span><div><h3>Feel the rally.</h3><p>Swing well. Power up. Play on.</p></div></div></section><section class="power-section"><div class="power-heading"><span class="mini-box">?</span><div><h2>A little extra magic.</h2><p>Earn it with great swings or table targets.</p></div></div><div class="power-list">${Object.entries(POWER).map(([key,p])=>`<div class="power-card" style="--power:${p.color}"><span class="power-icon power-${key}">${p.icon}</span><span>${p.name}</span></div>`).join('')}</div><span class="form-preview">PERFECT! <small>Make every swing count.</small></span></section>`;
 const powerList=screen.querySelector<HTMLElement>('.power-list');if(powerList){powerList.style.flexWrap='wrap';powerList.style.justifyContent='center';}
 canvas();try{const code=sessionStorage.getItem('rally-last-room');if(code){const button=document.createElement('button');button.className='text-button';button.textContent=`Rejoin room ${code}`;button.onclick=async()=>{session='network';try{await network.connect(serverAddress,'join',code);setup();}catch{connectScreen();setText('connect-status','That room is no longer available. Create or join a new one.');}};screen.querySelector('.play-actions')?.append(button);}}catch{}$('play').onclick=connectScreen;$('try').onclick=()=>startHosted('practice');$('shared').onclick=()=>startHosted('shared');
}
function connectScreen(){
 setView('connect');renderer?.dispose();renderer=null;
 screen.innerHTML=`<section class="connect-screen"><button class="back-button" id="back">${icon('back')} Back</button><div class="eyebrow">ANYWHERE. ONE GAME.</div><h1>Meet at the table.</h1><p>Invite a friend. Open the link. Let’s play.</p><div class="connect-card"><div class="laptop-pair" aria-hidden="true"><span>01</span><i>↔</i><span>02</span></div><div class="room-actions"><button class="primary" id="create-room">Create a room ${icon('arrow')}</button><span class="or">or join your teammate</span><label for="room-code">Room code</label><div class="join-row"><input id="room-code" maxlength="6" autocomplete="off" placeholder="ABC123"/><button class="secondary" id="join-room">Join room</button></div></div><p id="connect-status" role="status"></p></div><button class="text-button" id="practice">Practice while you wait</button></section>`;
 $('back').onclick=title;$('practice').onclick=()=>startHosted('practice');
 const invite=new URL(location.href).searchParams.get('room');if(invite)($('room-code') as HTMLInputElement).value=invite;
 const connect=async(kind:'create'|'join')=>{const code=($('room-code') as HTMLInputElement).value.trim().toUpperCase();if(kind==='join'&&!/^[A-F0-9]{6}$/.test(code)){setText('connect-status','Enter your teammate’s six-character room code.');return;}
  ($('create-room') as HTMLButtonElement).disabled=true;($('join-room') as HTMLButtonElement).disabled=true;setText('connect-status','Connecting to your court…');
  try{session='network';await network.connect(serverAddress,kind,code);if(view==='connect')setup();}catch(e){if(view==='connect'){setText('connect-status',(e as Error).message);($('create-room') as HTMLButtonElement).disabled=false;($('join-room') as HTMLButtonElement).disabled=false;}}
 };
 $('create-room').onclick=()=>connect('create');$('join-room').onclick=()=>connect('join');
}
function previewMarkup(compact=false){return `<div class="camera-wrap ${compact?'compact':''}"><div id="video-host"></div><svg class="pose-overlay" id="pose-overlay" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg><span class="camera-badge">${compact?'YOU':'YOUR CAMERA · CLOUD MOTION'}</span>${compact?'':`<div class="camera-placeholder" id="camera-placeholder">${icon('camera')}<span>Your side of the table</span></div>`}</div>`;}
function mountVideo(){$('video-host').append(video);}
function setup(){
 setView('setup');document.body.dataset.connected=String(network.connected);ready=false;mode='camera';renderer?.dispose();renderer=null;
 screen.innerHTML=`<section class="setup-screen"><button class="back-button" id="back">${icon('back')} Leave room</button><div class="eyebrow">YOUR COURT IS READY</div><h1 id="calibration-title">Step into view.</h1><p class="setup-intro" id="calibration-instruction">Keep your shoulders, elbows, and wrists visible.</p><div class="room-banner"><span>ROOM <b>${network.code}</b></span><span>You’re Player ${network.side+1} <i>·</i> <span id="peer-status">Waiting for your teammate…</span></span></div><p class="server-share">Invite your teammate: <a id="share-address"></a> <button class="text-button" id="copy-link">Copy link</button></p><div class="setup-panel">${previewMarkup()}<div class="setup-sidebar"><span class="pill-label">MOTION CHECK</span><h2>Your hand.<br>Your racket.</h2><p>Keep your shoulders and playing arm in view. Move across your screen, then swing to send the ball back.</p><div class="readiness"><div id="camera-ready"><i></i> Camera connected</div><div id="head-ready"><i></i> Head in view</div><div id="shoulder-ready"><i></i> Shoulders in view</div><div id="hand-ready"><i></i> Playing hand selected</div></div><p class="camera-status" id="camera-status" role="status">Allow camera access to join the court</p><button class="secondary" id="retry">Start / restart camera</button></div></div><div class="setup-bottom"><span>${icon('camera')} Your camera streams securely to Roboflow for motion tracking. Your teammate never receives your video.</span><button class="text-button" id="setup-keyboard">Use keyboard instead ${icon('arrow')}</button></div><button class="primary ready-button" id="ready-button" disabled>Ready to rally ${icon('arrow')}</button><p class="ready-hint" id="ready-hint">Both players need to be ready to start.</p></section>`;
 mountVideo();const link=new URL(location.href);link.search='';link.searchParams.set('room',network.code);setText('share-address',link.href);($('share-address') as HTMLAnchorElement).href=link.href;$('copy-link').onclick=()=>{void navigator.clipboard.writeText(link.href).then(()=>setText('copy-link','Copied!')).catch(()=>setText('copy-link','Select and copy the link above'));};$('back').onclick=title;$('retry').onclick=()=>{ready=false;mode='camera';void tracking.start();};$('setup-keyboard').onclick=()=>{mode='keyboard';ready=false;void tracking.stop();setText('calibration-title','Ready when you are.');setText('calibration-instruction','Use WASD or the arrow keys. Space adds a swing.');setText('camera-status','Keyboard selected. WASD or arrow keys move your racket. Space adds a swing.');setText('ready-hint','Camera optional. A good time isn’t.');};$('ready-button').onclick=()=>{sound.unlock();ready=!ready;setText('ready-button',ready?'Ready! Waiting for teammate…':'Ready to rally');};network.socket?.off('pose');network.socket?.on('pose',({result})=>tracking.receive(result));if(network.mode==='multiplayer'){tracking.status='Choose Start camera, or use the keyboard.';}else{$('setup-keyboard').click();ready=true;}
}
async function startHosted(kind:'practice'|'shared'){
 connectScreen();setText('connect-status','Opening your court…');session='network';
 try{await network.connect(serverAddress,'create','',kind==='practice'?'practice':'duo');setup();}catch(e){setText('connect-status',(e as Error).message);}
}
function renderGame(){
 setView('game');lastEffects='';const side=session==='network'?network.side:0,ownColor=side===0?'coral':'blue',teammateColor=side===0?'blue':'coral';
 screen.innerHTML=`<section class="game-screen"><div class="game-top"><div class="scoreboard"><span class="stat-label">RALLY POINTS</span><strong id="score">0</strong></div><div class="round-clock"><span class="stat-label">FIRST TO 7</span><div class="match-score"><span id="points-a">0</span><small>–</small><span id="points-b">0</span></div></div><div class="rally-stats"><div><span class="stat-label">RALLY</span><strong id="rally">0</strong></div><div><span class="stat-label">BEST</span><strong id="best">0</strong></div></div></div><div class="effects-bar" id="effects"></div><div class="arena-wrap"><canvas id="arena" aria-label="Full 3D table tennis, viewed from your end. Move your racket to return the approaching ball."></canvas><div class="court-tag"><i></i> THE NIGHT COURT <span>${session==='network'?network.code:session==='practice'?'PRACTICE':'LOCAL DUO'}</span></div><button class="view-button" id="view-toggle">View: Player ${side+1} ↻</button><div class="score-popups" id="score-popups"></div><div class="form-feedback" id="form-feedback" aria-live="polite"></div><div class="serve-notice" id="serve-notice"></div><div class="game-overlay" id="overlay"></div></div><div class="game-bottom"><div class="control-player"><span class="player-dot ${ownColor}"></span><div><b>${session==='network'?`Player ${side+1} · you`:'Player 1'}</b><span id="control-one">${mode==='camera'?'Move your hand. Swing to return.':'<kbd>W A S D</kbd> move · <kbd>Space</kbd> swing'}</span></div></div><div class="swing-panel"><div><span>POWER METER</span><b id="meter-number">0%</b></div><div class="meter-track"><i id="meter-fill"></i></div><small id="quality-label">Great swings earn power-ups</small></div>${mode==='camera'?previewMarkup(true):''}<div class="control-player right"><div><b>${session==='network'?`Player ${2-side}`:session==='practice'?'Practice partner':'Player 2'}</b><span>${network.mode==='duo'?'<kbd>↑ ← ↓ →</kbd> move · <kbd>Enter</kbd> swing':network.mode==='practice'?'Your cloud practice partner.':'Opposite screen. Same team.'}</span></div><span class="player-dot ${teammateColor}"></span></div></div></section>`;
 const scoreboard=screen.querySelector<HTMLElement>('.scoreboard')!,roundClock=screen.querySelector<HTMLElement>('.round-clock')!;scoreboard.setAttribute('aria-label','Match score');scoreboard.innerHTML='<span class="stat-label">MATCH SCORE · FIRST TO 7</span><div class="match-score"><div class="score-team"><span>PLAYER 1</span><strong id="points-a">0</strong></div><b class="score-divider">:</b><div class="score-team"><span>PLAYER 2</span><strong id="points-b">0</strong></div></div>';roundClock.innerHTML='<span class="stat-label">RALLY POINTS</span><strong id="score">0</strong>';
 canvas();if(renderer)renderer.viewMode=side;if(mode==='camera')mountVideo();$('view-toggle').onclick=()=>{if(renderer){renderer.viewMode=renderer.viewMode===2?side:2;setText('view-toggle',renderer.viewMode===2?'View: Court ↻':`View: Player ${side+1} ↻`);}};
}
function renderPause(reason:string){
 if(!document.getElementById('overlay'))return;
 $('overlay').className='game-overlay visible';$('overlay').innerHTML=`<div class="pause-panel"><span class="eyebrow">CONNECTION</span><h2>Reconnect to rally.</h2><p id="pause-message"></p><button class="primary" id="resume">Resume ${icon('arrow')}</button>${mode==='camera'?'<button class="secondary" id="switch-keyboard">Continue with keyboard</button><button class="text-button" id="recalibrate">Recalibrate camera</button>':''}<button class="text-button" id="quit">Back to menu</button><p id="resume-status" role="status"></p></div>`;
 setText('pause-message',reason);$('resume').onclick=()=>{if(mode==='camera'&&!tracking.detected(performance.now())){setText('resume-status','Raise your playing hand, or continue with keyboard.');return;}if(session==='network'){network.send(keyboard.keys,ready,++sequence);network.resume();setText('resume-status','Both players must be connected and ready.');}else{paused=false;countdown=3;countBeep=-1;}sound.unlock();};
 if(mode==='camera'){$('switch-keyboard').onclick=async()=>{mode='keyboard';await tracking.stop();ready=true;network.send(keyboard.keys,true,++sequence);lastPhase='';renderGame();network.resume();};$('recalibrate').onclick=()=>{tracking.start();setText('resume-status','Camera restarting. Raise your playing hand.');};}
 $('quit').onclick=title;focusPrimary();
}
function results(){
 setView('results');ready=false;tracking.stop();renderer?.dispose();renderer=null;sound.end();storedBest=Math.max(storedBest,game.score);try{localStorage.setItem('rally-best',String(storedBest));}catch{}
 const stats=game.playerStats[session==='network'?network.side:0];
 screen.innerHTML=`<section class="results-screen"><div class="confetti" aria-hidden="true">${Array.from({length:24},(_,i)=>`<i style="--x:${i*43%100}%;--delay:${i%7*.12}s;--rotation:${i*41}deg;--color:${['#88d4ee','#c1d6f4','#f4bd78','#bfb3f0'][i%4]}"></i>`).join('')}</div><div class="result-star">✦</div><div class="eyebrow">THAT’S WHAT WE CALL TEAMWORK</div><h1>${game.best>=15?'What a rally!':`Player ${game.winner===null?'—':game.winner+1} takes the game!`}</h1><p><b>${game.points[0]} — ${game.points[1]}</b> · A few wild swings. One more round?</p><div class="result-score"><span class="stat-label">YOUR TEAM SCORE</span><strong id="final-score">${game.score.toLocaleString()}</strong><span>POINTS OF PURE JOY</span></div><div class="result-stats"><div><strong>${game.best}</strong><span>Best rally</span></div><div><strong>${game.collected}</strong><span>Table pickups</span></div><div><strong>${stats.perfect}</strong><span>Perfect swings</span></div><div><strong>${storedBest.toLocaleString()}</strong><span>Personal best</span></div></div><button class="primary" id="again">Play again ${icon('arrow')}</button><button class="text-button" id="result-home">Back to menu</button><p id="replay-status" role="status"></p></section>`;
 $('again').onclick=()=>{if(session==='network'){network.replay();setText('replay-status','Ready for another! Waiting for your teammate…');}else startHosted(session);};$('result-home').onclick=title;announce(`Round complete. ${game.score} points. Best rally: ${game.best}.`);focusPrimary();
}
function playEvents(events:GameEvent[]){for(const event of events){if(event.type==='hit')sound.hit(game.rally);if(event.type==='box'){sound.item(event.power);announce(`${POWER[event.power!].name}! ${POWER[event.power!].description}`);}if(event.type==='bounce')sound.bounce();if(event.type==='miss')sound.miss();if(event.type==='net')sound.net();if(event.type==='point')sound.point();if(event.type==='grade'&&event.grade)sound.grade(event.grade);}}
network.onUpdate=(snapshot:Snapshot)=>{
 if(session!=='network')return;if(view!=='game'||snapshot.phase==='results')game=Object.assign(new Game(),snapshot.game);
 if(snapshot.phase==='results'){if(view!=='results')results();return;}
 if(view==='results'&&snapshot.phase==='lobby'){setup();return;}
 if(view==='setup'&&ready&&['countdown','playing','paused'].includes(snapshot.phase)){sound.unlock();renderGame();lastPhase='';}
 if(view==='game'){
  countdown=snapshot.countdown;

  if(snapshot.phase==='paused'&&lastPhase!=='paused')renderPause(snapshot.reason);
  if(snapshot.phase==='playing'&&lastPhase!=='playing'){$('overlay').className='game-overlay';$('overlay').innerHTML='';}
  lastPhase=snapshot.phase;
 }
};
network.onEvents=playEvents;
network.onDisconnect=()=>{document.body.dataset.connected='false';void tracking.stop();};
network.onReconnect=()=>{document.body.dataset.connected='true';sequence=0;ready=false;setup();};
function updatePreview(now:number){
 const result=tracking.result;
 if(document.getElementById('pose-overlay')&&result){const segments=[[11,12],[11,13],[13,15],[12,14],[14,16]];
  $('pose-overlay').innerHTML=segments.filter(([a,b])=>result.points[a]&&result.points[b]&&(result.points[a].visibility??0)>.5&&(result.points[b].visibility??0)>.5).map(([a,b])=>{const p=result.points[a],q=result.points[b];return `<line x1="${(1-p.x)*640}" y1="${p.y*360}" x2="${(1-q.x)*640}" y2="${q.y*360}" stroke="#86e7ff" stroke-width="3"/>`;}).join('')+(result.wrist?`<circle cx="${result.wrist.x*640}" cy="${result.wrist.y*360}" r="13" fill="#fff" stroke="#45c3ed" stroke-width="6"/>`:'');
 }
 if(view==='setup'){
  const keyboardMode=mode==='keyboard';for(const [id,value] of [['camera-ready',!!tracking.stream],['head-ready',!!result?.head],['shoulder-ready',!!result?.shoulders],['hand-ready',tracking.detected(now)]] as [string,boolean][])$(id).classList.toggle('ready',value);
  if(!keyboardMode){setText('camera-status',tracking.status);$('camera-status').classList.toggle('error',tracking.error);const stage=result?.calibrationStage??'body';const copy={body:['Step into view.','Keep your shoulders, elbows, and wrists visible.'],hand:['Raise your playing hand.','Hold it above your shoulder for a moment.'],neutral:['Find your comfortable spot.','Lower your hand comfortably in front of you. Hold still.'],ready:['Ready when you are.','Move your hand. Your racket follows.']}[stage];setText('calibration-title',copy[0]);setText('calibration-instruction',copy[1]);}$('camera-placeholder').style.display=tracking.stream?'none':'flex';
  ($('ready-button') as HTMLButtonElement).disabled=!keyboardMode&&!tracking.detected(now);
  const peer=network.latest?.players[1-network.side];setText('peer-status',!peer?.connected?'Waiting for your teammate…':peer.ready?'Teammate is ready!':'Teammate is setting up');
 }
}
function updateHud(){
 const side=session==='network'?network.side:0,stats=game.playerStats[side],shownGrade=stats.lastGrade==='GREAT'?'GOOD':stats.lastGrade??'';setText('score',game.score.toLocaleString());setText('points-a',String(game.points[0]));setText('points-b',String(game.points[1]));setText('rally',String(game.rally));setText('best',String(game.best));setText('meter-number',`${stats.meter}%`);$('meter-fill').style.width=`${stats.meter}%`;
 setText('quality-label',stats.gradeLife>0?`${shownGrade}${shownGrade!=='MISS'&&shownGrade!=='SAVED'?` · ${stats.quality}/100`:''}`:'Great swings earn power-ups');$('quality-label').classList.toggle('perfect',stats.lastGrade==='PERFECT'&&stats.gradeLife>0);
 const award=stats.lastGrade==='PERFECT'?25:stats.lastGrade==='GREAT'?15:stats.lastGrade==='OK'?5:0;
 const gradeText=stats.gradeLife>0?`<strong>${shownGrade==='SAVED'?'SHIELD SAVE!':shownGrade}</strong><small>${stats.lastGrade==='MISS'?'Next ball. You’ve got this.':stats.lastGrade==='SAVED'?'Back in the game.':`+${award} POWER`}</small>`:'';if($('form-feedback').innerHTML!==gradeText){$('form-feedback').innerHTML=gradeText;$('form-feedback').className=`form-feedback ${stats.lastGrade?.toLowerCase()??''}`;}
 const effects=(Object.entries(game.playerEffects[side]) as [Power,number][]).map(([key,duration])=>{const p=POWER[key];return `<span class="active-effect" style="--power:${p.color};--remaining:${duration/p.duration*100}%"><b>${p.icon}</b> ${p.name} <strong>${p.duration<1000?`${Math.ceil(duration)}s`:'READY'}</strong></span>`;}).join('')||'<span class="effect-hint">Land on a glowing target. Power up your play. ✦</span>';
 if(effects!==lastEffects){$('effects').innerHTML=effects;lastEffects=effects;}
 if(renderer)$('score-popups').innerHTML=game.popups.map(p=>{const pos=renderer!.project(p);return pos.visible?`<span style="left:${pos.x}%;top:${pos.y}%;opacity:${Math.min(1,p.life*2)};color:${p.color}">${p.text}</span>`:'';}).join('');
 setText('serve-notice',game.serve>0&&!countdown?(game.elapsed<2?'Let’s rally!':'New ball. You’ve got this.'):'');
}
function drawCountdown(){const num=Math.ceil(countdown);if(countBeep<0)sound.ready();countBeep=num;$('overlay').className='game-overlay visible countdown';$('overlay').innerHTML=`<div class="countdown-card"><span>${mode==='camera'?'YOUR HAND IS YOUR RACKET':'WASD TO MOVE · SPACE TO SWING'}</span><strong>${num||'GO!'}</strong><p>Same team. Keep it flying.</p></div>`;}
function loop(now:number){const dt=Math.min(.05,(now-last)/1000);last=now;
 if(view==='title'){game.elapsed=now/1000;renderer?.draw(game,now/1000,true);}
 if(mode==='camera'&&(view==='setup'||view==='game')){updatePreview(now);}else if(view==='setup')updatePreview(now);
 if(session==='network'&&(view==='setup'||view==='game'||view==='results')){
  if(now-lastSend>1000/30){network.send(keyboard.keys,ready&&(mode==='keyboard'||tracking.detected(now)),++sequence);lastSend=now;}
  if(now-lastPing>2000){network.ping();lastPing=now;}
  if(view==='game'){
   const sampled=network.sample(now);if(sampled)game=sampled;
   if(!network.connected||now-network.lastReceived>2200){if(lastPhase!=='disconnected'){renderPause(network.error||'Connection interrupted. Reconnecting…');lastPhase='disconnected';}}
   else if(network.latest?.phase==='countdown')drawCountdown();
   renderer?.draw(game,now/1000);updateHud();
  }
 }
 requestAnimationFrame(loop);
}
 $('home').onclick=()=>title();
$('pause').onclick=()=>network.pause();
$('sound').onclick=()=>{sound.unlock();sound.setMuted(!sound.muted);$('sound').innerHTML=icon(sound.muted?'mute':'sound');$('sound').setAttribute('aria-label',sound.muted?'Unmute sound':'Mute sound');};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{announce('Fullscreen is unavailable in this browser.');}};
window.addEventListener('keydown',e=>{if(e.code==='KeyM'&&!e.repeat&&!['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName))$('sound').click();});
window.addEventListener('pagehide',()=>{tracking.stop();network.suspend();});
title();if(new URL(location.href).searchParams.has('room'))connectScreen();requestAnimationFrame(loop);
