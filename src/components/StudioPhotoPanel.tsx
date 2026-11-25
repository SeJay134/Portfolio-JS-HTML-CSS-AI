import React, { useEffect, useRef, useState } from "react";
import { createZip, DEFAULT_TARGET_KB, formatBytes, targetBytes } from "../lib/photoCompressor";
import { canProcess, processStudioPhotos, selectStudioPhotos, type PhotoItem } from "../lib/studioPhotoBatch";

import { localMediaUploadEnabled, storeStudioPhoto, type MediaReceipt } from "../lib/studioMediaUpload";

import { StudioMediaLibrary } from "./StudioMediaLibrary";

const labels = { queued: "Queued", checking: "Checking", compressing: "Compressing", ready: "Ready", failed: "Failed", blocked: "Blocked", cancelled: "Cancelled" };
export function StudioPhotoPanel() {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [rejected, setRejected] = useState(0);
  const [target, setTarget] = useState(String(DEFAULT_TARGET_KB));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [zipUrl, setZipUrl] = useState("");
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const zipRef = useRef("");
  const zipGeneration = useRef(0);
  const [zipping, setZipping] = useState(false);
  const uploadEnabled = localMediaUploadEnabled();
  const [uploading, setUploading] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, MediaReceipt>>({});
  const [attempted, setAttempted] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    mounted.current = true;
    const generation = zipGeneration;
    return () => {
      mounted.current = false;
      active.current?.abort();
      generation.current++;
      if (zipRef.current) URL.revokeObjectURL(zipRef.current);
      zipRef.current = "";
    };
  }, []);
  const preview = items.find(item => item.id === previewId)?.result;
  useEffect(() => {
    setPreviewUrl("");
    if (!preview) return;
    const url = URL.createObjectURL(preview.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  const ready = items.filter(item => item.state === "ready" && item.result);
  const finished = items.filter(item => ["ready","failed","blocked","cancelled"].includes(item.state)).length;
  const inputBytes = items.reduce((sum, item) => sum + item.sourceBytes, 0);
  const readySourceBytes = ready.reduce((sum, item) => sum + item.sourceBytes, 0);
  const outputBytes = ready.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0);
  function clearZip() {
    zipGeneration.current++;
    if (zipRef.current) URL.revokeObjectURL(zipRef.current);
    zipRef.current = "";
    setZipUrl("");
  }
  function choose(files: File[]) {
    if (active.current || zipping) return;
    clearZip();
    const selection = selectStudioPhotos(files);
    setReceipts({}); setAttempted({}); setUploadErrors({});
    setItems(selection.items); setRejected(selection.rejected); setConfirmed(false); setPreviewId(null); setMessage("");
  }
  async function run(ids: string[]) {
    if (!confirmed || active.current || zipping || !ids.length) return;
    let limit: number;
    try { limit = targetBytes(target); }
    catch { setMessage("Enter a whole number between 20 and 5000 KB."); return; }
    clearZip(); setMessage("Loading the on-device safety filter…"); setBusy(true);
    const controller = new AbortController();
    active.current = controller;
    const selected = new Set(ids);
    setItems(current => current.map(item => selected.has(item.id) && canProcess(item) ? { ...item, state: "queued", reason: undefined } : item));
    try {
      await processStudioPhotos(items, selected, limit, controller.signal, (id, changes) => {
        if (!mounted.current || controller.signal.aborted) return;
        setMessage("Checking and compressing photos locally…");
        setItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
      });
      if (mounted.current && !controller.signal.aborted) setMessage("Batch complete. Only ready photos can be downloaded.");
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setMessage("On-device safety filter unavailable. No unchecked photos were processed.");
        setItems(current => current.map(item => selected.has(item.id) && item.state === "queued" ? { ...item, state: "failed", reason: "Safety filter unavailable." } : item));
      }
    } finally {
      if (mounted.current && active.current === controller) {
        if (controller.signal.aborted) {
          setItems(current => current.map(item => selected.has(item.id) && ["queued","checking","compressing"].includes(item.state)
            ? { ...item, state: "cancelled", reason: "Cancelled before completion." } : item));
          setMessage("Cancelled. Completed photos are retained locally; unfinished photos can be retried.");
        }
        active.current = null; setBusy(false);
      }
    }
  }
  async function prepareZip() {
    if (!ready.length || active.current || zipping) return;
    clearZip(); setZipping(true);
    const generation = zipGeneration.current;
    try {
      const entries = ready.flatMap(item => item.result ? [{ name: item.result.outputName, blob: item.result.blob }] : []);
      const zip = await createZip(entries);
      if (!mounted.current || generation !== zipGeneration.current) return;
      const url = URL.createObjectURL(zip); zipRef.current = url; setZipUrl(url);
    } catch { if (mounted.current && generation === zipGeneration.current) setMessage("Could not prepare the ZIP. Try a smaller batch."); }
    finally { if (mounted.current && generation === zipGeneration.current) setZipping(false); }
  }
  async function upload(item: PhotoItem) {
    if (!uploadEnabled || !confirmed || active.current || zipping || item.state !== "ready" || !item.result || receipts[item.id]) return;
    let limit: number;
    try { limit = targetBytes(target); } catch { return; }
    const controller = new AbortController();
    active.current = controller; setUploading(item.id);
    const retry = attempted[item.id] === true;
    setAttempted(current => ({...current,[item.id]:true}));
    setUploadErrors(current => ({...current,[item.id]:""}));
    try {
      const receipt = await storeStudioPhoto(item,limit,retry,controller.signal);
      if (mounted.current && !controller.signal.aborted) setReceipts(current => ({...current,[item.id]:receipt}));
    } catch {
      if (mounted.current) setUploadErrors(current => ({...current,[item.id]:controller.signal.aborted
        ? "Cancelled locally. Server may have completed; retry the same photo."
        : "Storage or verification not confirmed. Check the local service, access and quota, then retry this photo."}));
    } finally {
      if (active.current === controller) {
        active.current=null;
        if (mounted.current) setUploading(null);
      }
    }
  }
  function remove(id: string) {
    if (active.current || zipping) return;
    clearZip(); setItems(current => current.filter(item => item.id !== id));
    if (previewId === id) setPreviewId(null);
  }
  const locked = busy || zipping || uploading !== null;
  return <section className="studio-panel studio-photos" aria-label="Photo preparation">
    <div className="studio-panel-heading"><div><p className="eyebrow">Phase 3C / Local media preparation</p><h3>Photo compression</h3></div>
      <span className="studio-state">{uploadEnabled ? "Isolated staging uploads" : "No uploads"}</span></div>
    <p className="studio-hint">Select up to 300 photos, 25 MiB each and 1 GiB total. On iPhone, try batches of 50–100. Results remain in memory; download before leaving or an access recheck. JPEG output removes original metadata, flattens transparency on white and uses a still frame for animations. HEIC support depends on the browser.</p>
    <label>Choose photos<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/gif,image/bmp,image/tiff,.heic,.heif"
      disabled={locked} onChange={event => { choose(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }}/></label>
    <div className="studio-photo-controls"><label>Max size per photo (KB)<input type="number" min={20} max={5000} step={1} inputMode="numeric"
      value={target} disabled={locked || ready.length > 0} onChange={event => { setTarget(event.target.value); clearZip(); }}/></label>
      <button type="button" disabled={locked || !items.length} onClick={() => choose([])}>Clear photo batch</button></div>
    {ready.length > 0 && <p className="studio-hint">Target is locked while ready files exist. Clear the batch or remove ready files to change it.</p>}
    <label className="studio-autosave"><input type="checkbox" checked={confirmed} disabled={locked || !items.length} onChange={event => setConfirmed(event.target.checked)}/>
      I confirm I have the right to use these photos and accept the prohibited-content rules.</label>
    <p className="studio-hint">Adult/sexual content is prohibited. Every processed photo must pass the existing on-device adult-content screen; detection is imperfect and does not cover all prohibited content. {uploadEnabled ? " Only locally screened, compressed JPEGs can be explicitly sent to the disposable local storage. Server JPEG verification is not semantic moderation." : " No bypass or upload is provided."}</p>
    <a className="text-link" href="/terms/#prohibited-content">Prohibited-content rules</a>
    {uploadEnabled && <p className="studio-hint">Local testing only: up to 20 reserved or stored assets per administrator. Store a ready JPEG explicitly; clearing the queue does not delete stored media. Receipts here are temporary, and articles cannot reference assets yet. No hosted upload.</p>}
    {rejected > 0 && <p role="status">{rejected} unsupported or over-limit file(s) excluded.</p>}
    <div className="studio-actions"><button className="button primary" type="button" disabled={locked || !confirmed || !items.some(canProcess)}
      onClick={() => void run(items.filter(canProcess).map(item => item.id))}>Compress photos</button>
      <button type="button" disabled={!busy} onClick={() => active.current?.abort()}>Cancel compression</button>
      {uploadEnabled && <button type="button" disabled={!uploading} onClick={() => active.current?.abort()}>Cancel upload</button>}</div>
    <div aria-live="polite" className="studio-photo-progress"><p>{items.length} selected · {formatBytes(inputBytes)} · {ready.length} ready</p>
      <progress aria-label="Photo processing progress" max={Math.max(items.length,1)} value={finished}/>
      {message && <p>{message}</p>}</div>
    {ready.length > 0 && <div className="studio-save-panel"><p><strong>Ready:</strong> {formatBytes(readySourceBytes)} → {formatBytes(outputBytes)} (JPEG)</p>
      <button type="button" disabled={locked} onClick={() => void prepareZip()}>{zipping ? "Preparing ZIP…" : "Prepare ZIP"}</button>
      {zipUrl && <a className="button secondary" href={zipUrl} download="blog-photos.zip">Download ZIP</a>}</div>}
    {preview && previewUrl && <figure className="studio-photo-preview"><img src={previewUrl} alt={"Compressed preview: " + preview.outputName} width={preview.width} height={preview.height}/>
      <figcaption>{preview.outputName} · {preview.width} × {preview.height} · {preview.blob.size} bytes</figcaption>
      <a href={previewUrl} download={preview.outputName}>Download JPEG</a><button type="button" onClick={() => setPreviewId(null)}>Close preview</button></figure>}
    {items.length > 0 && <ul className="studio-photo-list" aria-label="Photo queue">{items.map(item => <li key={item.id}>
      <div><strong>{item.name}</strong><p>{labels[item.state]} · {formatBytes(item.sourceBytes)}{item.result && " → " + item.result.blob.size + " bytes"}</p>
        {item.reason && <p className="studio-hint">{item.reason}</p>}
        {receipts[item.id] && <p role="status">Stored privately · {receipts[item.id].width} × {receipts[item.id].height} · {receipts[item.id].byte_size} bytes{receipts[item.id].cleanup_pending ? " · Quarantine cleanup pending" : ""}</p>}
        {uploadErrors[item.id] && <p role="alert" className="studio-error">{uploadErrors[item.id]}</p>}</div>
      <div className="studio-actions">{item.result && <button type="button" onClick={() => setPreviewId(item.id)} aria-label={"Preview " + item.name}>Preview</button>}
      {uploadEnabled && item.state === "ready" && item.result && !receipts[item.id] && <button type="button" disabled={locked || !confirmed} onClick={() => void upload(item)} aria-label={"Store " + item.name}>{uploading === item.id ? "Storing…" : attempted[item.id] ? "Retry storage" : "Store JPEG"}</button>}
      {["failed","cancelled"].includes(item.state) && item.file && <button type="button" disabled={locked || !confirmed} onClick={() => void run([item.id])} aria-label={"Retry " + item.name}>Retry</button>}
      <button type="button" disabled={locked} onClick={() => remove(item.id)} aria-label={"Remove " + item.name}>Remove</button></div>
    </li>)}</ul>}
    {uploadEnabled && <StudioMediaLibrary />}
  </section>;
}
