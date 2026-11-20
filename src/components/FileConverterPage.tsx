import React, { useEffect, useRef, useState } from "react";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";
import { useTheme } from "../hooks/useTheme";
import { createZip, formatBytes, type ZipEntry } from "../lib/photoCompressor";
import { convertFile } from "../lib/fileConverter";
import {
  detectFileFormat, FORMAT_LABELS, type FileFormat, INPUT_FORMATS,
  INVALID_FILE_MESSAGE, MAX_BATCH_FILES, OUTPUT_FORMATS,
  uniqueOutputName,
} from "../lib/fileFormats";

type Failure = { name: string; reason: string };
type Download = { url: string; name: string; count: number; sourceBytes: number; outputBytes: number };
const acceptList: Record<FileFormat, string> = {
  png: ".png", jpg: ".jpg,.jpeg", webp: ".webp", pdf: ".pdf",
  docx: ".docx", xlsx: ".xlsx", csv: ".csv", txt: ".txt",
};
const notes: Record<FileFormat, string> = {
  png: "PNG images can be converted to JPEG, WebP or a single-page PDF.",
  jpg: "JPEG images can be converted to PNG, WebP or a single-page PDF.",
  webp: "WebP images can be converted to PNG, JPEG or a single-page PDF.",
  pdf: "PDF to TXT/Word extracts basic text only. Scans, complex encodings and encrypted PDFs need dedicated software or OCR; original formatting is not preserved.",
  docx: "Word conversion extracts paragraphs, not the original layout, images or page styling.",
  xlsx: "Excel conversion exports the first worksheet's displayed/cached values; formulas, formatting and charts are not preserved.",
  csv: "CSV uses UTF-8 and comma separators. Formulas are kept as text when creating Excel files.",
  txt: "Text must be UTF-8. PDF exports are image-based previews, not searchable text documents.",
};

