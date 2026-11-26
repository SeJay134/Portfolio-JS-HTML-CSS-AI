import { afterEach, expect, it, vi } from "vitest";
import { changePublication, decodePublication, getPublication } from "../../../src/data/blogDraftRepository";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),abort:vi.fn()}));
vi.mock("../../../src/lib/supabase",()=>({getSupabase:()=>({rpc:mocks.rpc})}));
const id="96000000-0000-0000-0000-000000000001", key="98000000-0000-0000-0000-000000000001";
const empty={generation:0,source_revision:null,status:"draft",slug:null,published_at:null};
const live={generation:1,source_revision:1,status:"published",slug:"fixture",published_at:"2026-11-25T00:00:00Z"};
afterEach(()=>{vi.unstubAllEnvs();mocks.rpc.mockReset();mocks.abort.mockReset();});
it("decodes exact publication states and rejects inconsistent receipts",()=>{
  expect(decodePublication(empty)).toEqual(empty);expect(decodePublication(live)).toEqual(live);
  for(const bad of [{...live,slug:"../private"},{...live,published_at:null},{...empty,generation:201},{...live,secret:"x"}])expect(()=>decodePublication(bad)).toThrow();
});
it("requires both flags and validates narrow CAS mutation receipt",async()=>{
  const signal=new AbortController().signal;
  vi.stubEnv("VITE_ENABLE_BLOG_DRAFTS","true");vi.stubEnv("VITE_ENABLE_BLOG_PUBLICATION","false");
  await expect(getPublication(id,signal)).rejects.toThrow("unavailable");
  expect(mocks.rpc).not.toHaveBeenCalled();
  vi.stubEnv("VITE_ENABLE_BLOG_PUBLICATION","true");
  mocks.rpc.mockReturnValue({abortSignal:mocks.abort});
  mocks.abort.mockResolvedValue({data:live,error:null,status:200});
  const req={draftId:id,key,revision:1,generation:0,action:"publish" as const};
  expect(await changePublication(req,signal)).toEqual(live);
  expect(mocks.rpc).toHaveBeenCalledWith("change_studio_publication",{p_id:id,p_expected_revision:1,p_expected_generation:0,p_request_id:key,p_action:"publish"});
  mocks.abort.mockResolvedValue({data:{...live,generation:2},error:null,status:200});
  await expect(changePublication(req,signal)).rejects.toMatchObject({kind:"unavailable"});
});
