import { getSupabase } from "./supabase";
import { localMediaUploadEnabled } from "./studioMediaUpload";
import { STAGING_API_ORIGIN } from "./oauthStaging";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type LibraryAsset = { id:string; state:"reserved"|"verified"|"rejected"; created_at:string; expires_at:string; byte_size:number|null; width:number|null; height:number|null; sha256:string|null };
const int=(value:unknown,max:number): value is number => typeof value==="number"&&Number.isInteger(value)&&value>=1&&value<=max;
export function decodeLibrary(input:unknown): LibraryAsset[] {
  if (!Array.isArray(input)||input.length>20) throw new Error("Invalid media library.");
  const seen=new Set<string>();
  return input.map(value=>{
    if (!value||typeof value!=="object"||Array.isArray(value)) throw new Error("Invalid media library.");
    const row=value as Record<string,unknown>;
    if(typeof row.id!=="string"||!UUID.test(row.id)||seen.has(row.id)||
       (row.state!=="reserved"&&row.state!=="verified"&&row.state!=="rejected")||
       typeof row.created_at!=="string"||!Number.isFinite(Date.parse(row.created_at))||
       typeof row.expires_at!=="string"||!Number.isFinite(Date.parse(row.expires_at))) throw new Error("Invalid media library.");
    seen.add(row.id);
    if(row.state==="verified"){
      if(!int(row.byte_size,5000000)||!int(row.width,2200)||!int(row.height,2200)||
         typeof row.sha256!=="string"||!/^[0-9a-f]{64}$/.test(row.sha256)) throw new Error("Invalid verified metadata.");
      return {id:row.id,state:row.state,created_at:row.created_at,expires_at:row.expires_at,byte_size:row.byte_size,width:row.width,height:row.height,sha256:row.sha256};
    }
    if(row.byte_size!==null||row.width!==null||row.height!==null||row.sha256!==null) throw new Error("Invalid media state.");
    return {id:row.id,state:row.state,created_at:row.created_at,expires_at:row.expires_at,byte_size:null,width:null,height:null,sha256:null};
  });
}
async function authorizedRequest(path:"list"|"preview",body:object,signal:AbortSignal):Promise<Response>{
  if(!localMediaUploadEnabled()||signal.aborted) throw new Error("Local media library unavailable.");
  const client=getSupabase();
  if(!client)throw new Error("Sign in again.");
  const {data,error}=await client.auth.getSession();
  if(error||!data.session||signal.aborted)throw new Error("Sign in again.");
  const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key??""))throw new Error("Invalid local configuration.");
  const headers:Record<string,string>={Authorization:"Bearer "+data.session.access_token,"Content-Type":"application/json"};
  if(path==="list")headers.apikey=key;
  const response=await fetch(path==="list"?STAGING_API_ORIGIN+"/rest/v1/rpc/list_studio_media":"http://127.0.0.1:5512/preview",{
    method:"POST",body:JSON.stringify(body),headers,signal,credentials:"omit",cache:"no-store",redirect:"error"
  });
  if(!response.ok)throw new Error("Media unavailable. Check access and local service.");
  return response;
}
async function boundedBytes(response:Response,limit:number):Promise<Uint8Array<ArrayBuffer>>{
  if(!response.body)throw new Error("Empty response.");
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const result=await reader.read();if(result.done)break;
      size+=result.value.byteLength;
      if(size>limit){await reader.cancel();throw new Error("Oversized media response.");}
      chunks.push(result.value);
    }
  }finally{reader.releaseLock();}
  const data=new Uint8Array(size);let pos=0;
  for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.byteLength;}
  return data;
}
export async function listStudioMedia(signal:AbortSignal):Promise<LibraryAsset[]>{
  const response=await authorizedRequest("list",{},signal);
  const bytes=await boundedBytes(response,32768);
  return decodeLibrary(JSON.parse(new TextDecoder().decode(bytes)));
}
export async function previewStudioMedia(asset:LibraryAsset,signal:AbortSignal):Promise<Blob>{
  if(asset.state!=="verified"||!asset.byte_size||!asset.sha256||!UUID.test(asset.id))throw new Error("Media not verified.");
  const response=await authorizedRequest("preview",{asset_id:asset.id},signal);
  if(response.headers.get("content-type")!=="image/jpeg")throw new Error("Invalid preview.");
  const bytes=await boundedBytes(response,asset.byte_size);
  if(bytes.byteLength!==asset.byte_size||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw new Error("Invalid preview.");
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");
  if(digest!==asset.sha256||signal.aborted)throw new Error("Preview integrity mismatch.");
  return new Blob([bytes],{type:"image/jpeg"});
}
