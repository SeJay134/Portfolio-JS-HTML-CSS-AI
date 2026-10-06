# Portfolio Roadmap

## Accepted checkpoints

- [x] Phase 0.1 — Repository review and baseline
- [x] Phase 0.2 — Reproducible backend setup
- [x] Phase 1.1 — Stateless chat and strict request validation
- [x] Phase 1.2 — Error handling, rate limits, and generation limits
- [x] Phase 1.3 — Backend regression tests: 27 passed
- [x] Phase 1.4 — Safe contact flow acceptance
- [x] Phase 2.1 — Design tokens and themes acceptance
- [x] Phase 2.2 — Accessible left drawer acceptance
- [x] Phase 4.1 — Grounded service and atomic index infrastructure

## Current transitional frontend package

The earlier project-data baseline blocker is resolved: the reviewed typed project
source and its content tests are present, and the Phase 2.2 branch gate is green.

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
- [ ] Phase 4.2 — Chat UI acceptance
- [ ] Phase 5 — Frontend architecture and tooling acceptance
- [ ] Release Gate A — public portfolio (Phases 2.1–3.9) -> full tests -> merge main -> deploy -> smoke -> human browser verification

The public-portfolio release candidate is extracted from
`wip/portfolio-ui-draft` and excludes Chat UI (Phase 4.2) and 3D effects
(Phase 6). Accepted backend source is included as a dependency baseline but is
not deployed with the static frontend. Phase 5 tooling acceptance remains a
separate task. After Release Gate A, one short-lived branch and release per slice.

## Independent follow-up releases

- [ ] Phase 4.3 — Live RAG evaluation and production backend
- [ ] Phase 6 — Optional Three.js scene/effects
- [ ] Phase 7.1 — Final cross-browser, accessibility, and performance checks
- [ ] Phase 7.2 — Real-device checks and final production release hardening

## Required close-out for every future slice

Implementation -> focused tests -> required regression -> production build/preview
smoke -> merge -> deploy -> post-deploy smoke -> human browser check -> close slice.
The next feature branch starts only after the deployed release is verified.
