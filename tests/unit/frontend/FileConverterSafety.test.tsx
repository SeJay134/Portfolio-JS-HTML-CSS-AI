import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileConverterPage } from "../../../src/components/FileConverterPage";

const mocks = vi.hoisted(() => ({
  loadSafetyModel: vi.fn(),
  screenImage: vi.fn(),
  convertFile: vi.fn(),
  detectFileFormat: vi.fn(),
}));
vi.mock("../../../src/lib/contentSafety", () => ({
  loadSafetyModel: mocks.loadSafetyModel,
  screenImage: mocks.screenImage,
}));
vi.mock("../../../src/lib/fileConverter", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../src/lib/fileConverter")>();
  return { ...real, convertFile: mocks.convertFile };
});
vi.mock("../../../src/lib/fileFormats", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../src/lib/fileFormats")>();
  return { ...real, detectFileFormat: mocks.detectFileFormat };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSafetyModel.mockResolvedValue({ classify: vi.fn() });
  mocks.screenImage.mockResolvedValue(false);
  mocks.detectFileFormat.mockImplementation(async (file: File) =>
    file.name.endsWith(".png") ? "png" : "txt",
  );
  mocks.convertFile.mockResolvedValue(new Blob(["safe"], { type: "image/jpeg" }));
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true, value: vi.fn(() => "blob:converted-output"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true, value: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true, value: vi.fn().mockReturnValue({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }),
  });
});

function chooseFile(file: File) {
  const input = document.querySelector<HTMLInputElement>("#converter-files");
  if (!input) throw new Error("Missing converter file input");
  fireEvent.change(input, { target: { files: [file] } });
}

describe("file converter image content policy", () => {
  it("blocks adult images before conversion", async () => {
    mocks.screenImage.mockResolvedValue(true);
    render(<FileConverterPage />);
    chooseFile(new File(["data"], "adult.png", { type: "image/png" }));
    await screen.findByText("1 selected");
    await userEvent.setup().click(screen.getByRole("button", { name: /Convert files/ }));
    await waitFor(() => expect(screen.getByText(/No images passed the adult-content check/)).toBeInTheDocument());
    expect(mocks.screenImage).toHaveBeenCalledTimes(1);
    expect(mocks.convertFile).not.toHaveBeenCalled();
    expect(screen.getByText(/1 adult-content image\(s\) blocked/)).toBeInTheDocument();
  });

  it("fails closed when the safety model is unavailable for image conversion", async () => {
    mocks.loadSafetyModel.mockRejectedValue(new Error("Safety model unavailable"));
    render(<FileConverterPage />);
    chooseFile(new File(["data"], "photo.png", { type: "image/png" }));
    await screen.findByText("1 selected");
    await userEvent.setup().click(screen.getByRole("button", { name: /Convert files/ }));
    await waitFor(() => expect(screen.getByText("Safety model unavailable")).toBeInTheDocument());
    expect(mocks.convertFile).not.toHaveBeenCalled();
  });

  it("does not require an image classifier for ordinary text files", async () => {
    render(<FileConverterPage />);
    await userEvent.setup().selectOptions(screen.getByLabelText("From format"), "txt");
    chooseFile(new File(["notes"], "notes.txt", { type: "text/plain" }));
    await screen.findByText("1 selected");
    await userEvent.setup().click(screen.getByRole("button", { name: /Convert files/ }));
    await waitFor(() => expect(screen.getByText("Your converted files are ready.")).toBeInTheDocument());
    expect(mocks.loadSafetyModel).not.toHaveBeenCalled();
    expect(mocks.convertFile).toHaveBeenCalledTimes(1);
  });
});
