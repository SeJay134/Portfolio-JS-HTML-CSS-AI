import { getSupabase } from "./supabase";
import { STAGING_APP_ORIGIN, STAGING_API_ORIGIN, STAGING_MODE } from "./oauthStaging";
import type { PhotoItem } from "./studioPhotoBatch";

const SERVICE = "http://127.0.0.1:5512";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export type MediaReceipt = { id: string; state: "verified"; byte_size: number; width: number; height: number; sha256: string; cleanup_pending: boolean };
export type MediaEnvironment = { mode: string; dev: boolean; enabled: boolean; origin: string; api: string };
function environment(): MediaEnvironment {
  return { mode: import.meta.env.MODE, dev: import.meta.env.DEV, enabled: import.meta.env.VITE_ENABLE_LOCAL_MEDIA_UPLOAD === "true",
    origin: typeof window === "undefined" ? "" : window.location.origin, api: import.meta.env.VITE_SUPABASE_URL ?? "" };
}
export function mediaStagingAllowed(env: MediaEnvironment): boolean {
  return env.mode === STAGING_MODE && env.dev && env.enabled && env.origin === STAGING_APP_ORIGIN && env.api === STAGING_API_ORIGIN;
}
export function localMediaUploadEnabled(): boolean { return mediaStagingAllowed(environment()); }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid media response.");
  return value as Record<string, unknown>;
}
function integer(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
}
export function decodeMediaReceipt(value: unknown, id: string, target: number): MediaReceipt {
  const row = record(value);
  if (row.id !== id || row.state !== "verified" || !integer(row.byte_size,target) ||
      !integer(row.width,2200) || !integer(row.height,2200) || typeof row.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(row.sha256) || typeof row.cleanup_pending !== "boolean") throw new Error("Invalid media response.");
  return { id, state: "verified", byte_size: row.byte_size, width: row.width, height: row.height, sha256: row.sha256, cleanup_pending: row.cleanup_pending };
}
async function json(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (raw.length > 4096) throw new Error("Invalid media response.");
  return JSON.parse(raw) as unknown;
}

type Session = { owner: string; token: string; key: string };
/** The only network paths are fixed loopback endpoints. No worker token or signing key in the browser. */
export async function transferStagingPhoto(env: MediaEnvironment, session: Session, item: PhotoItem, target: number,
  retry: boolean, signal: AbortSignal): Promise<MediaReceipt> {
  if (!mediaStagingAllowed(env) || !UUID.test(session.owner) || !TOKEN.test(session.token) || session.token.length > 8000 ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(session.key) || !UUID.test(item.id) || item.state !== "ready" || !item.result ||
      item.result.blob.type !== "image/jpeg" || !Number.isInteger(target) || target < 20000 || target > 5000000 ||
      !integer(item.result.blob.size,target) || signal.aborted) throw new Error("Local media upload unavailable.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort",abort,{once:true});
  const timer = window.setTimeout(abort,90000);
  const auth = { Authorization: "Bearer " + session.token };
  const request = (url: string, body: BodyInit, headers: Record<string,string>) => fetch(url,{
    method:"POST",body,headers:{...auth,...headers},signal:controller.signal,credentials:"omit",cache:"no-store",redirect:"error"
  });
  const promote = () => request(SERVICE+"/promote",JSON.stringify({asset_id:item.id,target_bytes:target}),{"Content-Type":"application/json"});
  try {
    // Explicit retry first checks whether an earlier upload/promotion committed.
    // Never create a new ID or overwrite a quarantine object on an uncertain response.
    if (retry) {
      const existing = await promote();
      if (existing.ok) return decodeMediaReceipt(await json(existing),item.id,target);
      if (existing.status !== 409) throw new Error("Local verification unavailable. Retry later.");
    }
    const reservation = await request(STAGING_API_ORIGIN+"/rest/v1/rpc/reserve_studio_media",JSON.stringify({p_id:item.id}),
      {"Content-Type":"application/json",apikey:session.key});
    if (!reservation.ok) throw new Error("Reservation unavailable. Check access or the 20-slot staging limit.");
    const slot = record(await json(reservation));
    const key = session.owner+"/"+item.id+".jpg";
    if (slot.id !== item.id || slot.object_key !== key || slot.state !== "reserved" || slot.max_bytes !== 5000000 ||
        typeof slot.expires_at !== "string" || !Number.isFinite(Date.parse(slot.expires_at)) || Date.parse(slot.expires_at)<=Date.now())
      throw new Error("Invalid reservation.");
    const uploaded = await request(STAGING_API_ORIGIN+"/storage/v1/object/studio-media-quarantine/"+key,item.result.blob,
      {"Content-Type":"image/jpeg",apikey:session.key,"x-upsert":"false"});
    if (!uploaded.ok) throw new Error("Upload not confirmed. Retry the same photo to reconcile.");
    const verified = await promote();
    if (!verified.ok) throw new Error("Server verification not confirmed. Retry the same photo.");
    const receipt = decodeMediaReceipt(await json(verified),item.id,target);
    if (controller.signal.aborted) throw new Error("Media request interrupted.");
    return receipt;
  } finally {
    window.clearTimeout(timer); signal.removeEventListener("abort",abort);
  }
}
export async function storeStudioPhoto(item: PhotoItem,target: number,retry: boolean,signal: AbortSignal): Promise<MediaReceipt> {
  const env=environment();
  if (!mediaStagingAllowed(env) || signal.aborted) throw new Error("Local media upload unavailable.");
  const client=getSupabase();
  if (!client) throw new Error("Sign in again.");
  const {data,error}=await client.auth.getSession();
  if (error || !data.session || signal.aborted) throw new Error("Sign in again.");
  return transferStagingPhoto(env,{owner:data.session.user.id,token:data.session.access_token,key:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},item,target,retry,signal);
}
