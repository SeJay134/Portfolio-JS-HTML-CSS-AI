import {expect,it} from "vitest";
import {newDraft,newBlock,previewPost,mediaReferenceCount,type StudioDraft} from "../../../src/data/blogStudio";
import {decodeDraft} from "../../../src/data/blogDraftRepository";
const id="99000000-0000-0000-0000-000000000001",bid="99000000-0000-0000-0000-000000000002";
const image={assetId:id,alt:"Alt",caption:"Caption"};
const v1=newDraft(id,bid);
const v2:StudioDraft={...v1,version:2,cover:image,blocks:[{...newBlock(bid,"image"),images:[image]}]};
it("preserves v1 exactly and decodes v2 cover and image",()=>{
 expect(decodeDraft(v1)).toEqual(v1);expect(decodeDraft(v2)).toEqual(v2);
 expect(mediaReferenceCount(v2)).toBe(2);
 expect(previewPost(v2).privateMedia).toEqual({cover:image,blocks:{0:[image]}});
});
it("rejects malformed media and v1 media fields",()=>{
 for(const doc of [{...v2,version:1},{...v2,cover:{...image,assetId:"https://example.com"}},{...v2,cover:{...image,alt:"a".repeat(501)}},
  {...v2,blocks:[{...v2.blocks[0],kind:"gallery",images:[image,image]}]},
  {...v2,blocks:[{...v2.blocks[0],text:"hidden"}]},
  {...v2,blocks:Array.from({length:20},(_,i)=>({...v2.blocks[0],id:"99000000-0000-0000-0000-"+String(i+100).padStart(12,"0")}))}])
  expect(()=>decodeDraft(doc)).toThrow();
});
