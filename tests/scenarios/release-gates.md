# Release Gate Scenarios

Record concrete results and deployed revision in docs/VALIDATION.md.

## Pre-merge
- [ ] Scope matches one roadmap subphase/fix/contract change.
- [ ] Unit and relevant integration tests pass.
- [ ] Touched regression tests pass.
- [ ] Required E2E/accessibility checks pass.
- [ ] Lint, typecheck, and production build pass.
- [ ] Smoke passes against build/preview.
- [ ] Contract changes are documented/tested.
- [ ] ROADMAP.md and docs/VALIDATION.md are updated.

## Post-merge / deployed site
- [ ] Deployment matches expected main revision.
- [ ] Home loads without fatal console errors.
- [ ] Navigation and an affected deep link work.
- [ ] Projects/contact remain usable if AI API is unavailable.
- [ ] Changed journey works in a real desktop browser.
- [ ] Mobile-sensitive change is checked on a real mobile browser/device.
- [ ] Rollback target is known.
- [ ] Human verifier records pass/fail and date.

Do not start the next feature slice while a post-deploy item is failed/unresolved.
