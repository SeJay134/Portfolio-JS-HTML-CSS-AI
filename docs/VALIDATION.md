# Public portfolio release — validation

Status: **release candidate only; not merged or deployed to production**.

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

## Release checks
- [ ] CI lint / typecheck / unit tests / production build green on final SHA
- [ ] CI smoke and Chromium, Firefox, WebKit browser regressions green
- [ ] Owner approves employment dates, claims and curated project descriptions
- [ ] Human Preview check: desktop/mobile appearance, keyboard, contact
- [ ] Confirm Vercel production branch `main` and `dist/` build artifact
- [ ] Merge approved release commit; confirm deployed production SHA
- [ ] Production root, robots.txt, sitemap.xml, social-card.png return 200
- [ ] Canonical, OG and Twitter metadata visible in live HTML source
- [ ] Real browser navigation, filter, mailto draft and mobile checks
- [ ] Rollback deployment recorded and next branch based on verified main

Previous development evidence is available on
`wip/portfolio-ui-draft` and in PR #11. This checklist records results for
the **separated** release, not an implied acceptance of the original draft.
