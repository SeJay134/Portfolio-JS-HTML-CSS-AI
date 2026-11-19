# Photo Compressor — portfolio tool

## Delivery

- Branch: `feature/photo-compressor-tool` (review before merging into `main`).
- URL: `/tools/photo-compressor/`. Vite multi-page entry: `tools/photo-compressor/index.html`.
- Navigation: the existing drawer links to the new page; section links on the tool page return to `/#Section`.
- UI: React, shared `src/styles.css`, DM Sans / Instrument Serif, Light/Dark/System theme.
- Logic: `src/lib/photoCompressor.ts`; all image processing and ZIP building run locally on the visitor's device.
- No upload endpoint, storage service, tracking request or third-party compression SDK is required.
- Existing portfolio HTML prerender remains scoped to `dist/index.html`.

## Behavior and limits

1. Select multiple browser-readable photos; HEIC/HEIF availability depends on Safari/browser version.
2. Set a whole-number target from 20 to 5000 KB (decimal kilobytes; 1 KB = 1000 bytes).
3. Each image is decoded, oriented per browser support, resized, re-encoded as JPEG and compressed below the requested per-file byte limit.
4. An unsuccessful file is skipped without losing the rest of the batch. Duplicate basenames get unique `.jpg` filenames.
5. Results are packaged as a ZIP with uncompressed entries (JPEG files are already compressed). Download is initiated by a separate user click, which is more reliable on iOS Safari.
6. Photo metadata (e.g. EXIF, GPS), alpha transparency and image animation are not preserved. White is used behind transparent pictures.
7. Files are processed sequentially to reduce memory spikes, but large batches and final ZIP generation still consume browser memory. If Safari cannot handle a very large batch, try groups of 50–100.
8. Classic ZIP output has a 4 GB limit. No guarantee is made for images that the browser cannot decode or for unusually restrictive target sizes.
9. Cancelling stops the current processing pass; a cancelled run creates no archive. Original photos are never overwritten.

## Automated checks

- `npm run lint` — ESLint on frontend and tests.
- `npm run typecheck` — TypeScript compile checks.
- `npm run test:unit` — validation, filename security, CRC32 and ZIP headers.
- `npm run build` — two-page Vite production build and portfolio prerender.
- `npm run test:smoke -- --project=chromium` — homepage and direct tool-route availability.
- `npm run test:e2e` — menu navigation, 105-photo batch, archive verification, file-size limit, privacy and theming.
- `npm run test:regression` — existing portfolio navigation, layout, theme, anchors, SEO and projects remain intact.
- CI browser runners are pinned to Ubuntu 24.04 because Playwright 1.58 does not support Ubuntu 26.04.

## Manual physical-device acceptance: iPhone Safari

- [ ] Open the preview branch deployment's `/tools/photo-compressor/` address directly; refresh it.
- [ ] Select 100–200 photos from the iPhone photo library (include HEIC if available).
- [ ] With 300 KB selected, verify every JPG inside the ZIP is <= 300000 bytes.
- [ ] Inspect several text-heavy and portrait images for acceptable readability/detail.
- [ ] Download the ZIP through the button; find it in the Files app and unzip it.
- [ ] Include a corrupt image among valid images; confirm the other photos are saved and the failure is listed.
- [ ] Change file selection or target after a completed batch; confirm the old ZIP link disappears.
- [ ] Verify Cancel, iPhone rotation, reduced-motion setting and a smaller virtual-keyboard viewport.
- [ ] Verify dark/light/system themes match the portfolio and persist when returning to the homepage.
- [ ] Confirm no network POST is made while compressing. Originals remain in Photos unchanged.

## Release gate

Do not merge this branch until the frontend and browser suites are green, the baseline Python/RAG suite has been investigated separately, and a real iPhone Safari manual check has been recorded. Use a Vercel preview build for validation; do not deploy to production as part of this branch.
