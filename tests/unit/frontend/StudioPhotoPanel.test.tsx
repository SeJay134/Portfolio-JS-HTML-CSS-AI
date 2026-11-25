import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { StudioPhotoPanel } from "../../../src/components/StudioPhotoPanel";
const mocks = vi.hoisted(() => ({ load: vi.fn(), screen: vi.fn(), compress: vi.fn(), zip: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock("../../../src/lib/contentSafety", () => ({ loadSafetyModel: mocks.load, screenImage: mocks.screen, MAX_BATCH_FILES: 300, MAX_INPUT_IMAGE_BYTES: 25 * 1024 * 1024 }));
vi.mock("../../../src/lib/photoCompressor", async original => ({
  ...await original<typeof import("../../../src/lib/photoCompressor")>(), compressImage: mocks.compress, createZip: mocks.zip,
}));
beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue({});
  mocks.screen.mockReset().mockResolvedValue(false);
  mocks.compress.mockReset().mockResolvedValue({ width: 96, height: 96, blob: new Blob(["jpeg"], { type: "image/jpeg" }) });
  mocks.zip.mockReset().mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
  mocks.create.mockReset().mockReturnValue("blob:studio-fixture");
  mocks.revoke.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: mocks.create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: mocks.revoke });
});
const choose = (...names: string[]) => fireEvent.change(screen.getByLabelText("Choose photos"), {
  target: { files: names.map(name => new File(["fixture"], name, { type: "image/png" })) },
});
const confirm = () => userEvent.setup().click(screen.getByRole("checkbox", { name: /I confirm/ }));
it("requires policy confirmation, previews and downloads only ready files, revokes URLs on clear", async () => {
  mocks.screen.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const user = userEvent.setup();
  render(<StudioPhotoPanel />);
  choose("blocked.png","safe.png");
  expect(screen.getByRole("button", { name: "Compress photos" })).toBeDisabled();
  await confirm();
  await user.click(screen.getByRole("button", { name: "Compress photos" }));
  await screen.findByText(/Batch complete/);
  expect(mocks.compress).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Preview blocked.png" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Preview safe.png" }));
  expect(await screen.findByRole("img", { name: "Compressed preview: safe.jpg" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Prepare ZIP" }));
  await screen.findByRole("link", { name: "Download ZIP" });
  expect(mocks.zip.mock.calls[0][0]).toHaveLength(1);
  expect(screen.getByLabelText("Max size per photo (KB)")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Clear photo batch" }));
  expect(screen.queryByRole("link", { name: "Download ZIP" })).not.toBeInTheDocument();
  expect(mocks.revoke).toHaveBeenCalled();
  expect(screen.getByRole("checkbox", { name: /I confirm/ })).not.toBeChecked();
});
it("retries failed files, cancels pending work, does not expose cancelled result", async () => {
  const user = userEvent.setup();
  mocks.screen.mockRejectedValueOnce(new Error("bad file"));
  render(<StudioPhotoPanel />);
  choose("retry.png");
  await confirm();
  await user.click(screen.getByRole("button", { name: "Compress photos" }));
  await screen.findByRole("button", { name: "Retry retry.png" });
  let finish!: (value: boolean) => void;
  mocks.screen.mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; }));
  await user.click(screen.getByRole("button", { name: "Retry retry.png" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  await user.click(screen.getByRole("button", { name: "Cancel compression" }));
  await act(async () => finish(false));
  expect(await screen.findByText(/Cancelled. Completed photos/)).toBeVisible();
  expect(within(screen.getByRole("list", { name: "Photo queue" })).getByText(/Cancelled ·/)).toBeVisible();
  expect(mocks.compress).not.toHaveBeenCalled();
});
it("aborts the active screen and releases preview resources on unmount", async () => {
  const user = userEvent.setup();
  let signal: AbortSignal | undefined;
  let finish!: (value: boolean) => void;
  mocks.screen.mockImplementationOnce((_file, _model, s: AbortSignal) => { signal = s; return new Promise<boolean>(resolve => { finish = resolve; }); });
  const view = render(<StudioPhotoPanel />);
  choose("safe.png"); await confirm();
  await user.click(screen.getByRole("button", { name: "Compress photos" }));
  await waitFor(() => expect(signal).toBeDefined());
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(false));
  expect(mocks.compress).not.toHaveBeenCalled();
});
