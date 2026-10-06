# Sergei Patrushev — Public Portfolio (Release Candidate)

Accessible, responsive React/TypeScript portfolio with a left navigation drawer,
curated projects, local WebP images, project-category URL filters, an experience
timeline, light/dark/system themes, and a private `mailto:` contact draft.

This release deliberately has **no Chat UI, no model API requests, and no Three.js
scene**. Backend/RAG modernization remains in the original work branch and
requires a later independent pull request. See [ROADMAP.md](ROADMAP.md) and
[the release checklist](docs/RELEASE_CANDIDATE.md).

## Local development

Node 22.12+:

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:5001. Never use a static Python file server to run the
React source tree. For a production build:

```bash
npm run build
npm run preview
```

Build output is `dist/`; `scripts/prerender.tsx` adds crawlable HTML.
No API URL or backend credentials are necessary for this release.

## Visitor behavior

Project data is controlled in `src/data/projects.ts` and remains available
without GitHub or AI APIs. Filters are keyboard operable, encoded in
`?category=`, and preserve section anchors. Local images have alt text and
safe fallbacks.

Contact only prepares an email draft or copyable text. The visitor must send
the email using their own email app; this site neither stores nor submits
visitor messages. There is no public message list. Do not add a resume or
unverified employment/impact claims without owner review.

## Validation

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:smoke
npm run test:e2e
npm run test:regression
```

Browser tests use the built site at localhost:4173. See
`tests/README.md` and `docs/VALIDATION.md` for evidence and outstanding gates.

## Deployment

The Vercel configuration uses `npm run build` and publishes `dist/`.
Never merge merely because the CI is green: verify Preview, owner-controlled
content, and the review diff before merging to `main`. After deployment,
verify the deployed commit, robots/sitemap/social image, canonical metadata,
navigation, contact behavior and rollback target.

Every subsequent subphase should have its own short-lived branch, tested merge,
deployment and post-deploy acceptance.
