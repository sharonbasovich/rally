/// <reference lib="webworker" />
import {FilesetResolver,PoseLandmarker} from '@mediapipe/tasks-vision';
let tracker:PoseLandmarker|null=null;

// MediaPipe's wasm runtime is classic Emscripten output that depends on sloppy-mode
// semantics (its custom_dbg helper is a block-scoped function declaration that only
// hoists outside strict mode). It normally arrives via importScripts(), but a module
// worker's importScripts() throws TypeError, and MediaPipe then falls back to
// `self.import` / dynamic import() — which evaluates the glue as an ES module, i.e.
// strict mode, i.e. "ReferenceError: custom_dbg is not defined".
//
// So implement `self.import` as a real importScripts equivalent: fetch the source and
// run it through an indirect eval, which evaluates in global scope in sloppy mode and
// publishes the runtime's top-level `var ModuleFactory` as a global, exactly as
// importScripts() would. MediaPipe consumes and clears that global on each call, so
// re-evaluating per request is what lets the CPU retry work after a GPU failure.
const scope=self as unknown as {import?:(url:string)=>Promise<void>};
const globalEval=eval;
scope.import=async(url:string)=>{
 const response=await fetch(url,{credentials:'same-origin'});
 if(!response.ok)throw new Error(`Could not load the motion tracking runtime (${response.status} ${response.statusText}) from ${url}`);
 globalEval(await response.text());
};

self.onmessage=async(event:MessageEvent)=>{const data=event.data;try{
 if(data.type==='init'){
  const files=await FilesetResolver.forVisionTasks(data.base+'wasm');
  const create=(delegate:'GPU'|'CPU')=>PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:data.base+'models/pose_landmarker_lite.task',delegate},runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5,outputSegmentationMasks:false});
  let delegate:'GPU'|'CPU'=data.delegate==='CPU'?'CPU':'GPU';
  if(delegate==='GPU')try{tracker=await create('GPU');}catch(error){delegate='CPU';self.postMessage({type:'diagnostic',delegate,message:'GPU unavailable; using compatibility mode. '+String(error)});tracker=await create('CPU');}
  else tracker=await create('CPU');
  self.postMessage({type:'ready',delegate});
 }else if(data.type==='frame'){
  try{const result=tracker!.detectForVideo(data.bitmap,data.timestamp);self.postMessage({type:'pose',landmarks:result.landmarks.length===1?result.landmarks[0]:[],timestamp:data.timestamp});}finally{data.bitmap.close();}
 }
}catch(error){self.postMessage({type:'error',message:String(error)});}};
