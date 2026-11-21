import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoCompressorPage } from "../../../src/components/PhotoCompressorPage";

const mocks = vi.hoisted(() => ({
  loadSafetyModel: vi.fn(),
  screenImage: vi.fn(),
  compressImage: vi.fn(),
  createZip: vi.fn(),
}));
vi.mock("../../../src/lib/contentSafety", () => ({
  loadSafetyModel: mocks.loadSafetyModel,
  screenImage: mocks.screenImage,
  MAX_BATCH_FILES: 300,
}));
vi.mock("../../../src/lib/photoCompressor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/photoCompressor")>();
  return { ...actual, compressImage: mocks.compressImage, createZip: mocks.createZip };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSafetyModel.mockResolvedValue({ classify: vi.fn() });
  mocks.screenImage.mockResolvedValue(false);
  mocks.compressImage.mockResolvedValue({
    blob: new Blob(["safe"], { type: "image/jpeg" }), sourceBytes: 4,
  });
  mocks.createZip.mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true, value: vi.fn(() => "blob:photo-output"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true, value: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }),
  });
});

function selectPhotos(names: string[]) {
  const input = document.querySelector<HTMLInputElement>("#photo-files");
  if (!input) throw new Error("File input not found");
  fireEvent.change(input, {
    target: { files: names.map(name => new File(["data"], name, { type: "image/png" })) },
  });
}

describe("photo compressor adult-content gating", () => {
  it("excludes blocked photos before compression, with no ZIP when all are blocked", async () => {
    mocks.screenImage.mockResolvedValue(true);
    render(<PhotoCompressorPage />);
    selectPhotos(["blocked.png"]);
    await userEvent.setup().click(screen.getByRole("button", { name: /Compress photos/ }));
    await waitFor(() => expect(screen.getByText(/No photos passed the adult-content check/)).toBeInTheDocument());
    expect(mocks.screenImage).toHaveBeenCalledTimes(1);
    expect(mocks.compressImage).not.toHaveBeenCalled();
    expect(mocks.createZip).not.toHaveBeenCalled();
    expect(screen.getByText(/1 adult-content photo\(s\) blocked/)).toBeInTheDocument();
  });

  it("does not compress anything when the local safety model cannot load", async () => {
    mocks.loadSafetyModel.mockRejectedValue(new Error("Safety filter is unavailable"));
    render(<PhotoCompressorPage />);
    selectPhotos(["safe.png"]);
    await userEvent.setup().click(screen.getByRole("button", { name: /Compress photos/ }));
    await waitFor(() => expect(screen.getByText("Safety filter is unavailable")).toBeInTheDocument());
    expect(mocks.screenImage).not.toHaveBeenCalled();
    expect(mocks.compressImage).not.toHaveBeenCalled();
    expect(mocks.createZip).not.toHaveBeenCalled();
  });

  it("only adds verified safe photos to the ZIP when a batch contains blocked photos", async () => {
    mocks.screenImage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    render(<PhotoCompressorPage />);
    selectPhotos(["adult.png", "safe.png"]);
    await userEvent.setup().click(screen.getByRole("button", { name: /Compress photos/ }));
    await waitFor(() => expect(screen.getByText(/Completed: 1 blocked/)).toBeInTheDocument());
    expect(mocks.screenImage).toHaveBeenCalledTimes(2);
    expect(mocks.compressImage).toHaveBeenCalledTimes(1);
    expect(mocks.compressImage.mock.calls[0][0].name).toBe("safe.png");
    expect(mocks.createZip).toHaveBeenCalledTimes(1);
    expect(mocks.createZip.mock.calls[0][0]).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Download ZIP/ })).toBeInTheDocument();
  });
});
