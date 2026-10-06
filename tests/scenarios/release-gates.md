# Public-portfolio release gate

Record exact deployed SHA, HTTP statuses and human review in docs/VALIDATION.md.

## Pre-merge
- [ ] Release PR contains only accepted frontend with no Chat/3D/backend changes.
- [ ] Lint, typecheck, unit tests, build and prerender pass.
- [ ] Smoke, browser and accessibility regressions pass.
- [ ] Owner verifies employment facts and project content.
- [ ] Human checks Preview on desktop and mobile.

## Post-merge
- [ ] Deployed production commit matches approved main SHA.
- [ ] Site, robots.txt, sitemap.xml, social image return 200.
- [ ] Canonical, OG, Twitter metadata and headings exist in fetched HTML.
- [ ] Drawer, filters, Contact drafts, deep links work on desktop/mobile.
- [ ] Rollback target and owner verification recorded.

A failed release gate blocks the next feature branch until fixed or rolled back.
