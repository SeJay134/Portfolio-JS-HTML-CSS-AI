import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioPublicationPanel } from "../../../src/components/StudioPublicationPanel";
import { newDraft } from "../../../src/data/blogStudio";
import { DraftError } from "../../../src/data/blogDraftRepository";
const mock = vi.hoisted(() => ({ get: vi.fn(), change: vi.fn() }));
vi.mock("../../../src/data/blogDraftRepository", async importOriginal => ({
  ...await importOriginal<typeof import("../../../src/data/blogDraftRepository")>(),
  getPublication: mock.get, changePublication: mock.change,
}));
const draft = newDraft("96000000-0000-0000-0000-000000000001","97000000-0000-0000-0000-000000000001");
const empty = { generation: 0, source_revision: null, status: "draft", slug: null, published_at: null };
const published = { generation: 1, source_revision: 1, status: "published", slug: "fixture", published_at: "2026-11-25T00:00:00Z" };
const deny = vi.fn();
beforeEach(() => { mock.get.mockReset().mockResolvedValue(empty); mock.change.mockReset(); deny.mockReset(); vi.spyOn(window,"confirm").mockReturnValue(true); });
afterEach(() => vi.restoreAllMocks());
it("blocks publish for unsaved edits, confirms clean publish, reads live status", async () => {
  const view = render(<StudioPublicationPanel draft={draft} revision={1} dirty blocked={false} onDenied={deny}/>);
  expect(await screen.findByRole("button",{name:/^Publish$/})).toBeDisabled();
  view.rerender(<StudioPublicationPanel draft={draft} revision={1} dirty={false} blocked={false} onDenied={deny}/>);
  mock.change.mockResolvedValue(published); mock.get.mockResolvedValue(published);
  fireEvent.click(screen.getByRole("button",{name:/^Publish$/}));
  await screen.findByRole("link",{name:"View published article"});
  expect(mock.change.mock.calls[0][0]).toMatchObject({draftId:draft.id,revision:1,generation:0,action:"publish"});
  expect(screen.getByRole("button",{name:"Unpublish"})).toBeEnabled();
});
it("retries uncertain mutation with identical request and fetches live state", async () => {
  mock.change.mockRejectedValueOnce(new DraftError("unavailable","secret"));
  render(<StudioPublicationPanel draft={draft} revision={1} dirty={false} blocked={false} onDenied={deny}/>);
  fireEvent.click(await screen.findByRole("button",{name:/^Publish$/}));
  const retry = await screen.findByRole("button",{name:"Retry publication request"});
  expect(screen.getByRole("button",{name:/^Publish$/})).toBeDisabled();
  mock.change.mockResolvedValue(published); mock.get.mockResolvedValue(published);
  fireEvent.click(retry);
  await screen.findByRole("link",{name:"View published article"});
  expect(mock.change.mock.calls[1][0]).toEqual(mock.change.mock.calls[0][0]);
});
it("clears stale state on conflict and invokes denial callback", async () => {
  mock.change.mockRejectedValue(new DraftError("conflict","secret"));
  render(<StudioPublicationPanel draft={draft} revision={1} dirty={false} blocked={false} onDenied={deny}/>);
  fireEvent.click(await screen.findByRole("button",{name:/^Publish$/}));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button",{name:/^Publish$/})).not.toBeInTheDocument();
  mock.get.mockRejectedValue(new DraftError("denied","secret"));
  fireEvent.click(screen.getByRole("button",{name:"Refresh publication status"}));
  await waitFor(() => expect(deny).toHaveBeenCalledTimes(1));
});
