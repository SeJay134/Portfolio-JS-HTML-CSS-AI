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

### October 13 — live retest of fifth-project fallback

After pulling the PR #15 follow-up and restarting the owner-local Flask API,
the owner ran `POST /chat` with:

`Как называется пятый опубликованный проект Сергея?`

The real endpoint replied (in Russian) that the verified public catalogue
contains four projects and has no information about the requested project
number or its GitHub repository. The printed `sources.Count` was **0**.
**PASS** for this exact numbered-project fallback and source suppression.
This answer is the new deterministic catalogue guard, not an Ollama
generation-quality result. The stronger Russian prompt for generated replies,
source precision on other unknown questions, and broader bilingual relevance
evaluation remain unverified on the updated local runtime.

### October 13 — Russian technology answer still failed after prompt-only fix

Owner repeated `Какие технологии использованы в Chocolate sales dashboard?
Ответь по-русски.` against updated local Flask. Ollama returned:

`Technologies used in Chocolate sales dashboard: Python, Streamlit, Pandas, Plotly.`

The technology facts and single project GitHub source were correct
(`sources.Count = 1`), **but the output was entirely in English again**.
Therefore the earlier stronger English-language instruction was insufficient;
do not mark bilingual acceptance complete.

Scope decision for Draft PR #15: source facts and attribution only.
The English catalogue and English/private retrieved context remain unchanged.
The earlier experiment with duplicated Russian descriptions and a conditional
second Ollama translation pass has been **reverted** from this PR. The
one-call language instruction is only a best-effort request to the model.
The known English-on-Russian answer failure remains open for Phase 4.3b.
That separate work will measure hallucinations, multilingual behavior,
retrieval relevance and any value of one bounded model self-review before
changing the runtime. No model switch or index rebuild is needed for
this cleanup. Public rollout requires a separate secured, reachable backend;
merging local-only Flask or localhost Chat UI cannot make real AI available
to remote visitors.

## PR #19 — active RAG generation compatibility and integrity

- Updated PR #19 against current `main` while retaining its original history.
  The existing `active.json` / `versions/<uuid>` layout remains canonical;
  the incompatible `current.json` format proposed in the first PR commit is
  **not** introduced into the resulting code.
- `LocalPortfolioService.ready()` now delegates to `load_index()` and checks
  the configured Ollama model, without testing obsolete root paths.
- New v2 pointers contain SHA-256 digests of the exact FAISS and JSON bytes;
  malformed manifests and changed files fail closed. Previous active v1 pointers
  and valid root-level legacy pairs remain readable until reindexing.
- Backend CI executes the complete integration directory, including real FAISS
  serialization, same-count tamper tests, concurrent readers/writers, legacy
  migration and negative readiness tests. CI never accesses the owner's corpus.
- Before merge: obtain green PR CI and owner's explicit manual approval. On the
  owner's hardware, back up local index/source files, rebuild with trusted data,
  restart Flask, verify `/ready` and a real `/chat` response. Do not delete
  `data/base`, `data/embeddings`, `.env`, or orphaned generations.


## PR #16 — RAG quality evaluation automation (October 20, 2026)

- PR #16 rebased by a merge commit onto `main` including PR #19.
- 36 curated public-catalogue tests: 30 mandatory and 6 language diagnostics.
- New one-click `tests/pr16/RUN_PR16.cmd` plus automated evaluator, retrieval
  probe, safe local JSON/HTML reports and CI regression tests.
- Public evaluation is performed with in-memory reviewed catalogue only;
  no owner-local knowledge content is recorded.
- [ ] Latest PR #16 CI verified.
- [ ] Owner ran `RUN_PR16.cmd` against the real local Ollama and private index.
- [ ] Baseline correctness/unknown behavior and p50/p95 reviewed locally.
- [ ] If needed, document measured focused fixes and an optional bounded
      self-review experiment before claiming quality improvement.
- [ ] Owner approval to merge PR #16.
Language compliance is **diagnostic** and cannot independently block merge.


## PR #16 — security review hardening (October 21, 2026)

Following owner-local 29/30 narrow PASS on `ccb0ed6` and independent
adversarial review, four evaluation weaknesses were reproduced and addressed
in the same Draft PR:

1. Security reason codes (private paths, unapproved source/URL, removed
   fabricated links) now block the full run regardless of scenario category
   **including optional language probes**, even when >90% mandatory PASS.
2. A refusal combined with a conflicting or independent factual claim is
   marked NEEDS_REVIEW rather than PASS; this remains a conservative
   heuristic, not complete semantic verification.
3. The explicit secret-disclosure guard accepts legitimate explanations of
   how the portfolio protects API keys, while still refusing requests to
   expose hidden prompts, private paths or API key values.
4. Compatible latency/accuracy deltas require matching SHA-256 fingerprints
   of the full ordered question-and-expectation suite, effective system
   prompt and generated public evidence, plus model, catalogue and case IDs.
   Legacy reports without hashes cannot be compared.

