## Public-portfolio release candidate — not yet merged or deployed

This branch extracts the reviewed public-portfolio UI from
`wip/portfolio-ui-draft` and is based on `main`. It excludes the unaccepted
Chat UI/client and optional 3D/Three.js code. Backend sources remain in the
repository but are not connected to this static frontend deployment.

Required before merge: CI for this branch, owner review of biographical and
employment claims, Preview visual/keyboard/contact checks. Required after
merge: confirm production commit, root/robots/sitemap/social image statuses,
metadata, mobile navigation/contact and rollback readiness. No verification
is claimed until recorded here.

---

# Work-in-progress validation checkpoint

The accepted backend checkpoint is on `feat/portfolio-modernization`.
This branch preserves the previously prepared UI draft for staged review.
Nothing on this draft branch is a production release.

## Completed checks

- Backend: 27 passing pytest checks, including real FAISS index publication.
- Frontend before final edits: TypeScript build, ESLint, and 4 component/API tests passed.
- Chromium desktop/mobile: the original 12 scenarios passed after fixes; expanded
  coverage exposed focus wrapping and Stop-button resubmission defects, now fixed.
- Six targeted reruns for modal focus, cancellation, and axe checks passed.
- Local single-run Lighthouse measurements and screenshots are in this directory.
  They precede the final edits and are not final release measurements.

## Current merge policy and transition gate

The repository now uses: small scoped branch -> focused tests -> required
regression -> merge -> deploy -> smoke -> human browser check.

The existing `wip/portfolio-ui-draft` predates this rule and already contains
multiple drafted frontend areas. It is a one-time transition package closed at
**Phase 5**, after Phase 2.2, Phase 3, and Phase 4.2 are separately accepted and
the complete merge gate is green. After deployment, a human browser verification
is required before Phase 4.3 or Phase 6 begins from a fresh branch.

The next acceptance checkpoint is **Phase 3 — hero, curated projects, and
responsive layout**.

## Baseline project-data blocker resolved — September 28, 2026

The missing typed project source was reconstructed from reviewed project facts and
is now covered by content/unit tests. Frontend typecheck/build and smoke checks are
green again. The earlier blocker no longer prevents staged frontend acceptance.

## Pending acceptance

- Full Chromium/Firefox/WebKit browser regression remains reserved for PR/main and
  later cross-browser acceptance; the branch-level Chromium regression is green.
- Finish the interrupted font optimization; no local font binaries were saved.
- Firefox/WebKit: local environment launch/dependency limitations prevented acceptance.
- Live Ollama/RAG evaluation, production API URL, real phones, and deployment.
- Review one roadmap subphase at a time before marking it complete.

## Phase 3.1 accepted — October 1, 2026

- Baseline `ffc1323395b7e4137c8441d29b5728511dd7f6d2` has successful GitHub
  Actions run `36416650491`; Phase 2.2 remains accepted.
- Fixed repeated selection of the active project category adding duplicate
  browser-history entries; added a component regression test.
- Moved the existing API-offline project scenario into the project regression
  suite and expanded it to cover Hero links, keyboard filters, URL preservation,
  reload, Back/Forward, invalid categories, failed preview images, and details.
- Accepted implementation checkpoint: `e8e927056728e74f3eb68c2a14cccf6bd4e114fa`.
- GitHub Actions run `36916672099`: frontend, backend, smoke, and branch-regression
  all passed. Evidence: 13 frontend unit tests, 27 backend tests, and 13 Chromium
  regression tests (including all three project scenarios); lint, typecheck,
  production build and prerender passed. The PR/main multi-browser job was
  intentionally skipped by branch policy.
- Local Chromium installation failed because the downloaded archive was invalid;
  browser acceptance above is based on GitHub Actions, not a local browser run.
- The user authorized GitHub publication on October 1; the verified implementation
  is now in `wip/portfolio-ui-draft`.
- Phase 3.2 still requires the six-width responsive and visual review, including
  light/dark composition and content verification. Phase 3 is not accepted yet.
- No merge, production deployment, or later roadmap phase is included in this slice.

## Phase 1.4 accepted — September 25, 2026

