export class KeyboardInput {
 keys=new Set<string>();
 constructor(){const allowed=['KeyW','KeyS','KeyA','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'];window.addEventListener('keydown',e=>{if(allowed.includes(e.code)&&!['INPUT','TEXTAREA','BUTTON'].includes((e.target as HTMLElement).tagName)){e.preventDefault();this.keys.add(e.code);}});window.addEventListener('keyup',e=>this.keys.delete(e.code));window.addEventListener('blur',()=>this.keys.clear());}
}
