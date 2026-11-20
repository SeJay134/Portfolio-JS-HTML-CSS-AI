# File Converter

Dedicated portfolio tool: /tools/file-converter/. Original Photo Compressor remains at /tools/photo-compressor/.

## Supported conversions (offline in the browser)

| Input | Output |
|---|---|
| PNG | JPEG, WebP, PDF |
| JPEG | PNG, WebP, PDF |
| WebP | PNG, JPEG, PDF |
| PDF | TXT, DOCX (basic text extraction only; no OCR) |
| Word DOCX | TXT, PDF (paragraph text only) |
| Excel XLSX | CSV, TXT, PDF (first sheet, cached values) |
| CSV (UTF-8) | XLSX, TXT, PDF |
| TXT (UTF-8) | DOCX, PDF |

The dropdown dynamically exposes **only** working routes. It never advertises unsupported conversions (such as PDF -> editable Word, PDF -> PNG, encrypted files, legacy DOC/XLS). DOCX-to-PDF and XLSX-to-PDF render visual previews with browser fonts and are **not layout-preserving**; text in resulting PDF is rasterized and not searchable. PDF-to-TXT extracts common PDF text operators only and does not decode every font, content stream, or PDF variant; scanned PDFs and encrypted PDFs cannot be converted to text.

## Safety, integrity and privacy

- No file uploads. Browser-only Canvas, ZIP (using the existing tested ZIP writer), File and DecompressionStream APIs.
- Input selected format must match the real extension **and the file signature**. Office documents must be valid ZIPs with expected OOXML members and CRC32. Invalid files are rejected with `Invalid file format. Choose another file.`
- Maximum: 20 MB per source, 80 MB combined and 120 files per batch. The ZIP reader checks central directory bounds, encrypted flags, supported compression methods, CRC32, expanded payload caps and compression-ratio bounds to reduce zip-bomb risk.
- HTML and scripts in document cells are never interpreted: XML is parsed with DOMParser and values are written as text; CSV-to-XLSX stores `inlineStr` instead of formulas. XLSX-to-CSV escapes potentially dangerous formula-like cells.
- Results use sanitized, unique filenames. Batch downloads produce one ZIP; single conversions download the result directly.
- Changing either format, or selecting new files, invalidates previous downloads. Abort cancels between file operations. Original files are never modified.

## Tests

- `npm run lint && npm run typecheck && npm run test:unit && npm run build`
- `npm run test:smoke -- --project=chromium`
- `npm run test:e2e` and `npm run test:regression` across Chromium, Firefox, WebKit, iPhone 13 emulation and Pixel 7 emulation.
- Test fixtures are generated deterministically at runtime in `tests/fixtures/converterFiles.ts`: valid and corrupt PDF, DOCX, XLSX, CSV, TXT, PNG and fake extensions; tests inspect actual download bytes and archive contents, not just the UI.
- Legacy Photo Compressor E2E and regression remain unchanged.

## Release policy

Merge only with passing frontend, smoke and all browser tests, and after checking that any backend failures are unchanged from main (existing unrelated RAG test is an explicitly known baseline issue). After merge, rerun the complete CI on main and verify production Vercel deployment. Real iPhone Safari/HEIC and large real-world documents need a separate manual acceptance pass.
