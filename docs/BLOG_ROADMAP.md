# Blog development roadmap

Approved product direction: a public author blog and private Blog Studio, with incremental pull requests. Preserve existing Vite multi-page static deployment and shared design. No new hosting service is approved.

## Phase 1A: public foundation
- Public /blog/ entry point, common drawer, theme, prerendered empty state, canonical and sitemap.
- No sample articles presented as the owner's publications.
- Browser smoke tests for navigation, no-JS, theme and mobile width.

## Phase 1B: catalogue and article rendering
- Typed article model, responsive cards, category/search controls and individual slug pages.
- Test with fixtures only until owner approves real content.

## Phase 2: database and admin access
- Reuse Google OAuth and existing profiles roles and active/blocked status.
- Owner supplies the exact administrator email privately. Store administrator allowlist in a non-public database schema; use verified Google identity and server-side role assignment. Never trust client metadata, email input or UI visibility as authorization.
- RLS denies draft reads and all writes by non-admins; protect private draft media. Test anonymous, ordinary, blocked and admin identities.
- No live migration or role assignment before review.

## Later phases
Blog Studio, visual editor, media compression, drafts and publication; revisions and scheduling; article SEO and static rendering, RSS, search; optional analytics and explicitly approved AI/RAG integration. Ensure unpublish removes static snapshots and cached media where applicable; design publication/rebuild failure handling before enabling live publishing.
