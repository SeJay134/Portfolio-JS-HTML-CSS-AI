# Release candidate — Public Portfolio (frontend only)

Source: reviewed portfolio implementation from
`wip/portfolio-ui-draft` @ `3d4ee12cb4f2d68c1c1c55c884389c8eec575516`.
Base: `main` @ `bcc8afbc1c4e2ecbe4bacde8084beeba981bc172`.

## Included
- Hero, curated local project cards and keyboard-accessible URL filters.
- Responsive light/dark/system themes, drawer, Experience and Skills.
- Private local mailto/copy contact, legacy anchors and history sync.
- Build-time prerender, SEO metadata, robots, sitemap, social preview and favicon.
- Only the React/Vite toolchain and tests required for the portfolio.

## Explicitly deferred
- Backend and RAG infrastructure / API hosting (separate backend PR).
- Phase 4.2 Chat UI and client API requests.
- Phase 6 optional Three.js effects.
- Live RAG evaluation, owner-unverified resume and speculative outcomes.

## Merge gate
- [ ] Push + PR CI on **this** release branch pass (lint/typecheck/build,
      unit tests, smoke, all cross-browser regressions).
- [ ] Verify owner-controlled work history and project descriptions.
- [ ] Human desktop/mobile Preview review of navigation, filters and Contact.
- [ ] Confirm Vercel `main`, `npm run build`, `dist`.
- [ ] Review PR diff, merge approved SHA and confirm production deploy SHA.
- [ ] After deploy: root, robots, sitemap and social PNG serve 200;
      inspect canonical/OG/Twitter HTML; test key browser journeys.
- [ ] Record the result in `docs/VALIDATION.md` and retain rollback.

**Do not merge the original mixed-scope PR #11 as-is.** Extract its remaining
backend and Chat/3D work into independent subsequent PRs against the new main.
