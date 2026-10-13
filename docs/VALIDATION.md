# Public portfolio release — validation

Status (October 9, 2026): **frontend PR #12 merged to main** on October 6,
2026 (merge commit `cea29189`). The Vercel GitHub deployment check reported
success. Public HTTP/SEO and human-browser production acceptance have not been
recorded here; do not treat those checks as complete.

Source: the reviewed portfolio components of `wip/portfolio-ui-draft`,
extracted against the current `main` baseline into
`release/public-portfolio-phase3`.

## Included
- Hero, Projects, Skills, Experience, About, consolidated Contact
- Keyboard accessible filters, URL/hash navigation and responsive layouts
- Theme persistence, local preview images, no-JavaScript prerender, SEO assets

## Excluded
- Chat UI and its API client; optional 3D and Three.js
- Backend/API and RAG index improvements (will need a separate PR)
- Any claim of live model readiness or deployed production AI functionality

## Public release checks
- [x] Release PR #12 push/PR CI lint, typecheck, unit tests and production
      build green at `d7515d4` before merge.
- [x] PR #12 smoke and Chromium, Firefox, WebKit E2E/regression CI green.
- [x] Merge into `main` at `cea29189`.
- [x] Vercel GitHub commit status reported successful deployment.
- [ ] Owner approves employment dates, claims and curated project descriptions
- [ ] Human Preview check: desktop/mobile appearance, keyboard, contact
- [ ] Confirm Vercel production branch `main` and `dist/` build artifact
- [x] Merge approved release commit to `main` (`cea29189`).
- [ ] Independently confirm live production assets correspond to deployed SHA
- [ ] Production root, robots.txt, sitemap.xml, social-card.png return 200
- [ ] Canonical, OG and Twitter metadata visible in live HTML source
- [ ] Real browser navigation, filter, mailto draft and mobile checks
- [ ] Rollback deployment recorded and next branch based on verified main

Previous development evidence is available on
`wip/portfolio-ui-draft` and in PR #11. This checklist records results for
the **separated** release, not an implied acceptance of the original draft.

## Local AI runtime evidence — Draft PR #13 (not part of public deployment)

Branch: `feat/local-ai-runtime-security`; latest examined implementation:
`7459c587`. PR remains Draft and unmerged. Green push and PR checks:
- https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37923838307
- https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37923843071

Owner-provided Windows PowerShell evidence (October 9, 2026):
- [x] Local `python -m llm.indexer`: "Index built and validated."
- [x] `GET http://127.0.0.1:5002/health`: `status=ok`,
      `scope=local-only`, `history=stateless`.
- [x] `GET http://127.0.0.1:5002/ready`: `status=ready`.
- [x] `POST http://127.0.0.1:5002/chat`: 200 with nonempty `reply` and
      a request ID from real local Ollama.
- [ ] Content acceptance: the projects answer listed broad categories,
      not the exact four curated public projects; local RAG data has not
      been independently reviewed. Do not assert factual correctness.
- [ ] Source attribution: `sources` was empty. Current `llm/app.py`
      explicitly returns `sources: []` pending the next source-mapping slice.
- [ ] Re-run local smoke after eventual merge, with owner's approval.
- [ ] Review live negative/security cases, including failed model, bad JSON,
      over-limit body, rate limiting, denial of external hosts.
- [ ] PR #13 merge/human acceptance remains owner-controlled.

This is **local runtime evidence only**. The public Vercel portfolio does not
call Flask, Ollama or FAISS, and no ngrok/cloud API is required or planned.
See `ROADMAP.md` for separate source-attribution and RAG-quality follow-ups.

## October 12, 2026 — Windows Vite-to-Flask live chat integration

Owner reported a working Vite React Chat UI on `127.0.0.1:5001`, local
Flask on `127.0.0.1:5002`, and Playwright Chromium installed locally.
`npm run test:chat-dev` passed 2 of 2 browser tests (these are mocked API
tests, not accuracy checks). The local Flask log included:
- `OPTIONS /chat` 200 once the browser used port 5001 (earlier port 5003
  caused 400 and is no longer used).
- `POST /chat` 200 on one real generation.
- Two `POST /chat` 503 responses with `type=ReadTimeout` after about
  45 seconds, despite `GET /ready` 200.

The implementation change raises the **local** Ollama read timeout from 45
to 120 seconds. This is a bounded response to observed runtime evidence;
not a performance guarantee, proof of correct RAG facts, or production AI
deployment. The paired frontend PR #14 gives the browser 135 seconds.
A user-local smoke test with restarted processes is still **pending**.

