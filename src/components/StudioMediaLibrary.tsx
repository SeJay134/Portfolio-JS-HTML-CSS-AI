import React,{useEffect,useRef,useState} from "react";
import {listStudioMedia,previewStudioMedia,type LibraryAsset} from "../lib/studioMediaLibrary";
import {formatBytes} from "../lib/photoCompressor";

export function StudioMediaLibrary(){
  const [assets,setAssets]=useState<LibraryAsset[]|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [preview,setPreview]=useState<{id:string;url:string}|null>(null);
  const active=useRef<AbortController|null>(null);
  const url=useRef("");
  const mounted=useRef(false);
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;active.current?.abort();if(url.current)URL.revokeObjectURL(url.current);url.current="";};
  },[]);
  function close(){
    if(url.current)URL.revokeObjectURL(url.current);
    url.current="";setPreview(null);
  }
  async function run(asset?:LibraryAsset){
    if(active.current)return;
    close();setError("");setBusy(true);
    if(!asset)setAssets(null);
    const controller=new AbortController();active.current=controller;
    const timer=window.setTimeout(()=>controller.abort(),30000);
    try{
      if(asset){
        const blob=await previewStudioMedia(asset,controller.signal);
        if(!mounted.current||controller.signal.aborted)return;
        const value=URL.createObjectURL(blob);url.current=value;setPreview({id:asset.id,url:value});
      }else{
        const rows=await listStudioMedia(controller.signal);
        if(mounted.current&&!controller.signal.aborted)setAssets(rows);
      }
    }catch{
      if(mounted.current){setAssets(null);setError("Media library unavailable. Refresh with an active administrator session.");}
    }finally{
      window.clearTimeout(timer);active.current=null;
      if(mounted.current)setBusy(false);
    }
  }
  return <section className="studio-panel studio-photos" aria-label="Private media library">
    <div className="studio-panel-heading"><div><p className="eyebrow">Isolated staging / Verified media</p><h3>Private media library</h3></div>
      <span className="studio-state">Private</span></div>
    <p className="studio-hint">Stored photos survive queue clearing and page reload within this disposable stack. Refresh after storing. All 20 slots count, including expired and rejected reservations. No public links, deletion or article attachment yet.</p>
    <button type="button" disabled={busy} onClick={()=>void run()}>{assets?"Refresh library":"Load media library"}</button>
    {busy&&<p role="status">Loading private media…</p>}
    {error&&<p role="alert">{error}</p>}
    {assets&&<><p role="status">{assets.filter(a=>a.state==="verified").length} verified · {assets.length}/20 slots used</p>
      {!assets.length&&<p>No stored media yet.</p>}
      <ul className="studio-photo-list">{assets.map(asset=><li key={asset.id}>
        <div><strong>Photo {asset.id.slice(0,8)}…{asset.id.slice(-8)}</strong><p>{asset.state} · {new Date(asset.created_at).toLocaleString()}</p>
          {asset.state==="verified"&&<p>{asset.width} × {asset.height} · {formatBytes(asset.byte_size!)}</p>}</div>
        {asset.state==="verified"&&<button type="button" disabled={busy} onClick={()=>void run(asset)} aria-label={"View stored photo "+asset.id}>View JPEG</button>}
      </li>)}</ul></>}
    {preview&&<figure className="studio-photo-preview"><img src={preview.url} alt="Private verified JPEG"/>
      <figcaption>Verified asset {preview.id}</figcaption><button type="button" onClick={close}>Close stored preview</button></figure>}
  </section>;
}