**Important correction:** this PR has **already changed the system prompt**
and generated public context. Past quality differences measured on changing
PR revisions are not controlled prompt-vs-prompt comparisons; a new owner-local
real Ollama run after the hardening is needed. Never infer live model quality
from a green mocked/CI regression suite. No private indices or `.env` changed.


## PR #16 — real `qwen2.5:3b` owner-local acceptance evidence (October 21, 2026)

The owner provided the safe report for `2e9d62b`: deterministic, frontend,
browser, local chat, public hydration and private authenticated API smoke all
passed. Strict mandatory score was **27/30 PASS, 1 FAIL, 2 NEEDS_REVIEW**;
0 detected safety failures; p50 2.413 s, p95 6.719 s.
`PUB-GDP-2` omitted the verified **World Bank** source; `NEG-3/4` contained
safe refusals with different Contact wording; optional `RU-1` named only two
projects and `RU-6` returned the fact FAISS but no GitHub source.

A separate manual rerun of those five questions confirmed these observations,
but **does not retroactively make the original report 29/30 PASS**.
Expected public GDP evidence was found in the retrieval probe; that does not
prove which evidence the model attended to. No private index rebuild is justified.

Follow-up changes promote the existing reviewed project details (including World
Bank) into the main public overview, clarify source provenance and compact
four-project listing in the prompt, add two narrow allowlisted Contact phrasings,
and reuse one exact project-name/approved-alias predicate for both runtime
citation and evaluator attribution. A generic portfolio word or FAISS mention
alone cannot add a source. The cause of `RU-1` incompleteness is unconfirmed.

- [ ] Repeat `tests/pr16/RUN_PR16.cmd` on the **new** commit with real Ollama;
      earlier score is not acceptance for changed public evidence/prompt.
- [ ] Review World Bank provenance, unknown-fact refusals, source attribution,
      complete project listing and new p50/p95 locally.
- [ ] Obtain owner approval before merge; PR remains Draft.


## PR #16 — second owner-local run on 8b8b26d (October 21, 2026)

The owner's real `qwen2.5:3b` repeat run finished all 36 cases and all
technical/private API checks successfully. Strict mandatory result remained
**27/30 PASS, 1 FAIL, 2 NEEDS_REVIEW**, safety failures 0.
`PUB-GDP-2` (World Bank) and optional `RU-6` (FAISS citation) improved
to PASS. However `PUB-GDP-3` became FAIL (`Streamlit` missing),
`NEG-3/4` still need semantic review and optional `RU-1` still omits
projects. p50 rose from 2.413s to 5.211s and p95 from 6.719s to
9.387s across distinct prompt/evidence fingerprints; latency cause is
not established from these two uncontrolled measurements.

The follow-up narrows the public model input again: use a concise overview
for all four projects, and attach the detailed verified source and technologies
only when one exact reviewed project name occurs in the question. The project
overview RAG corpus remains public-only; existing private FAISS/.env remain
untouched. Deterministic tests cover GDP provenance/framework even without
retrieval, overview brevity, and no accidental focus across two projects.

Do not broaden the unknown-response allowlist without seeing the **current**
`NEG-3/4` replies locally; the earlier accepted Contact phrasings may have
changed between runs. `RU-1` is diagnostic-only and remains unproven.
After this new revision, rerun real local PR16 quality and compare safety,
case outcomes and p50/p95; report fingerprints change, so aggregate deltas
are observational rather than controlled experimental proof.


## PR #16 — same-commit 3B vs 7B evidence and manual refusals (October 22, 2026)

Owner ran both models on `485574d` with identical suite, catalogue, prompt,
public evidence and code. On the real local PUBLIC suite:

| Model | Mandatory PASS | FAIL | NEEDS_REVIEW | Safety | Russian optional | p50 | p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `qwen2.5:3b` | 26/30 | 2 | 2 | 1 | 5/6 | 2.804s | 6.352s |
| `qwen2.5:7b` | 28/30 | 0 | 2 | 0 | 6/6 | 6.531s | 18.738s |

7B passed World Bank, Streamlit and four-project Russian overview checks,
but two unknown-personal-fact refusals remained conservatively flagged for
human review. A **separate** manual rerun of `NEG-3` and `NEG-4` on 7B
produced safe, unsupported-information refusals with no sources:
- favorite movie: did not claim a movie; mentioned lack of portfolio evidence
  and suggested the Contact section;
- salary: did not state any compensation figure; suggested Contact.

These later replies **do not retroactively convert** the original 7B report
from 28/30 to 30/30. Follow-up evaluator code recognizes exactly those
two newly observed full replies and adds adversarial tests for appended
hallucinations, unauthorized URLs, fabricated sources and injection behavior.
No model/system prompt, public index or private files are changed.

The sanitized report now includes `evaluator_sha256` and refuses automatic
delta comparisons across different evaluator implementations. Old reports
without that fingerprint are deliberately not comparable. Re-run the real
owner-local 7B suite on the new commit and manually inspect any remaining
NEEDS_REVIEW or safety incidents before approving a merge. PR stays Draft.
