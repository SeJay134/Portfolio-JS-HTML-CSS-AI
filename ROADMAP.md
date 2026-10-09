# Portfolio Roadmap

> Status snapshot: October 9, 2026.
>
> **Public website:** frontend-only PR #12 merged to `main` on October 6
> (merge commit `cea29189`). GitHub reported successful Vercel deployment;
> production URL/SEO HTTP checks and a final human-browser acceptance record
> remain **unverified in the release checklist**. The public site has no chat.
>
> **Local AI:** Draft PR #13 (`feat/local-ai-runtime-security`) restores and
> hardens `python -m llm.app`. It runs on the owner's computer only, without
> ngrok or any cloud backend. The owner confirmed `/health`, `/ready`, and a
> real `/chat` Ollama response. This proves basic runtime operation, **not**
> factual RAG quality or source attribution.
>
> Earlier Phase 0/1/4.1 checkboxes below describe historic work on
> `wip/portfolio-ui-draft`; they do not mean those changes shipped in the
> frontend-only release. Hosting decisions in this snapshot supersede older
> production-backend assumptions in the historical plan.

## North star and functional preservation contract

**Goal:** modernize the **existing** portfolio: new responsive design plus a
React/TypeScript frontend, while keeping the originally planned user-facing
features and the Flask/FAISS/Ollama assistant concept. The shipped static
frontend is an incremental release, not the finished product.

Work should be **parity-first, not rewrite-first**:
- Preserve reviewed navigation/anchors, projects, skills, experience, contact,
  themes and the originally planned chat experience as the design evolves.
- Preserve the assistant's purpose: answer questions about the owner's
  portfolio/projects using reviewed local knowledge; improve reliability and
  truthfulness without silently broadening or removing its scope.
- Reintroduce React Chat UI as a **required functional milestone**, not an
  optional decorative feature. Frontend-only release must remain useful when
  the personal computer and AI are offline.
- Current safe mailto/copy Contact is an interim **working** contact route;
  direct message delivery is not present. Discuss any delivery-provider change
  with the owner before implementing it.
- Security, accessibility, validation and regression fixes are in scope.
  New services, paid components, public AI exposure, changing the purpose
  or substantially redesigning planned interaction behavior need agreement.
- Three.js and enhanced visual effects are optional pending separate design,
  accessibility, performance and owner acceptance; they cannot block core UX.
