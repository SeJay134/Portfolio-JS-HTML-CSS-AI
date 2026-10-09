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
