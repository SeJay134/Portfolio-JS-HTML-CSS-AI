import {expect,it} from "vitest";
import {decodeLibrary} from "../../../src/lib/studioMediaLibrary";
const row={id:"99000000-0000-0000-0000-000000000001",state:"verified",created_at:"2026-11-25T00:00:00Z",expires_at:"2026-11-25T01:00:00Z",byte_size:500,width:96,height:64,sha256:"a".repeat(64)};
it("accepts bounded verified metadata and omits arbitrary fields",()=>{
 expect(decodeLibrary([{...row,owner_id:"secret",object_key:"private"}])).toEqual([row]);
});
it("rejects duplicates, oversized or malformed metadata",()=>{
 for(const input of [[row,row],[{...row,width:2201}],[{...row,sha256:"x"}],[{...row,state:"reserved"}],Array(21).fill(row),{}])
   expect(()=>decodeLibrary(input)).toThrow();
});
it("accepts reserved and rejected slots without verified bytes",()=>{
 for(const state of ["reserved","rejected"]){
   const pending={...row,state,byte_size:null,width:null,height:null,sha256:null};
   expect(decodeLibrary([pending])).toEqual([pending]);
 }
});
