import React, { useEffect, useRef, useState } from "react";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";
import { useTheme } from "../hooks/useTheme";
import {
  compressImage,
  createZip,
  DEFAULT_TARGET_KB,
  formatBytes,
  isImageFile,
  targetBytes,
  uniqueJpegName,
  type ZipEntry,
} from "../lib/photoCompressor";

type Download = {
  url: string;
  count: number;
  sourceBytes: number;
  outputBytes: number;
};
type Failure = { name: string; reason: string };

export function PhotoCompressorPage() {
  const { theme, selectTheme } = useTheme();
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const downloadUrl = useRef<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState(0);
  const [limit, setLimit] = useState(String(DEFAULT_TARGET_KB));
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState("");
  const [failures, setFailures] = useState<Failure[]>([]);
  const [download, setDownload] = useState<Download | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, []);
  useEffect(() => {
    const original = document.body.style.overflow;
    if (menu) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [menu]);

  function clearDownload() {
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = null;
    setDownload(null);
    setMessage("");
    setFailures([]);
    setProcessed(0);
  }

  function chooseFiles(selected: FileList | null) {
    clearDownload();
    const collection = Array.from(selected ?? []);
    const valid = collection.filter(isImageFile);
    setRejected(collection.length - valid.length);
    setFiles(valid);
  }

  async function processBatch() {
    if (!files.length || busy) return;
    let maxBytes: number;
    try {
      maxBytes = targetBytes(limit);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid target size.");
      return;
    }
    clearDownload();
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const entries: ZipEntry[] = [];
    const used = new Set<string>();
    const failed: Failure[] = [];
    let sourceBytes = 0;
    let outputBytes = 0;
    try {
      for (let index = 0; index < files.length; index++) {
        if (controller.signal.aborted) break;
        const file = files[index];
        setCurrent(file.name);
        try {
          const result = await compressImage(file, maxBytes, controller.signal);
          if (controller.signal.aborted) break;
          entries.push({ name: uniqueJpegName(file.name, used), blob: result.blob });
          sourceBytes += result.sourceBytes;
          outputBytes += result.blob.size;
        } catch (error) {
          if (controller.signal.aborted) break;
          failed.push({
            name: file.name,
            reason: error instanceof Error ? error.message : "Could not process this file.",
          });
        }
        setProcessed(index + 1);
      }
      setFailures(failed);
      if (controller.signal.aborted) {
        setMessage("Cancelled. The original photos were not modified.");
      } else if (entries.length) {
        setCurrent("Preparing ZIP archive…");
        const zip = await createZip(entries);
        if (!controller.signal.aborted) {
          const url = URL.createObjectURL(zip);
          downloadUrl.current = url;
          setDownload({ url, count: entries.length, sourceBytes, outputBytes });
          setMessage(
            failed.length
              ? "Completed with " + failed.length + " skipped file(s)."
              : "Your photos are ready to download.",
          );
        }
      } else {
        setMessage("None of the selected images could be compressed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Compression failed.");
    } finally {
      abortRef.current = null;
      setCurrent("");
      setBusy(false);
    }
  }

  const originalBytes = files.reduce((total, file) => total + file.size, 0);
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <div className="header-left">
            <button
              ref={menuButton}
              className="menu-button"
              aria-expanded={menu}
              aria-controls="navigation-drawer"
              onClick={() => setMenu(true)}
            >
              <Icon name="menu" /><span>Menu</span>
            </button>
            <a className="wordmark" href="/" aria-label="Sergei Patrushev, home">
              SP<span>.</span>
            </a>
          </div>
          <span className="header-caption">Software developer / Data & AI</span>
          <div className="header-actions">
            <label htmlFor="compressor-theme" className="sr-only">Color theme</label>
            <select id="compressor-theme" value={theme} onChange={(event) => selectTheme(event.target.value)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <a className="header-contact" href="/#Connect">
              Let's talk <Icon name="arrow" size={16} />
            </a>
          </div>
        </div>
      </header>
      <Drawer
        open={menu}
        active={undefined}
        sectionHrefPrefix="/"
        onClose={(reason) => {
          setMenu(false);
          if (reason === "dismiss") requestAnimationFrame(() => menuButton.current?.focus());
        }}
      />
      <main id="main" className="compressor-page" tabIndex={-1}>
        <section className="section compressor-intro">
          <p className="eyebrow"><span className="status-dot" /> Web tools / 01</p>
          <h1>Make your photos <span className="serif-accent">lighter</span><span className="accent">.</span></h1>
          <p className="compressor-lead">
            Compress hundreds of photos in one batch. Set a maximum size for each
            JPEG, then download them together as a ZIP.
          </p>
          <div className="compressor-pills" aria-label="Key features">
            <span>Private, in your browser</span>
            <span>iPhone-friendly</span>
            <span>100+ photos</span>
          </div>
        </section>
        <section className="section compressor-workspace" aria-label="Photo compressor">
          <div className="compressor-panel">
            <p className="eyebrow">01 / Select photos</p>
            <label className="compressor-picker" htmlFor="photo-files">
              <span className="compressor-picker-symbol" aria-hidden="true">+</span>
              <strong>Choose photos</strong>
              <span>JPG, PNG, HEIC, WebP and other browser-supported images</span>
            </label>
            <input
              id="photo-files"
              className="sr-only compressor-file-input"
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              disabled={busy}
              onChange={(event) => {
                chooseFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            <p className="compressor-note">
              Photos are processed on your device. They are not uploaded to the portfolio server.
              Animated images are exported as a single still frame. HEIC support depends on the browser.
            </p>
            <div className="compressor-selection" aria-live="polite">
              <strong>{files.length} selected</strong>
              <span>{formatBytes(originalBytes)} total</span>
            </div>
            {rejected > 0 && <p className="compressor-warning" role="status">
              {rejected} unsupported file(s) were excluded.
            </p>}
            <div className="compressor-rule" />
            <p className="eyebrow">02 / Set a target</p>
            <div className="compressor-size-row">
              <div>
                <label htmlFor="target-size">Max size per photo (KB)</label>
                <p>For example, 300 KB per JPG.</p>
              </div>
              <input
                id="target-size"
                type="number"
                min="20"
                max="5000"
                step="1"
                inputMode="numeric"
                value={limit}
                disabled={busy}
                aria-describedby="target-help"
                onChange={(event) => {
                  clearDownload();
                  setLimit(event.target.value);
                }}
              />
            </div>
            <p id="target-help" className="compressor-note">
              The size is a maximum, not an exact amount. Higher compression can reduce
              image resolution and detail. Originals stay unchanged.
            </p>
            <div className="compressor-actions">
              <button
                type="button"
                className="button primary"
                disabled={busy || files.length === 0}
                onClick={() => void processBatch()}
              >
                Compress photos <Icon name="arrow" size={18} />
              </button>
              {busy && <button type="button" className="button secondary" onClick={() => abortRef.current?.abort()}>
                Cancel
              </button>}
            </div>
          </div>
          <aside className="compressor-summary">
            <p className="eyebrow">03 / Your results</p>
            <h2>Ready when <span className="serif-accent">you are.</span></h2>
            <p>Each file is individually optimized. Photos that cannot be decoded are skipped,
              so the rest of the batch can finish.</p>
            {busy && (
              <div className="compressor-progress" role="status" aria-live="polite">
                <span>Processing {processed} of {files.length}</span>
                <progress value={processed} max={files.length || 1} />
                <small>{current}</small>
              </div>
            )}
            {message && <p className="compressor-result-status" role="status">{message}</p>}
            {download && (
              <div className="compressor-result">
                <div><span>Compressed files</span><strong>{download.count}</strong></div>
                <div><span>Before</span><strong>{formatBytes(download.sourceBytes)}</strong></div>
                <div><span>After</span><strong>{formatBytes(download.outputBytes)}</strong></div>
                <a className="button primary" href={download.url} download="compressed-photos.zip">
                  Download ZIP <Icon name="arrow" size={18} />
                </a>
                <p className="compressor-note">On iPhone, look in Files → Downloads to unzip.</p>
              </div>
            )}
            {!!failures.length && (
              <details className="compressor-errors">
                <summary>{failures.length} skipped file(s)</summary>
                <ul>{failures.map((item, index) => (
                  <li key={item.name + index}>{item.name}: {item.reason}</li>
                ))}</ul>
              </details>
            )}
            {!busy && !download && !message && (
              <p className="compressor-empty">Select photos and press Compress photos to get started.</p>
            )}
          </aside>
        </section>
        <div className="compressor-return">
          <a className="text-link" href="/#Projects">Back to portfolio <Icon name="arrow" size={16} /></a>
        </div>
      </main>
      <footer className="site-footer">
        <a className="wordmark" href="/" aria-label="Back to portfolio">SP<span>.</span></a>
        <p>© {new Date().getFullYear()} Sergei Patrushev</p>
        <a href="/">Back to portfolio ↑</a>
      </footer>
    </>
  );
}
