import { afterEach, expect, it, vi } from "vitest";
import { mediaStagingAllowed, transferStagingPhoto, decodeMediaReceipt, type MediaEnvironment } from "../../../src/lib/studioMediaUpload";
import type { PhotoItem } from "../../../src/lib/studioPhotoBatch";

const env: MediaEnvironment={mode:"oauth-staging",dev:true,enabled:true,origin:"http://127.0.0.1:5511",api:"http://127.0.0.1:54321"};
const id="99000000-0000-0000-0000-000000000001";
const owner="91000000-0000-0000-0000-000000000001";
const session={owner,token:"fixture.payload.signature",key:"sb_publishable_fixture"};
const item: PhotoItem={id,name:"fixture.png",state:"ready",file:null,sourceBytes:100,result:{name:"fixture.png",sourceBytes:100,width:96,height:64,blob:new Blob(["jpeg"],{type:"image/jpeg"}),outputName:"fixture.jpg"}};
const receipt={id,state:"verified",byte_size:4,width:96,height:64,sha256:"a".repeat(64),cleanup_pending:false};
const slot=()=>({id,object_key:owner+"/"+id+".jpg",state:"reserved",max_bytes:5000000,expires_at:new Date(Date.now()+3600000).toISOString()});
const response=(body:unknown,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)}) as Response;
const signal=()=>new AbortController().signal;
afterEach(()=>vi.unstubAllGlobals());
it("requires exact isolated mode, dev, flag and origins",()=>{
  expect(mediaStagingAllowed(env)).toBe(true);
  for(const override of [{dev:false},{enabled:false},{mode:"production"},{origin:"http://localhost:5511"},{api:"https://example.supabase.co"}])
    expect(mediaStagingAllowed({...env,...override})).toBe(false);
});
it("never makes requests if gate, state or token is invalid",async()=>{
  const fetch=vi.fn(); vi.stubGlobal("fetch",fetch);
  await expect(transferStagingPhoto({...env,dev:false},session,item,300000,false,signal())).rejects.toThrow();
  await expect(transferStagingPhoto(env,session,{...item,state:"blocked"},300000,false,signal())).rejects.toThrow();
  await expect(transferStagingPhoto(env,{...session,key:"sb_secret_fixture"},item,300000,false,signal())).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("reserves, uploads raw JPEG without upsert and requests verification",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response(slot())).mockResolvedValueOnce(response({},200)).mockResolvedValueOnce(response(receipt));
  vi.stubGlobal("fetch",fetch);
  expect(await transferStagingPhoto(env,session,item,300000,false,signal())).toEqual(receipt);
  expect(fetch.mock.calls.map(call=>call[0])).toEqual([env.api+"/rest/v1/rpc/reserve_studio_media",env.api+"/storage/v1/object/studio-media-quarantine/"+owner+"/"+id+".jpg","http://127.0.0.1:5512/promote"]);
  expect(fetch.mock.calls[1][1].body).toBe(item.result!.blob);
  expect(fetch.mock.calls[1][1].headers["x-upsert"]).toBe("false");
  expect(fetch.mock.calls[2][1].headers.apikey).toBeUndefined();
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({asset_id:id,target_bytes:300000});
  expect(fetch.mock.calls.every(call=>call[1].credentials==="omit"&&call[1].redirect==="error")).toBe(true);
});
it("rejects wrong owner path before sending bytes",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response({...slot(),object_key:"wrong.jpg"})); vi.stubGlobal("fetch",fetch);
  await expect(transferStagingPhoto(env,session,item,300000,false,signal())).rejects.toThrow("Invalid reservation");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("retries same ID by reconciling confirmed server receipt first",async()=>{
  const fetch=vi.fn().mockResolvedValue(response(receipt)); vi.stubGlobal("fetch",fetch);
  expect(await transferStagingPhoto(env,session,item,300000,true,signal())).toEqual(receipt);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:5512/promote");
});
it("does not promote a failed upload or accept an invalid receipt",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response(slot())).mockResolvedValueOnce(response({},403)); vi.stubGlobal("fetch",fetch);
  await expect(transferStagingPhoto(env,session,item,300000,false,signal())).rejects.toThrow("Upload not confirmed");
  expect(fetch).toHaveBeenCalledTimes(2);
  for(const bad of [{id:"wrong"},{byte_size:300001},{width:2201},{state:"reserved"},{sha256:"wrong"}])
    expect(()=>decodeMediaReceipt({...receipt,...bad},id,300000)).toThrow();
});