export function FileConverterPage() {
  const { theme, selectTheme } = useTheme();
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const downloadUrl = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selectionGeneration = useRef(0);
  const [from, setFrom] = useState<FileFormat>("png");
  const [to, setTo] = useState<FileFormat>("jpg");
  const [files, setFiles] = useState<File[]>([]);
  const [validationBusy, setValidationBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState("");
  const [failures, setFailures] = useState<Failure[]>([]);
  const [download, setDownload] = useState<Download | null>(null);
  useEffect(() => () => {
    selectionGeneration.current++;
    abortRef.current?.abort();
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
  }, []);
  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    if (menu) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = oldOverflow; };
  }, [menu]);

  function clearResults() {
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = null;
    setDownload(null);
    setMessage("");
    setFailures([]);
    setProcessed(0);
  }

  function changeFrom(value: FileFormat) {
    if (busy) return;
    selectionGeneration.current++;
    setFrom(value);
    setTo(OUTPUT_FORMATS[value][0]);
    setFiles([]); setRejected([]); setValidationBusy(false);
    if (fileInput.current) fileInput.current.value = "";
    clearResults();
  }

  async function chooseFiles(source: FileList | null) {
    if (busy) return;
    const ticket = ++selectionGeneration.current;
    clearResults();
    setFiles([]);
    setRejected([]);
    const selection = Array.from(source ?? []);
    if (!selection.length) { setValidationBusy(false); return; }
    setValidationBusy(true);
    const accepted: File[] = [], bad: string[] = [];
    let total = 0;
    for (const file of selection) {
      try {
        if (accepted.length >= MAX_BATCH_FILES || total + file.size > 80_000_000) {
          throw new Error(INVALID_FILE_MESSAGE);
        }
        if (await detectFileFormat(file) !== from) throw new Error(INVALID_FILE_MESSAGE);
        accepted.push(file);
        total += file.size;
      } catch {
        bad.push(file.name);
      }
    }
    if (ticket !== selectionGeneration.current) return;
    setFiles(accepted);
    setRejected(bad);
    setValidationBusy(false);
    if (bad.length) setMessage(INVALID_FILE_MESSAGE);
  }

  async function runConversion() {
    if (busy || validationBusy || files.length === 0) return;
    clearResults();
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const entries: ZipEntry[] = [];
    const names = new Set<string>();
    const errors: Failure[] = [];
    let sourceBytes = 0, outputBytes = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        if (controller.signal.aborted) break;
        const file = files[i];
        setCurrent(file.name);
        try {
          // Revalidate on conversion so stale or manipulated selections cannot bypass checks.
          if (await detectFileFormat(file) !== from) throw new Error(INVALID_FILE_MESSAGE);
          const result = await convertFile(file, from, to, controller.signal);
          if (controller.signal.aborted) break;
          entries.push({ name: uniqueOutputName(file.name, to, names), blob: result });
          sourceBytes += file.size;
          outputBytes += result.size;
        } catch (error) {
          if (controller.signal.aborted) break;
          errors.push({ name: file.name, reason: error instanceof Error ? error.message : INVALID_FILE_MESSAGE });
        }
        setProcessed(i + 1);
      }
      setFailures(errors);
      if (controller.signal.aborted) {
        setMessage("Cancelled. Your original files are unchanged.");
      } else if (entries.length) {
        const blob = entries.length === 1 ? entries[0].blob : await createZip(entries);
        if (!controller.signal.aborted) {
          const url = URL.createObjectURL(blob);
          downloadUrl.current = url;
          setDownload({
            url, name: entries.length === 1 ? entries[0].name : "converted-files.zip",
            count: entries.length, sourceBytes, outputBytes,
          });
          setMessage(errors.length ? "Completed with " + errors.length + " skipped file(s)." : "Your converted files are ready.");
        }
      } else {
        setMessage("No files could be converted. " + INVALID_FILE_MESSAGE);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Conversion failed.");
    } finally {
      abortRef.current = null;
      setCurrent("");
      setBusy(false);
    }
  }

  const originalBytes = files.reduce((total, file) => total + file.size, 0);
  const selectedTargets = OUTPUT_FORMATS[from];
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <div className="header-left">
            <button ref={menuButton} className="menu-button" aria-expanded={menu}
              aria-controls="navigation-drawer" onClick={() => setMenu(true)}>
              <Icon name="menu" /><span>Menu</span>
            </button>
            <a className="wordmark" href="/" aria-label="Sergei Patrushev, home">SP<span>.</span></a>
          </div>
          <span className="header-caption">Software developer / Data & AI</span>
          <div className="header-actions">
            <label htmlFor="converter-theme" className="sr-only">Color theme</label>
            <select id="converter-theme" value={theme} onChange={(event) => selectTheme(event.target.value)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <a className="header-contact" href="/#Connect">Let's talk <Icon name="arrow" size={16} /></a>
          </div>
        </div>
      </header>
      <Drawer open={menu} sectionHrefPrefix="/" activeTool="converter" onClose={(reason) => {
        setMenu(false);
        if (reason === "dismiss") requestAnimationFrame(() => menuButton.current?.focus());
      }} />
      <main id="main" className="compressor-page" tabIndex={-1}>
        <section className="section compressor-intro">
          <p className="eyebrow"><span className="status-dot" /> Web tools / 02</p>
          <h1>Make files <span className="serif-accent">fit</span><span className="accent">.</span></h1>
          <p className="compressor-lead">Convert images, Word documents, Excel sheets, PDF text and more,
            directly in your browser. Select formats, add files and download the results.</p>
          <div className="compressor-pills" aria-label="Key features">
            <span>Private, on your device</span><span>Batch conversion</span><span>PDF · Word · Excel · Images</span>
          </div>
        </section>
        <section className="section compressor-workspace" aria-label="File converter">
          <div className="compressor-panel">
            <p className="eyebrow">01 / Choose formats</p>
            <div className="converter-format-grid">
              <div>
                <label htmlFor="converter-from">From format</label>
                <select id="converter-from" value={from} disabled={busy} onChange={event => changeFrom(event.target.value as FileFormat)}>
                  {INPUT_FORMATS.map(format => <option key={format} value={format}>{FORMAT_LABELS[format]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="converter-to">Convert to</label>
                <select id="converter-to" value={to} disabled={busy} onChange={event => {
                  clearResults(); setTo(event.target.value as FileFormat);
                }}>
                  {selectedTargets.map(format => <option key={format} value={format}>{FORMAT_LABELS[format]}</option>)}
                </select>
              </div>
            </div>
            <p className="compressor-note converter-support-note" id="converter-supported">{notes[from]}</p>
            <div className="compressor-rule" />
            <p className="eyebrow">02 / Add files</p>
            <label
              className={"compressor-picker converter-dropzone" + (dragging ? " converter-dragging" : "")}
              htmlFor="converter-files"
              onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
              onDrop={(event) => {
                event.preventDefault(); setDragging(false);
                if (!busy) void chooseFiles(event.dataTransfer.files);
              }}
            >
              <span className="compressor-picker-symbol" aria-hidden="true">+</span>
              <strong>Drop files here or choose files</strong>
              <span>Selected source: {FORMAT_LABELS[from]}. Multiple files accepted.</span>
            </label>
            <input ref={fileInput} id="converter-files" className="sr-only compressor-file-input"
              type="file" accept={acceptList[from]} multiple disabled={busy}
              onChange={event => {
                void chooseFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }} />
            <p className="compressor-note">Up to 120 files, 20 MB per file, 80 MB per batch.
              Files never leave this device. Unsupported formats and mismatched file contents are rejected.</p>
            <div className="compressor-selection" aria-live="polite">
              <strong>{validationBusy ? "Checking files…" : files.length + " selected"}</strong>
              <span>{formatBytes(originalBytes)} total</span>
            </div>
            {rejected.length > 0 && (
              <p className="converter-error" role="alert">
                {INVALID_FILE_MESSAGE} {rejected.length} rejected: {rejected.slice(0, 3).join(", ")}
                {rejected.length > 3 ? "…" : ""}
              </p>
            )}
            <div className="compressor-actions">
              <button type="button" className="button primary"
                disabled={busy || validationBusy || files.length === 0}
                onClick={() => void runConversion()}>
                Convert files <Icon name="arrow" size={18} />
              </button>
              {busy && <button type="button" className="button secondary"
                onClick={() => abortRef.current?.abort()}>Cancel</button>}
            </div>
            <p className="compressor-note">Need smaller photos instead? <a href="/tools/photo-compressor/">Use Photo Compressor</a>.</p>
          </div>
          <aside className="compressor-summary">
            <p className="eyebrow">03 / Download</p>
            <h2>Ready when <span className="serif-accent">you are.</span></h2>
            <p>Each file is validated and processed separately. Invalid or unreadable files
              are skipped, so the rest of your batch can continue.</p>
            {busy && <div className="compressor-progress" role="status" aria-live="polite">
              <span>Processing {processed} of {files.length}</span>
              <progress value={processed} max={files.length || 1} />
              <small>{current}</small>
            </div>}
            {message && <p className="compressor-result-status" role="status">{message}</p>}
            {download && <div className="compressor-result">
              <div><span>Converted files</span><strong>{download.count}</strong></div>
              <div><span>Before</span><strong>{formatBytes(download.sourceBytes)}</strong></div>
              <div><span>After</span><strong>{formatBytes(download.outputBytes)}</strong></div>
              <a className="button primary" href={download.url} download={download.name}>
                Download {download.count === 1 ? to.toUpperCase() : "ZIP"} <Icon name="arrow" size={18} />
              </a>
            </div>}
            {!!failures.length && <details className="compressor-errors">
              <summary>{failures.length} skipped file(s)</summary>
              <ul>{failures.map((item, index) =>
                <li key={item.name + index}>{item.name}: {item.reason}</li>)}</ul>
            </details>}
            {!busy && !download && !message &&
              <p className="compressor-empty">Choose two formats, select your files and press Convert files.</p>}
            <p className="compressor-note">Document-to-PDF results are visual previews and may lose advanced formatting.
              Encrypted documents, scanned PDF text and legacy .doc/.xls files are not supported.</p>
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