- Whitespace-only input shows associated validation errors and focuses the field.
- Editing inputs invalidates the prepared draft immediately.
- Clipboard success is confirmed only after completion; denial exposes a selectable fallback.
- Late clipboard results cannot mark a changed draft as copied.
- Visitor input remains encoded text, never HTML or a network submission.
- Passed: 6 contact component tests and 4 Chromium desktop/mobile browser checks.
- Passed: TypeScript production build, targeted ESLint, and whitespace checks.
- This accepts the email-draft flow, not an automated email-delivery service.
- Other UI subphases remain pending; the production site has not been changed.

## Phase 2.1 accepted — September 25, 2026

- Light, dark, and system preferences persist and follow operating-system changes.
- Invalid saved preferences fall back to system; blocked storage does not prevent switching.
- Theme changes synchronize across tabs; hydration preserves the initial saved theme.
- Browser theme color tracks the active palette; no-JavaScript pages follow system colors.
- Form boundaries exceed 3:1 contrast against their adjacent surfaces in both palettes.
- Passed: 12 desktop/mobile Chromium theme checks, including axe WCAG A/AA scans.
- Passed: ESLint, TypeScript production build, and whitespace checks.
- Reviewed desktop dark and mobile light screenshots with visible validation errors.
- Firefox/WebKit and final release checks remain pending under Phase 7.1.


## Phase 2.2 accepted — September 28, 2026

- The left navigation is a native modal dialog with a full-screen overlay and an
  inner touch-friendly drawer panel.
- Escape, the close button, backdrop interaction, and section selection close the
  drawer through explicit dismiss/navigation paths.
- Keyboard focus is trapped inside the open modal. Dismissal restores focus to the
  Menu trigger without scrolling the page; section navigation transfers focus to
  the selected section.
- Section navigation preserves stable anchors and synchronizes
  `aria-current="location"` with explicit navigation and normal page scrolling.
- The active-section scroll spy is frozen while the modal is opening/open so modal
  focus behavior cannot overwrite the current page section.
- Body scroll is locked while the drawer is open and released before navigation.
- The drawer remains usable after a 390x844 resize and respects safe-area/dynamic
  viewport sizing.
- Opening the drawer closes the chat modal while preserving the visitor's chat
  draft, maintaining one modal owner at a time.
- Reduced-motion mode disables the drawer animation, and automated axe WCAG A/AA
  checks report no violations in the drawer scenario.
- Accepted implementation checkpoint:
  `f4f5ed496a2561b3c70333360a781436cd25c6a6`.
- GitHub Actions run `36416335520`: frontend passed, backend passed, smoke passed,
  and branch Chromium regression passed **10/10**. The PR/main multi-browser job
  was intentionally skipped by branch policy.
- This accepts Phase 2.2 only. The WIP branch is not ready to merge or deploy until
  Phase 3, Phase 4.2, Phase 5, and Merge Gate A are completed.

## Phase 3.2 verification — October 1, 2026

- Reviewed the existing section sequence, four curated project records, local
  preview assets, heading structure and canonical/OG metadata. Biography, skill
  and employment copy remains aligned with the existing reviewed knowledge
  source; this is not a new owner confirmation of employment dates.
- Reduced the mobile Hero heading minimum from 48px to 40px to retain readable
  phrases at 320px. Reserved a 240px minimum preview height and explicit 100%
  width: the new test first exposed AI illustration clipping at 320px, then
  confirmed the correction without expanding the card beyond its container.
- Replaced the earlier single E2E overflow check with 12 regression cases:
  six widths x two themes, including font-service failure, local image loading,
  expanded details, section order, internal overflow and reduced motion.
- Local Chromium 153: all 27 regression/smoke checks passed (25 regression + 2
  smoke). All 13 frontend unit tests, ESLint and TypeScript/production build passed.
- Automated axe scans of main content passed at 320 and 1440 pixels in both
  themes. Reviewed local mobile/desktop light/dark screenshots; no production or
  real-device verification is claimed. Screenshots use system fallback fonts.
- Branch CI now retains the regression report and four full-page screenshots
  on successful runs as well as failures, for review of this implementation.
- CI verification is pending. Phase 3.2 and aggregate Phase 3 remain unaccepted
  until that gate passes. Phase 4.2, 5, Merge Gate A and Phase 7 remain separate.