## October 12, 2026 — Owner retest after timeout adjustment

After updating Flask PR #13 to `4905615` with `MODEL_TIMEOUT=120`, and
React PR #14 to `5074954` on `127.0.0.1:5001`, the owner observed:
- `GET /ready` -> 200; `OPTIONS /chat` -> 200.
- `POST /chat` -> **200** after about 60 seconds (16:12–16:13 local time).
- The visible React conversation showed a real model reply to
  "What projects has Sergei built?"
- The reply still listed broad categories, not the four public project titles.

This proves the end-to-end local chat path and one successful longer-running
request, not a reliable latency distribution or accepted RAG answer quality.

Draft PR #15 adds reviewed public project context and safe source provenance.
It is based on Draft PR #13, does not include uncommitted private
`data/base/` materials, and is **not yet owner-tested against the rebuilt
local index**. Any resulting factual answers and source links require manual
retesting before accepting Phase 4.3a.

## October 13, 2026 — owner Windows live RAG project-list check

Owner checked out `feat/rag-public-project-provenance`, backed up
`data/embeddings/`, ran `python -m llm.indexer` successfully, restarted
Flask on 127.0.0.1:5002, and tested the existing Vite Chat UI.
Flask returned `OPTIONS /chat` 200, `/ready` 200, and
`POST /chat` 200 on October 12 (16:38:50) and October 13 (06:45:40)
as shown in the submitted terminal logs.

The visible reply to "What projects has Sergei built?" named all four
reviewed public projects with summaries matching the curated React cards:
Chocolate sales dashboard; GDP dashboard; Open API weather explorer;
Portfolio website & AI prototype.

- [x] Real local index rebuild accepted as completed.
- [x] One English project-list answer includes the four canonical titles.
- [x] The owner subsequently clarified that "The assistant is not ena"
      was only the point where **their manual copying stopped**, not an
      Ollama/Flask truncation. No incomplete-generation failure was observed
      in this case; do not create a model-output defect from that excerpt.
- [ ] API `sources` were not included in the supplied Chat transcript.
      This dependent PR adds deterministic approved links for exactly named
      catalogue projects even when FAISS's top results are local-only. Live
      links still need inspection; do not claim source acceptance yet.
- [ ] Compare Russian questions, unknown facts and other private owner-local
      content before closing answer-quality acceptance.

No private knowledge bytes or local path strings were committed.
All work remains owner-local, with no production deployment.

## October 13, 2026 — owner-local bilingual and unknown-fact probes

These observations came from the owner's actual local `POST /chat`, not mocks:

- **PASS**: English project-list question returned the four verified titles and
  four corresponding public GitHub repository links. The fourth uses an older
  GitHub path that redirects to the current repository name; canonical URL
  normalization remains a separate follow-up.
- **FAIL**: Russian project-list question answered entirely in English.
- **FAIL**: Explicitly requesting Russian for chocolate-dashboard technologies
  returned English `Technologies: Python, Streamlit, Pandas, Plotly.` again,
  including when the request body was explicitly encoded as UTF-8.
- **PASS**: Unknown favorite-film question correctly stated in Russian that
  evidence was unavailable and returned `sources: []` (confirmed count 0).
- **FAIL**: Request for the *fifth published project* returned the already-known
  Open API weather explorer as if it answered the question, and one irrelevant
  public GitHub source. That violates both answer relevance and attribution.

Draft PR #15 follow-up code (not owner-live-accepted yet):
- Reject explicit numbered projects outside the four-card verified catalogue
  with a narrow, deterministic no-evidence reply and `sources: []`, without
  claiming that no additional projects could exist outside the public catalogue.
- Remove unconditional FAISS-hit source attachment; retrieved chunks remain
  context candidates, not citations. Only explicitly named, reviewed project
  titles can produce repository source links.
- Reinforce a Russian answer-language directive while preserving exact
  English project titles and technology names.
- Add backend regression tests for Russian/numeric/English fifth-project
  requests, source over-attribution and prompt-language selection.

These changes do **not** establish general multilingual RAG accuracy or a
relevance threshold for private FAISS chunks. Repeat real owner-local Flask
tests after pulling the PR #15 head and restarting Flask. The existing local
FAISS index requires **no rebuild** for this code-only change. No public
deployment or merge is authorized.
