# Release candidate — public portfolio

Source: `wip/portfolio-ui-draft` @ `3d4ee12cb4f2d68c1c1c55c884389c8eec575516`.
Base: `main` @ `bcc8afbc1c4e2ecbe4bacde8084beeba981bc172`.

## Included
- Hero, curated project cards, keyboard filters and URL state, local WebP previews.
- Themes, accessible drawer, experience/skills, local email-draft Contact.
- Stable legacy anchors, prerendered SEO metadata, robots, sitemap, social card.
- Already accepted backend/RAG index source (not a production model deployment).
- React/Vite toolchain necessary for the public site build.

## Excluded from this frontend release
- Chat UI / API client (Phase 4.2); optional 3D / Three.js (Phase 6).
- Production RAG hosting, live model evaluation (Phase 4.3).
- Unreviewed resume, speculative outcomes and user claims.

## Release gate — still open
- [ ] CI: lint, typecheck, unit, backend, build, smoke, full browser regression.
- [ ] Owner approves employment/content facts and Preview UI/navigation/contact.
- [ ] Vercel settings confirm `main` deployment, `npm run build`, `dist` output.
- [ ] Review and merge only this scoped release PR (not monolithic PR #11).
- [ ] Verify production deployed SHA, root/robots/sitemap/share image 200,
      canonical/OG/Twitter metadata and contact/filter/drawer mobile paths.
- [ ] Record live result, smoke and rollback target in `docs/VALIDATION.md`.

The original PR #11 must be reconciled or rebased after this first merge.
