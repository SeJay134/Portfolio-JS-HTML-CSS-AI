import { beforeEach, expect, it, vi } from "vitest";
import { selectStudioPhotos, processStudioPhotos, type PhotoItem } from "../../../src/lib/studioPhotoBatch";
const mocks = vi.hoisted(() => ({ load: vi.fn(), screen: vi.fn(), compress: vi.fn() }));
vi.mock("../../../src/lib/contentSafety", () => ({
  loadSafetyModel: mocks.load, screenImage: mocks.screen, MAX_BATCH_FILES: 300, MAX_INPUT_IMAGE_BYTES: 25 * 1024 * 1024,
}));
vi.mock("../../../src/lib/photoCompressor", async original => ({
  ...await original<typeof import("../../../src/lib/photoCompressor")>(), compressImage: mocks.compress,
}));
const file = (name = "photo.png") => new File(["synthetic"], name, { type: "image/png" });
function selection(files: File[]) { let i = 0; return selectStudioPhotos(files, () => String(++i)); }
async function process(items: PhotoItem[], signal = new AbortController().signal, ids = items.map(item => item.id)) {
  await processStudioPhotos(items, new Set(ids), 300000, signal, (id, changes) => {
    Object.assign(items.find(item => item.id === id)!, changes);
  });
}
beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue({});
  mocks.screen.mockReset().mockResolvedValue(false);
  mocks.compress.mockReset().mockImplementation(async (input: File) => ({
    name: input.name, sourceBytes: input.size, width: 96, height: 96,
    blob: new Blob(["synthetic JPEG"], { type: "image/jpeg" }),
  }));
});
it("selects at most 300 supported nonempty files and rejects SVG and oversize", () => {
  const oversized = file("large.png");
  Object.defineProperty(oversized, "size", { value: 26 * 1024 * 1024 });
  const { items, rejected } = selection([oversized, file("bad.svg"), new File([], "empty.png", { type: "image/png" }),
    ...Array.from({ length: 301 }, () => file())]);
  expect(items).toHaveLength(300);
  expect(rejected).toBe(4);
});
it("bounds total selected input bytes", () => {
  const files = Array.from({ length: 50 }, () => {
    const input = file(); Object.defineProperty(input, "size", { value: 25 * 1024 * 1024 }); return input;
  });
  expect(selection(files).items).toHaveLength(40);
});
it("screens and compresses 105 photos sequentially, releases originals, gives unique output names", async () => {
  const { items } = selection(Array.from({ length: 105 }, () => file()));
  await process(items);
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(mocks.screen).toHaveBeenCalledTimes(105);
  expect(mocks.compress).toHaveBeenCalledTimes(105);
  expect(items.every(item => item.state === "ready" && item.file === null && item.result!.blob.size <= 300000)).toBe(true);
  expect(new Set(items.map(item => item.result!.outputName)).size).toBe(105);
  expect(mocks.compress.mock.calls.every(call => call[1] === 300000)).toBe(true);
});
it("fails closed for flagged, unverified, failed and oversized output; retries only eligible files", async () => {
  const { items } = selection(Array.from({ length: 5 }, (_, i) => file(i + ".png")));
  mocks.screen.mockResolvedValueOnce(true).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("decoder"));
  mocks.compress.mockResolvedValueOnce({ width: 96, height: 96, blob: new Blob([new Uint8Array(300001)], { type: "image/jpeg" }) });
  await process(items);
  expect(items.map(item => item.state)).toEqual(["blocked","failed","failed","failed","ready"]);
  expect(mocks.compress).toHaveBeenCalledTimes(2);
  expect(items[0].file).toBeNull();
  await process(items, undefined, [items[0].id,items[1].id]);
  expect(items[0].state).toBe("blocked");
  expect(items[1].state).toBe("ready");
  expect(mocks.compress).toHaveBeenCalledTimes(3);
});
it("does not compress anything if model loading fails", async () => {
  mocks.load.mockRejectedValue(new Error("private detail"));
  const { items } = selection([file()]);
  await expect(process(items)).rejects.toThrow("On-device safety filter unavailable");
  expect(mocks.screen).not.toHaveBeenCalled();
  expect(mocks.compress).not.toHaveBeenCalled();
});
it("ignores a codec result after cancellation", async () => {
  const { items } = selection([file(),file()]);
  const controller = new AbortController();
  mocks.compress.mockImplementationOnce(async () => {
    controller.abort();
    return { width: 96, height: 96, blob: new Blob(["jpeg"], { type: "image/jpeg" }) };
  });
  await process(items, controller.signal);
  expect(items.every(item => !item.result)).toBe(true);
  expect(mocks.screen).toHaveBeenCalledTimes(1);
});
it("does not accept a non-JPEG or invalid dimension result", async () => {
  const { items } = selection([file(),file()]);
  mocks.compress.mockResolvedValueOnce({ width: 96, height: 96, blob: new Blob(["png"], { type: "image/png" }) })
    .mockResolvedValueOnce({ width: 2201, height: 96, blob: new Blob(["jpeg"], { type: "image/jpeg" }) });
  await process(items);
  expect(items.map(item => item.state)).toEqual(["failed","failed"]);
});
