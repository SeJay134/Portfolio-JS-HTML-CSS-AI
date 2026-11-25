import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStudioDrafts, AUTOSAVE_MS } from "../../../src/hooks/useStudioDrafts";
import { newDraft } from "../../../src/data/blogStudio";
import { DraftError } from "../../../src/data/blogDraftRepository";

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), save: vi.fn(), history: vi.fn() }));
vi.mock("../../../src/data/blogDraftRepository", async original => ({
  ...await original<typeof import("../../../src/data/blogDraftRepository")>(),
  listDrafts: mocks.list, getDraft: mocks.get, saveDraft: mocks.save, listRevisions: mocks.history
}));
const doc = newDraft("96000000-0000-0000-0000-000000000001","97000000-0000-0000-0000-000000000001");
const receipt = { id: doc.id, revision: 1, updated_at: "2026-11-25T00:00:00Z" };
beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue([]);
  mocks.get.mockReset();
  mocks.save.mockReset().mockResolvedValue(receipt);
  mocks.history.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
it("retries uncertain save with exact request and preserves edits until confirmed", async () => {
  const { result } = renderHook(() => useStudioDrafts(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.setDrafts([doc]));
  mocks.save.mockRejectedValueOnce(new DraftError("unavailable","Network interrupted"));
  await act(async () => result.current.save(doc, true));
  const first = mocks.save.mock.calls[0][0];
  expect(result.current.dirty).toBe(true);
  const edited = { ...doc, title: "Newer edits" };
  act(() => result.current.setDrafts([edited]));
  await act(async () => result.current.save(edited, true));
  expect(mocks.save.mock.calls[1][0]).toEqual(first);
  expect(result.current.saved[doc.id].document).toEqual(doc);
  expect(result.current.dirty).toBe(true);
  mocks.save.mockResolvedValueOnce({ ...receipt, revision: 2 });
  await act(async () => result.current.save(edited, true));
  expect(mocks.save.mock.calls[2][0]).toMatchObject({ expected: 1, document: edited });
  expect(result.current.dirty).toBe(false);
});
it("blocks stale writes until explicit reload", async () => {
  const { result } = renderHook(() => useStudioDrafts(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.setDrafts([doc]));
  mocks.save.mockRejectedValueOnce(new DraftError("conflict","Conflict"));
  await act(async () => result.current.save(doc, true));
  await act(async () => result.current.save(doc, true));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  const latest = { ...doc, title: "Latest" };
  mocks.get.mockResolvedValueOnce({ ...receipt, document: latest });
  await act(async () => result.current.reload(doc));
  expect(result.current.drafts).toEqual([latest]);
  expect(result.current.dirty).toBe(false);
});
it("clears private state when server denies access", async () => {
  const { result } = renderHook(() => useStudioDrafts(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.setDrafts([doc]));
  mocks.save.mockRejectedValueOnce(new DraftError("denied","Denied"));
  await act(async () => result.current.save(doc, true));
  expect(result.current.denied).toBe(true);
  expect(result.current.drafts).toEqual([]);
  expect(result.current.saved).toEqual({});
});
it("autosaves after idle time and never repeats an unchanged revision", async () => {
  const { result } = renderHook(() => useStudioDrafts(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  vi.useFakeTimers();
  act(() => result.current.setDrafts([doc]));
  await act(async () => vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1));
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(result.current.dirty).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2));
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
