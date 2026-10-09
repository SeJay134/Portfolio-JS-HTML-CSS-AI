# Project Contracts

This document defines stable boundaries between roadmap stages and project parts.
A contract change is a scoped engineering change: update the contract, tests,
validation evidence, and dependent regression coverage together.

## 1. Stage and release contract

A normal branch contains one roadmap subphase, one defect fix, or one tightly
coupled contract change. It starts from the latest verified `main`.

A slice is ready to merge only when implementation/docs are complete; unit,
relevant integration, touched regression, required browser/accessibility, lint,
typecheck, production build, and preview smoke checks pass; and ROADMAP.md plus
docs/VALIDATION.md identify the checkpoint.

After merge: deploy `main`, run post-deploy smoke checks, manually verify the
affected critical journey in a real browser, record the result, and only then
start the next feature branch. Failure blocks new feature work until rollback or
a focused hotfix restores the verified baseline.

## 2. Frontend <-> local Flask API contract

**Local-only at this stage:** the public Vercel portfolio has no Chat UI or API
requests. Flask/RAG/Ollama runs only on the owner's computer and is not a
production dependency.

Development frontend: port 5001. Local Flask API: 127.0.0.1:5002.
The default host allowlist is localhost/127.0.0.1. ngrok is test-only and must
be explicitly enabled through trusted host/origin configuration and
`REQUIRE_API_KEY=true`; startup fails if a non-local origin or host is
configured without authentication.

- `GET /health`: liveness without requiring model/index loading.
- `GET /ready`: HTTP 200 when model/index are ready, 503 otherwise.
- `POST /chat`: JSON object with string `message`.
- Message limit: 300 Unicode code points after trimming; body limit: 16 KiB.
- Success: 200 JSON with `reply`, `sources`, `request_id`.
- Client-visible failures: 400/413/429/503 JSON with `error`, `request_id`.
- Requests are stateless; client history/session fields are not trusted state.
- Browser Stop aborts the client request but does not promise immediate model cancellation.
- Frontend validates source URLs before rendering them.
- The local API binds to loopback, does not serve static repository files, and
  does not log conversation text.
- CORS restricts browser origins but is not authentication.
- A temporary tunnel requires explicit trusted-host/origin configuration and an
  API key; never place that key in VITE_* or other public frontend code.
- `VITE_API_BASE_URL` remains public build-time configuration and never contains secrets.

An incompatible API change requires coordinated tests. Any future remote/public
AI backend is a new deployment/security decision and must not be inferred from
this local-development contract.

## 3. Local RAG knowledge <-> index contract

**Current Draft PR #13 implementation:** local `data/base/*.txt` and `*.md`
files, selected by the owner and ignored by Git, are the input to
`python -m llm.indexer`. Runtime output is `data/embeddings/index.faiss`
with safe `meta.json`; legacy pickle metadata is rejected. Generated files
are not canonical public portfolio facts.

- The current public catalogue is `src/data/projects.ts`. Reconciliation with
  locally held knowledge is an **unaccepted follow-up**, not already guaranteed.
  `content/knowledge.json` was a historical plan and is not read by the
  current local indexer.
- Index vectors and JSON metadata must have matching counts and valid chunk
  fields; FAISS sentinel IDs such as `-1` are discarded.
- Current publication uses two separate `os.replace` calls: individual files
  are replaced atomically, but the pair is **not** an atomic snapshot. A future
  generation/manifest switch is required before claiming that guarantee.
- Current `POST /chat` implementation returns `sources: []` even after
  retrieval. Source IDs, verified public URLs and provenance checks are
  pending Phase 4.3a; never invent or leak local paths as sources.
- Retrieval currently lacks a calibrated relevance cutoff; factual answer
  accuracy and bilingual performance are pending Phase 4.3b evaluation.
- Embedding/normalization/threshold/schema changes need retrieval regression
  and live evaluation before quality acceptance. Record evidence and latency
  on the owner's hardware without logging conversation or knowledge content.

## 4. Navigation <-> document contract

Stable public section anchors:
`Home`, `Projects`, `Skills`, `Experience`, `About`, `Connect`.

The drawer uses a native accessible trigger; closes via Close/Escape/backdrop/
section selection; contains modal focus; restores focus on dismiss; keeps hidden
links unreachable; preserves anchor/deep-link behavior; exposes the active section
with `aria-current`. Chat integration remains a separate future contract.

Changing a public section ID is a contract change and requires navigation/deep-link
regression updates.

## 5. Theme <-> persistence contract

Supported values: `system`, `light`, `dark`. Explicit choices persist;
`system` follows OS changes; invalid/unreadable values fall back to system;
storage failure must not prevent in-session switching; valid cross-tab changes
synchronize; initial rendering avoids an opposite-theme flash; active palettes
retain accessible contrast.

## 6. Contact <-> visitor contract

The current feature is local-only: validate fields; prepare `mailto:` and copyable
text; never POST visitor contact content; never claim delivery or
persistence; invalidate stale drafts; report clipboard success only after the
operation completes. A delivery provider is a new contract requiring privacy,
spam, failure, retry, and delivery-confirmation tests.

## 7. Project content <-> UI/RAG contract

Reviewed public projects are defined in typed frontend project data.
A future RAG release must reconcile that data with its own versioned knowledge.
Core cards do not depend on GitHub API availability.
Missing optional fields fail safely. Do not invent impact metrics, employers,
dates, skills, or proficiency levels.

Project filters support `All`, `Web`, `Data`, and `AI`. The `category` query
parameter restores the selection on reload and browser Back/Forward; unknown
values show all projects. Selecting All removes only `category`, preserving other
query parameters and the section hash. Selecting the active filter is a no-op
and must not add a browser-history entry. Filters and project details work with
the keyboard, including when AI/GitHub APIs or preview images are unavailable.

## 8. Test-suite contract

All tests/scenarios live under `tests/`: `unit/`, `integration/`, `e2e/`,
`smoke/`, `regression/`, `future/`, `fixtures/`, `scenarios/`, `setup/`.
One test has one canonical executable home; do not duplicate it just to satisfy
multiple categories. Future scenarios are not CI-green placeholders.

## 9. Deployment contract

`main` is deployable. A merge is not a completed release until deployment,
post-deploy smoke, and human browser verification pass. Portfolio content/contact
must remain usable when AI is unavailable. Keep a rollback target. Production
secrets never enter frontend source or `VITE_*` values.

## 10. Responsive content contract

At 320/360/390/768/1024/1440 CSS pixels, light and dark layouts preserve section
order, readable Hero actions, project details, loaded local images, and usable
contact controls. Neither the document nor checked content containers overflow
horizontally; project illustrations must fit inside their visible preview area.
This also holds when the external font service is unavailable. Optional canvas
effects are deferred; no canvas is shipped in this release. Automated axe scans cover main content
at 320 and 1440 pixels in both themes; real devices and broader cross-browser
acceptance remain Phase 7 work.