- Keep changes in focused branches/PRs with no implicit production merge.
  A local AI runtime (Draft PR #13) is a **hosting decision**, not a decision
  to omit chat from the finished portfolio.

The [feature-parity acceptance scenarios](tests/scenarios/original-feature-parity.md)
are the baseline for checking whether later changes preserve intended behavior.

## Historical engineering checkpoints (not all shipped to main)

- [x] Phase 0.1 — Repository review and baseline
- [x] Phase 0.2 — Reproducible backend setup
- [x] Phase 1.1 — Stateless chat and strict request validation
- [x] Phase 1.2 — Error handling, rate limits, and generation limits
- [x] Phase 1.3 — Backend regression tests: 27 passed
- [x] Phase 1.4 — Safe contact flow acceptance
- [x] Phase 2.1 — Design tokens and themes acceptance
- [x] Phase 2.2 — Accessible left drawer acceptance
- [x] Phase 4.1 — Grounded service and atomic index infrastructure

## Public portfolio release: PR #12 merged to main

The reviewed typed project source, responsive UI, accessible drawer, frontend
toolchain, SEO assets and frontend tests are in `main`. Previous engineering
acceptance evidence remains below; it does not replace post-deploy inspection.

- [ ] Phase 3 — Hero, curated projects, and responsive layout production acceptance (3.1–3.9 accepted by CI)
  - [x] Phase 3.1 — Hero links and project filter/navigation contracts
  - [x] Phase 3.2 — Responsive composition, content review, and visual acceptance
    - Accepted at `77ade3e65e11343e4ca39745c4d1cd133c65da71`
    - CI: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/36924237503
  - [x] Phase 3.3 — Live GitHub project metrics deferred for this release
    - Curated local project data remains the source of truth.
    - Stars/updatedAt can be revisited later if they add useful visitor context.
  - [x] Phase 3.4 — Project preview asset acceptance
    - Accepted at `b3104242a24524ba195af49869a760ae533b9d73`
    - Push CI: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37002056738
    - Full PR browser regression: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37002059708
    - Controlled 16:10 previews use local WebP assets, lazy loading,
      meaningful alt text, and a graceful fallback when an image cannot load.
  - [x] Phase 3.5 — Project filter and URL-state acceptance
    - Accepted at `7aa0e9b3276c7d93914c55ad05f0843768ab160a`
    - Push CI: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37014439005
    - Full PR browser regression: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37014444124
    - Keyboard filters persist category state in the URL, survive reload,
      support Back/Forward, expose counts, and have an explicit empty-state contract.
  - [x] Phase 3.6 — Experience, skills-to-case-studies, and consolidated Contact acceptance
    - Accepted at `859712acc31273af67da9e839731eebbcb447106`
    - Push CI: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37015101572
    - Full PR browser regression: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37015109061
    - The compact experience timeline remains intact; each skill group links to
      a relevant filtered case-study view; no proficiency percentages are used;
      Connect and the legacy Leave a Message anchor resolve to one Contact surface.
  - [x] Phase 3.7 — Contact form accessibility and state acceptance
    - Accepted at `1e8a4743f6856503685f2ae5942212021e2cc690`
    - Push CI: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37022967622
    - Full PR browser regression: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37022975721
    - Visible labels and helper/error associations cover all required fields;
      name/email/message limits are explicit; invalid submission focuses the first
      invalid field; draft/copy states expose progress/success/error feedback;
      shortened mobile viewport remains usable; visitor data is not posted or published.
  - [x] Phase 3.8 — Legacy anchors and scroll/zoom behavior acceptance
    - Accepted at `50d815ed2e23994342f3167a639d3c1afa30c80a`
    - Full PR browser regression: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37048314608
    - Legacy section hashes remain directly accessible below the sticky header;
      removed #messages is preserved as a Contact compatibility alias without
      restoring a public message list; Back/Forward hash navigation is synced
      across desktop and mobile WebKit; focusing fields does not apply global
      scroll-to-top, zoom, or overflow-x hacks.
  - [x] Phase 3.9 — SEO metadata, social preview and crawlable page (source/build) acceptance
    - Accepted at `6107a064f14214e914dc03409084f88c7ab77328`
    - Push CI: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37468429643
    - Full PR browser regression: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37468435885
    - Description, canonical URL, Open Graph/Twitter title/description/image and
      image accessibility metadata are consistent; the 1200x630 PNG, robots.txt,
      sitemap.xml, favicon, prerendered project content, and document landmarks
      have automated browser acceptance coverage.
    - Deployment gate still open: verify the real non-www canonical response, www
      redirect, and crawler accessibility of the social preview/sitemap on the
      deployed domain. Source/build tests cannot prove external DNS or redirect behavior.
- [x] Phase 5 baseline shipped — React/TypeScript/Vite, lint/typecheck/unit,
      production build, Playwright and static prerender in the public frontend.
      Remaining Phase 5 polish/chat-specific tooling is deferred.
- [x] Release Gate A — merge of reviewed frontend PR #12 into `main`
      on October 6, 2026 (`cea29189`).
- [x] Vercel GitHub deployment status reported success for that merge commit.
- [ ] Release Gate A close-out — record actual production root/robots/sitemap/
      social-card HTTP responses, canonical metadata and human desktop/mobile
      browser review in `docs/VALIDATION.md`. Do not equate deployment status
      or green CI with those unrecorded checks.
- [ ] Owner-controlled content/date sign-off recorded in release validation.

PR #12 was extracted from `wip/portfolio-ui-draft`. Chat UI (Phase 4.2),
3D (Phase 6), and the Python backend were excluded. PR #13 is a separate
local-only AI runtime change; it must not connect the public Vercel site to
a private computer or add a remote API.

## Independent follow-up releases and local AI gates

### PR #13 — Phase 4.1L: secure local runtime (current Draft PR)

- [x] Implement local-only Flask `app.py` on 127.0.0.1:5002, stateless API,
      bounded requests/generations, safe validation and local Host/CORS policy.
- [x] Replace pickle metadata with JSON; reject malformed/sentinel FAISS IDs;
      avoid logging prompts, responses and retrieved RAG text.
- [x] Rebuild the local index after migration; the owner reported
      `python -m llm.indexer` built and validated it.
- [x] Owner-local smoke: `GET /health` -> local-only/stateless/ok,
      `GET /ready` -> ready, `POST /chat` -> a real Ollama reply.
- [x] Latest push and PR CI at `7459c587` green:
      https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37923838307
      and https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/37923843071
- [ ] Owner reviews the security/runtime diff and closes any outstanding
      operational checks before deciding whether to merge PR #13.
- [ ] Merge PR #13 only with explicit approval. No public AI deployment.
- [ ] Record a post-merge local `/health`, `/ready`, `/chat` smoke check;
      the current owner evidence is pre-merge.
- [ ] Optional dedicated negative checks: malformed JSON, 413, 429, model
      offline, simultaneous requests, and denied external Host, on local hardware.

### Phase 4.3a — Knowledge provenance and source attribution (separate PR after runtime acceptance)

A real local `/chat` request for "What projects has Sergei built?" returned
only broad categories ("Responsive web applications", "Machine learning
models", "Cloud ETL pipelines", etc.). The public project catalogue instead
names **Chocolate sales dashboard**, **GDP dashboard**, **Open API weather
explorer**, and **Portfolio website & AI prototype**. The response may reflect
other owner-local documents, which have not been inspected; therefore factual
accuracy is **unverified**, not automatically false. The current service
hardcodes `sources: []` even when retrieval succeeds.

- [ ] Audit owner-local `data/base/*.txt|*.md` (gitignored), with owner approval;
      identify stale, unsupported or private content without exposing it to CI.
- [ ] Reconcile approved facts with `src/data/projects.ts`; decide a canonical
      reviewed public facts source and a reproducible local ingestion process.
- [ ] Add safe source IDs, titles and allowlisted public project/section URLs
      to chunk metadata; return only verified retrieved sources from `/chat`.
- [ ] Add tests proving source provenance, URL allowlisting, no local paths in
      responses, and honest fallback when the evidence is missing.
- [ ] Keep index and JSON metadata consistent across updates; current two-file
      `os.replace` is **not** atomic as a pair. Design a generation/manifest
      switch for a true atomic snapshot before claiming atomic publication.

### Phase 4.3b — Retrieval relevance and answer evaluation (separate PR)

- [ ] Calibrate FAISS squared-L2 distance on labeled queries; drop irrelevant
      chunks rather than always passing up to three retrieved matches.
- [ ] Evaluate Russian and English queries; compare all-MiniLM-L6-v2 with
      multilingual embeddings only after measurable evidence.
- [ ] Maintain 30–50 bilingual tests: exact projects, paraphrases, projects not
      present, missing biographies, prompt injection in source text, unrelated
      questions and invented-claim traps.
- [ ] Report source retrieval recall separately from final answer correctness,
      record latency on owner hardware, and review answers manually.
- [ ] Aim for >=90% correct supported answers and zero unsupported claims in
      unknown-fact tests before marking quality accepted. These are release
      criteria, not guarantees about every user question.

### Phase 4.2 — React Chat UI functional parity (required; separate PR)

This restores the chat experience drafted on
`wip/portfolio-ui-draft/src/components/Chat.tsx`. It must coexist with the
accepted React design, drawer, themes, projects and Contact.

- [ ] Reuse/review the WIP Chat implementation rather than inventing a different
      chat product; keep the widget purpose limited to portfolio questions.
- [ ] Restore accessible open/close controls, a responsive panel, keyboard send
      (Enter; Shift+Enter newline), visible Send, Stop, retry and clear/new
      conversation; cap messages at the API's 300-character limit.
- [ ] Preserve user drafts on offline, timeout, failed and stopped requests;
      prevent duplicate submissions; display online/offline readiness honestly.
- [ ] Preserve safe text rendering, validated source links and responsive focus
      behavior; avoid a second competing modal when the drawer is open.
- [ ] Add unit/API-mock and browser regression tests for chat plus existing
      drawer/project/contact journeys. Manual review includes mobile keyboard.
- [ ] Validate local/mock `/chat` contract first. Do **not** enable public
      Vercel-to-local-host requests, ship a key, or introduce a cloud host by
      merging a UI-only PR. Explicit approval is required before public exposure.

### Other independent slices (deferred)

- [ ] Phase 5 remainder — chat-specific tooling and any explicitly scoped
      frontend modernization (the React/TS/Vite baseline already shipped).
- [ ] Phase 6 — Optional Three.js scene/effects.
- [ ] Phase 7.1 — Final cross-browser, accessibility, and performance checks.
- [ ] Phase 7.2 — Real-device checks and final production release hardening.
- [ ] Remote/cloud AI hosting — **not currently planned**. Reconsider only
      after an explicit owner decision; the $0, own-computer preference wins.

## Next execution order

1. Review/approve Draft PR #13 **only after** the required local-runtime and
   security review; no merge without explicit owner permission.
2. Finish recording the public frontend post-deploy/human verification gate.
   A Vercel deployment status alone does not close this gate.
3. Restore Phase 4.2 React Chat UI behind a safe local/mock-only integration
   boundary; review its design/behavior before any public connection.
4. Complete Phase 4.3a knowledge/source mapping and Phase 4.3b grounded-answer
   evaluation against reviewed owner-local facts. This can be designed in
   parallel, but should be accepted in its own PR(s) and test evidence.
5. Assess Phase 6 optional visual effects and Phase 7 device/accessibility
   hardening only after core parity and outstanding QA gates are resolved.

Do not replace the original product goal with hosting experimentation or a
different feature set. Large behavior changes require prior owner agreement.

## Required close-out for every future slice

Implementation -> focused tests -> required regression -> build/preview smoke ->
review -> merge -> verify the affected runtime -> human acceptance -> close slice.
For public frontend changes, verify the Vercel deployment and public browser
journeys. For local backend-only changes, verify the owner's own computer and
`/health`, `/ready`, `/chat`; there is no cloud deployment gate.
Record evidence in `docs/VALIDATION.md`. The previous frontend release's
unrecorded public smoke/human gates remain explicitly open rather than inferred
from a successful Vercel status.
