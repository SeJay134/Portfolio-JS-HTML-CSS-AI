# Original feature-parity acceptance — React redesign

Purpose: preserve the intended portfolio behavior through the React/TypeScript
redesign. This is an **acceptance plan**, not evidence that deferred functionality
has shipped. It supplements automated checks under `tests/`.

## Public frontend (already implemented; production verification still open)

- [ ] Hero renders and links to Projects and Contact; project details, working
      demos and repositories remain accessible without GitHub API availability.
- [ ] Left menu works by pointer, keyboard and screen reader; Escape/backdrop/
      section link closes it, focus behaves correctly, and deep links survive.
- [ ] Themes switch between system/light/dark, persist, and retain contrast.
- [ ] Featured projects show real titles, category filters, image fallbacks and
      keyboard-accessible links; Back/Forward keeps filter and anchor state.
- [ ] Skills, Experience and About remain visible and readable at mobile and
      desktop breakpoints. Employment and project claims are owner-reviewed.
- [ ] Contact provides a functioning user-initiated email draft/copy workflow
      and **never** claims a message was delivered without a delivery backend.
- [ ] Public site stays usable with the owner's PC/Ollama unavailable.
- [ ] Capture real production URL checks, metadata and human device evidence in
      `docs/VALIDATION.md` rather than treating passing CI as production proof.

## React Chat UI (required to complete original functional intent; not shipped)

- [ ] Desktop launcher opens an accessible, sized chat panel; mobile panel
      fits the viewport/keyboard, with clear Close and appropriate focus return.
- [ ] Menu and modal chat never create competing overlays or focus traps.
- [ ] Send via button or Enter; Shift+Enter inserts a newline; 300 Unicode
      code-point limit matches the Flask API contract.
- [ ] Sending shows pending state; double send is blocked; Stop works without
      claiming to cancel server computation.
- [ ] Network failure, 429/503, offline Ollama and timeout show accurate errors,
      keep drafts and allow retry without double-adding the user message.
- [ ] Chat messages render as text, not untrusted HTML. Source links (when
      implemented) are safe/allowlisted; `sources: []` shows no fake citation.
- [ ] Clear/new conversation resets the client transcript and draft. Current
      backend is stateless; the UI never promises remembered server history.
- [ ] Example prompts about projects, skills and contact are available; the AI
      honestly says when portfolio evidence is absent.
- [ ] Public Vercel frontend does **not** ship a personal API secret, ngrok URL
      or silently depend on the owner's PC. Local testing works with localhost
      or a mocked API until public exposure is separately approved.

## Local Flask / FAISS / Ollama (Draft PR #13; owner-local smoke observed)

- [x] Owner tested `/health`, `/ready`, and `/chat` against a running local
      Ollama process, with a nonempty reply.
- [ ] Check failure cases locally (validation, limit, offline, blocked host),
      as well as the intended error responses and no user-content logging.
- [ ] Verify answer accuracy using reviewed knowledge. First owner test
      returned generic categories rather than canonical named projects.
- [ ] Restore verifiable public citations when matching sources exist;
      do not fabricate sources when none are known.
- [ ] Test English/Russian relevance and unknown facts before claiming
      production-quality RAG answers.

## Scope/approval boundary

Safety fixes and parity defects may be repaired in the relevant focused PR,
with tests and an explanation. Any materially different feature, message
delivery provider, model host, API exposure, data collection or cost requires
owner review **before** implementation/merge. Never mark an unchecked item
accepted without evidence.
