# Public portfolio chat beta — deployment gate (Draft PR #17)

**Status:** Frontend and Vercel relay prepared; **not live, not ready to merge**.
Depends on the React chat implementation in Draft PR #14 and the
source-provenance review in Draft PR #15. This is a separate public release
task from Phase 4.3b model-quality research (Draft PR #16).

## What changed in this branch

- Local Vite development continues to use the owner's `127.0.0.1:5002` Flask API.
- For production, `VITE_ENABLE_PUBLIC_CHAT_UI=true` would opt into the same
  Chat component, calling **only relative, same-origin HTTPS**
  `/api/ready` and `/api/chat` routes.
- The flag is **off by default**. The public API routes exist but fail closed until their server-side
  tunnel URL and key are configured.
  Do not turn it on until the conditions below are satisfied.
- No hostname or secret in a Vite public environment variable may be used to
  connect to the owner's laptop. The public client is never authorized to
  contact loopback, ngrok, Ollama or the private Flask runtime directly.

## Mandatory server-side prerequisites

1. Use the owner's confirmed ngrok tunnel, key-protected Flask and the
   existing qwen2.5:7b running only on the PC. The Vercel Function is a
   narrow HTTP relay, not a second model runtime.
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

## Hosting decision — confirmed owner choice

The owner confirmed the original architecture: **ngrok tunnel → Flask →
FAISS → Ollama on the owner's own Windows PC**. No separate compute host
or new model provider is planned. The frontend uses a minimal Vercel
serverless relay, because browser calls must not contain Flask credentials
or the tunnel URL.

**Request path:** browser → same-origin `/api/chat` → server-only Vercel
function → HTTPS ngrok origin → API-key-protected, public-only local Flask
→ in-memory FAISS over the four reviewed public cards → qwen2.5:7b.

PR #17 implements the Vercel relay and browser integration. Separate
Draft PR #18 implements `PUBLIC_ONLY_MODE` for Flask, which **must be
enabled** before starting ngrok. This mode never loads the owner's private
FAISS index or `data/base` files.

The bridge expects these Vercel **server-side** environment variables
(initially scoped to Preview):
- `NGROK_TUNNEL_ORIGIN`: exact HTTPS ngrok origin, e.g.
  `https://your-subdomain.ngrok-free.app` (no trailing path)
- `LOCAL_FLASK_API_KEY`: random secret equal to Flask `LOCAL_API_KEY`.
  Treat as a Vercel **Secret**, not a public `VITE_*` value.
- `VITE_ENABLE_PUBLIC_CHAT_UI=true`: optional non-secret Preview flag
  **only after** the backend and relay have passed tests.

Vercel functions `api/chat.js` and `api/ready.js` are fail-closed
without their server-side settings. `/api/chat` forwards at most a 300
character question and exposes only sanitized `reply` and `sources`.
Upstream HTTP errors and exceptions return generic responses; neither
the tunnel URL nor the key is copied to the browser. Server-side
`X-Local-API-Key` is sent over HTTPS.

Stop ngrok to disable external access immediately. If the laptop sleeps,
goes offline or the tunnel URL changes, public Chat will be unavailable.
This is expected for an owner-hosted alpha/beta and must be shown honestly.
See `docs/LOCAL_NGROK_PUBLIC_BETA.md` on the PR #18 branch for exact
Flask startup/security prerequisites.

## October 13, 2026 — authenticated Vercel connection inspection

Authenticated connection confirms the team `Sergei's projects` uses the
**Hobby** plan. The `sergei-luna` project's latest production deployment is
READY and sourced from GitHub `main` SHA
`cea29189a7e961735f95d13ee086eb6a80016469`, the intentionally
static/Chat-disabled React release. The project lists no configured
project environment variables, and its project routing-rule list is empty;
this is **not** evidence of a functional public model backend.

There is a separate Vercel project
`portfolio_ai_rag_chatbot_faiss` connected to a different historical
repository. Its single initial production deployment is marked READY,
but the repository README itself describes the LLM backend as running
**locally or on a private server**. A READY deployment by itself does
not establish a working public Ollama inference service. Do not point
visitors at that project without checking a real protected /chat endpoint.

**Deployment decision remains open:** select a protected, reachable
inference host and operational budget; implement same-origin API routes,
public-only corpus and abuse controls; test live. Do not set
`VITE_ENABLE_PUBLIC_CHAT_UI=true` yet.
