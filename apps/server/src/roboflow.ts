import {randomBytes} from 'node:crypto';
import type {Landmark} from './motion/pose';

export interface VisionConfig {apiKey:string;origin:string;model:string;maxStreams:number;region:string}
export interface StreamLease {id:string;secret:string;owner:string;created:number;lastFrame:number;lastTimestamp:number;pipelineId?:string;closed:boolean}
type Fetcher=typeof fetch;
const api='https://serverless.roboflow.com';

/** This spec stays on the server: the callback credential never reaches a browser. */
export function workflow(config:VisionConfig,lease:StreamLease){return {
 version:'1.0',inputs:[{type:'InferenceImage',name:'image'}],steps:[
  {type:'roboflow_core/roboflow_keypoint_detection_model@v2',name:'pose',images:'$inputs.image',model_id:config.model,confidence:.4,keypoint_confidence:.3,disable_active_learning:true,max_detections:2},
  {type:'roboflow_core/webhook_sink@v1',name:'deliver',url:`${config.origin}/api/vision/results`,method:'POST',
   headers:{Authorization:`Bearer ${lease.secret}`},json_payload:{predictions:'$steps.pose.predictions',frame:'$inputs.image',timestamp:'$inputs.image'},
   json_payload_operations:{predictions:[{type:'DetectionsToDictionary'}],frame:[{type:'ExtractFrameMetadata',property_name:'frame_number'}],timestamp:[{type:'ExtractFrameMetadata',property_name:'frame_timestamp'},{type:'TimestampToISOFormat'}]},
   cooldown_seconds:0,request_timeout:2,fire_and_forget:false}],outputs:[]};}

export class Roboflow {
 leases=new Map<string,StreamLease>();
 constructor(public config:VisionConfig,private request:Fetcher=fetch){}
 get enabled(){return !!this.config.apiKey&&!!this.config.origin;}
 private async json(url:string,init:RequestInit={},timeout=45000){
  const response=await this.request(url,{...init,signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error('Motion service could not start. Please retry shortly or use the keyboard.');
  return response.status===204?{}:response.json();
 }
 async iceServers(){
  const result=await this.json(`https://api.roboflow.com/webrtc_turn_config?api_key=${encodeURIComponent(this.config.apiKey)}`,{},10000);
  const servers=Array.isArray(result)?result:result.iceServers??(result.urls?[result]:[]);
  if(!servers.some((s:{urls:string|string[]})=>[s.urls].flat().some(url=>/^turns?:/.test(url))))throw new Error('Camera relay is unavailable. Retry shortly or use the keyboard.');
  return servers;
 }
 reserve(owner:string){
  if(!this.enabled)throw new Error('Camera play is not available yet. You can play with the keyboard.');
  if([...this.leases.values()].some(l=>l.owner===owner&&!l.closed))throw new Error('A camera is already starting. Stop it before retrying.');
  if(this.leases.size>=this.config.maxStreams)throw new Error('All camera courts are busy. Retry shortly or use the keyboard.');
  const lease:StreamLease={id:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('hex'),owner,created:Date.now(),lastFrame:-1,lastTimestamp:0,closed:false};
  this.leases.set(lease.id,lease);return lease;
 }
 async start(lease:StreamLease,offer:{sdp:string;type:'offer'}){
  try{
   const iceServers=await this.iceServers();
   const result=await this.json(`${api}/initialise_webrtc_worker`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    api_key:this.config.apiKey,workflow_configuration:{type:'WorkflowConfiguration',image_input_name:'image',video_metadata_input_name:'video_metadata',workflows_parameters:{},workflows_thread_pool_workers:1,cancel_thread_pool_tasks_on_exit:true,workflow_specification:workflow(this.config,lease)},
    webrtc_offer:offer,webrtc_config:{iceServers},webrtc_realtime_processing:true,stream_output:[],data_output:[],processing_timeout:900,requested_plan:'webrtc-gpu-small',requested_region:this.config.region
   })});
   lease.pipelineId=result.context?.pipeline_id;
   if(lease.closed){await this.terminate(lease);throw new Error('Camera session was cancelled.');}
   if(result.type!=='answer'||typeof result.sdp!=='string'||!lease.pipelineId)throw new Error('Motion service returned an invalid connection. Please retry.');
   return {type:'answer' as const,sdp:result.sdp};
  }catch(error){await this.stop(lease.id);throw error;}
 }
 authenticate(secret:string){return [...this.leases.values()].find(l=>!l.closed&&l.secret===secret);}
 async stop(id:string){const lease=this.leases.get(id);if(!lease)return;lease.closed=true;this.leases.delete(id);await this.terminate(lease);}
 private async terminate(lease:StreamLease){if(!lease.pipelineId)return;try{await this.json(`${api}/inference_pipelines/${encodeURIComponent(lease.pipelineId)}/terminate?api_key=${encodeURIComponent(this.config.apiKey)}`,{method:'POST'},5000);}catch{console.warn('Motion worker termination failed; provider session timeout remains active.');}}
 async stopOwner(owner:string){await Promise.all([...this.leases.values()].filter(l=>l.owner===owner).map(l=>this.stop(l.id)));}
 async sweep(now=Date.now()){await Promise.all([...this.leases.values()].filter(l=>now-l.created>890000||now-(l.lastTimestamp||l.created)>(l.lastTimestamp?60000:90000)).map(l=>this.stop(l.id)));}
}

/** Roboflow DetectionsToDictionary returns pixel coordinates in a predictions envelope. */
export function landmarks(payload:unknown):Landmark[]{
 const data=payload as {image?:{width:number;height:number};predictions?:Array<{confidence:number;keypoints?:Array<{x:number;y:number;confidence:number;class_id:number}>}>};
 if(data&&Array.isArray(data.predictions)&&data.predictions.length===0)return [];
 if(!data||!data.image||!Number.isFinite(data.image.width)||!Number.isFinite(data.image.height)||data.image.width<=0||data.image.height<=0||!Array.isArray(data.predictions))throw new Error('Invalid predictions');
 // Multiple people are ambiguous. Pause rather than switching control between bodies.
 const people=data.predictions.filter(p=>Number.isFinite(p.confidence)&&p.confidence>=.4);
 if(people.length!==1)return [];
 const points:Landmark[]=Array.from({length:33},()=>({x:0,y:0,visibility:0}));
 const cocoToPose=[0,2,5,7,8,11,12,13,14,15,16,23,24,25,26,27,28];
 for(const p of people[0].keypoints??[]){if(!Number.isInteger(p.class_id)||p.class_id<0||p.class_id>=17||![p.x,p.y,p.confidence].every(Number.isFinite))continue;
  points[cocoToPose[p.class_id]]={x:p.x/data.image.width,y:p.y/data.image.height,visibility:Math.max(0,Math.min(1,p.confidence))};}
 return points;
}
