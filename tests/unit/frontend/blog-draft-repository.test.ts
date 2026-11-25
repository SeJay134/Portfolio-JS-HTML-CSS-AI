import { afterEach, describe, expect, it, vi } from "vitest";
import { newDraft } from "../../../src/data/blogStudio";
import { decodeDraft, decodeSavedDraft, saveDraft, listDrafts, DraftError } from "../../../src/data/blogDraftRepository";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock("../../../src/lib/supabase", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
const id = "96000000-0000-0000-0000-000000000001";
const blockId = "97000000-0000-0000-0000-000000000001";
const key = "98000000-0000-0000-0000-000000000001";
const timestamp = "2026-11-25T00:00:00Z";
const doc = () => newDraft(id, blockId);
afterEach(() => { vi.unstubAllEnvs(); mocks.rpc.mockReset(); mocks.abortSignal.mockReset(); });
describe("private draft repository", () => {
  it("validates version, fields, IDs and safe links", () => {
    expect(decodeDraft(doc())).toEqual(doc());
    expect(() => decodeDraft({ ...doc(), version: 2 })).toThrow();
    expect(() => decodeDraft({ ...doc(), owner_id: id })).toThrow();
    expect(() => decodeDraft({ ...doc(), slug: "../private" })).toThrow();
    const draft = doc();
    draft.blocks[0].runs[0].href = "javascript:alert(1)";
    expect(() => decodeDraft(draft)).toThrow();
    const duplicated = doc();
    duplicated.blocks.push(duplicated.blocks[0]);
    expect(() => decodeDraft(duplicated)).toThrow();
  });
  it("rejects mismatched stored document IDs and revisions", () => {
    const value = { id, revision: 1, updated_at: timestamp, document: doc() };
    expect(decodeSavedDraft(value, id, 1)).toEqual(value);
    expect(() => decodeSavedDraft(value, blockId)).toThrow();
    expect(() => decodeSavedDraft(value, id, 2)).toThrow();
  });
  it("uses only the narrow save RPC and verifies receipt", async () => {
    vi.stubEnv("VITE_ENABLE_BLOG_DRAFTS", "true");
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
    mocks.abortSignal.mockResolvedValue({ data: { id, revision: 1, updated_at: timestamp }, error: null, status: 200 });
    const signal = new AbortController().signal;
    expect(await saveDraft({ document: doc(), expected: 0, key }, signal)).toEqual({ id, revision: 1, updated_at: timestamp });
    expect(mocks.rpc).toHaveBeenCalledWith("save_studio_draft", { p_id: id, p_expected_revision: 0, p_request_id: key, p_document: doc() });
    mocks.abortSignal.mockResolvedValueOnce({ data: { id, revision: 2, updated_at: timestamp }, error: null, status: 200 });
    await expect(saveDraft({ document: doc(), expected: 0, key }, signal)).rejects.toBeInstanceOf(DraftError);
  });
  it("fails closed with flag disabled or aborted signal", async () => {
    vi.stubEnv("VITE_ENABLE_BLOG_DRAFTS", "false");
    await expect(listDrafts(new AbortController().signal)).rejects.toThrow("unavailable");
    vi.stubEnv("VITE_ENABLE_BLOG_DRAFTS", "true");
    const controller = new AbortController(); controller.abort();
    await expect(listDrafts(controller.signal)).rejects.toThrow("unavailable");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["40001",409,"conflict"],["42501",403,"denied"],["22023",400,"invalid"],["23505",409,"invalid"],["XX000",500,"unavailable"]])("maps error %s without disclosing server details", async (code,status,kind) => {
    vi.stubEnv("VITE_ENABLE_BLOG_DRAFTS", "true");
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
    mocks.abortSignal.mockResolvedValue({ error: { code, message: "secret database details" }, status });
    await expect(listDrafts(new AbortController().signal)).rejects.toMatchObject({ kind });
  });
});
