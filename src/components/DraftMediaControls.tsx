import React,{useEffect,useRef,useState} from "react";
import type { StudioImage,StudioDraft,StudioBlock } from "../data/blogStudio";
import {listStudioMedia,previewStudioMedia,type LibraryAsset} from "../lib/studioMediaLibrary";
import {localMediaUploadEnabled} from "../lib/studioMediaUpload";

export function ImageFields({image,onChange,label}:{image:StudioImage;onChange:(image:StudioImage)=>void;label:string}){
 return <div className="studio-run">
   <p className="studio-hint">{label} · {image.assetId.slice(0,8)}…{image.assetId.slice(-8)}</p>
   <label>{label} ALT text<input maxLength={500} value={image.alt} onChange={e=>onChange({...image,alt:e.target.value})}/></label>
   <label>{label} caption<input maxLength={1000} value={image.caption} onChange={e=>onChange({...image,caption:e.target.value})}/></label>
 </div>;
}

export function DraftMediaPicker({draft,remaining,onChange,onAdd}:{draft:StudioDraft;remaining:number;onChange:(cover:StudioImage|null)=>void;onAdd:(block:StudioBlock)=>void}){
 const [assets,setAssets]=useState<LibraryAsset[]|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 async function load(){
   if(active.current)return;
   const controller=new AbortController();active.current=controller;setBusy(true);setAssets(null);setSelected([]);setError("");
   const timer=window.setTimeout(()=>controller.abort(),15000);
   try{const rows=await listStudioMedia(controller.signal);if(!controller.signal.aborted)setAssets(rows.filter(a=>a.state==="verified"));}
   catch{if(!controller.signal.aborted)setError("Private media unavailable.");}
   finally{window.clearTimeout(timer);active.current=null;if(!controller.signal.aborted)setBusy(false);}
 }
 const chosen=()=>selected.map(assetId=>({assetId,alt:"",caption:""}));
 return <section aria-label="Article media" className="studio-run">
   <h4>Article media</h4>
   {draft.cover&&<><ImageFields image={draft.cover} label="Cover" onChange={onChange}/><button type="button" onClick={()=>onChange(null)}>Remove cover</button></>}
   <p className="studio-hint">Choose stored verified photos. Image and gallery blocks can be moved between text blocks. Add ALT text before publishing. {remaining} reference slots left.</p>
   <button type="button" disabled={busy} onClick={()=>void load()}>{assets?"Refresh verified photos":"Choose verified photos"}</button>
   {error&&<p role="alert">{error}</p>}
   {assets&&<><label>Verified photos (select up to 8)<select multiple size={Math.min(5,Math.max(2,assets.length))} value={selected}
      onChange={e=>setSelected(Array.from(e.currentTarget.selectedOptions,o=>o.value).slice(0,8))}>
     {assets.map(a=><option key={a.id} value={a.id}>{a.id.slice(0,8)}…{a.id.slice(-8)} · {a.width} × {a.height}</option>)}
   </select></label>
   {!assets.length&&<p>No verified photos. Store JPEGs first.</p>}
   <div className="studio-actions">
     <button type="button" disabled={selected.length!==1||remaining+(draft.cover?1:0)<1} onClick={()=>onChange(chosen()[0])}>Set cover</button>
     <button type="button" disabled={selected.length<1||selected.length>remaining||draft.blocks.length>=100}
       onClick={()=>{onAdd({id:crypto.randomUUID(),kind:selected.length===1?"image":"gallery",text:"",language:"",runs:[{text:""}],images:chosen()});setSelected([]);}}>
       {selected.length>1?"Add gallery":"Add image"}</button>
   </div></>}
 </section>;
}

export function PrivateArticleImage({image}:{image:StudioImage}){
 const [url,setUrl]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const active=useRef<AbortController|null>(null);
 const objectUrl=useRef("");
 useEffect(()=>()=>{active.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current="";},[]);
 async function load(){
   if(active.current||!localMediaUploadEnabled())return;
   const controller=new AbortController();active.current=controller;setBusy(true);setError("");
   const timer=window.setTimeout(()=>controller.abort(),30000);
   try{
     const rows=await listStudioMedia(controller.signal);
     const asset=rows.find(a=>a.id===image.assetId&&a.state==="verified");
     if(!asset)throw Error("Unavailable");
     const blob=await previewStudioMedia(asset,controller.signal);
     if(controller.signal.aborted)return;
     const next=URL.createObjectURL(blob);objectUrl.current=next;setUrl(next);
   }catch{if(!controller.signal.aborted)setError("Private photo unavailable.");}
   finally{window.clearTimeout(timer);active.current=null;if(!controller.signal.aborted)setBusy(false);}
 }
 return <figure className="studio-photo-preview">
   {url?<img src={url} alt={image.alt}/>:<button type="button" disabled={busy||!localMediaUploadEnabled()} onClick={()=>void load()}>{busy?"Loading photo…":"Load private photo"}</button>}
   {error&&<p role="alert">{error}</p>}
   {!url&&image.alt&&<p>{image.alt}</p>}
   {image.caption&&<figcaption>{image.caption}</figcaption>}
 </figure>;
}
