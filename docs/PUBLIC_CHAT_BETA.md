# Public portfolio chat beta — deployment gate (Draft PR #17)

**Status:** Frontend wiring prepared; **not live, not ready to merge**.
Depends on the React chat implementation in Draft PR #14 and the
source-provenance review in Draft PR #15. This is a separate public release
task from Phase 4.3b model-quality research (Draft PR #16).

## What changed in this branch

- Local Vite development continues to use the owner's `127.0.0.1:5002` Flask API.
- For production, `VITE_ENABLE_PUBLIC_CHAT_UI=true` would opt into the same
  Chat component, calling **only relative, same-origin HTTPS**
  `/api/ready` and `/api/chat` routes.
- The flag is **off by default**. There is no public API route in this PR:
  public requests would not work even if the flag were manually forced on.
  Do not turn it on until the conditions below are satisfied.
- No hostname or secret in a Vite public environment variable may be used to
  connect to the owner's laptop. The public client is never authorized to
  contact loopback, ngrok, Ollama or the private Flask runtime directly.

## Mandatory server-side prerequisites

1. Choose a publicly reachable inference host and verify operational cost,
   uptime, response time and the same-language response baseline. A static
   Vercel page cannot itself run the current Flask + FAISS + qwen2.5:7b
   stack; a separate server/AI runtime is required. Do not silently change
   the model or simulate Ollama with a canned chatbot.
2. Serve **only owner-reviewed public portfolio knowledge**. Do not deploy or
   expose `data/base/`, old user notes, private embeddings, `.env`,
   training examples, or local filesystem paths. A public-only index and
   generation policy must be explicitly validated.
3. Implement server-side abuse protection: shared/IP or session rate limits,
   request size caps, concurrency cap, bounded response latency, bot controls
   and spending/usage ceilings; ensure protection persists across instances.
4. Keep provider credentials server-side. Browser traffic must go through
   same-origin HTTPS endpoints; never ship secrets in `VITE_*` values.
   Validate response schema and strict source URL allowlist.
5. Define minimal retention and logging: no stored visitor question history by
   default and no sensitive prompt contents in application logs. Show visitors
   an AI accuracy/privacy notice and a working Contact fallback.
6. Owner verifies the public URL, mobile and keyboard behavior, real
   `/api/ready` and `/api/chat`, abuse limits, offline errors, sources, and
   rollback. Test a Preview deployment before enabling on production.
7. Verify all applicable GitHub CI checks, explicitly approve the reviewed
   deployment PRs, then enable the flag in production Vercel settings and
   redeploy. Do not merge or enable the beta solely because CI passes.

## Hosting decision to make

**Option A — managed external AI server (preferred for untrusted visitors):**
real HTTPS inference service separate from the laptop, with a public-only
catalogue and safe rate limits; requires provider selection and budget review.

**Option B — owner-hosted PC:** technically possible only after a separate
security design for network exposure, isolated public-only corpus, reliable
availability and abuse prevention. **Do not expose the existing Flask dev
server or private FAISS corpus directly.**

The user has requested public chat testing; that authorizes planning a safe
release, but does not supply an inference host or credentials. This branch
intentionally changes no production deployment until those are available.
