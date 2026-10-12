# React Chat UI — local-only development slice (Phase 4.2)

This is an intentionally separate **draft PR** branched from the verified
frontend `main`. The public Vercel site must remain independent of the user's
computer and carry no AI secrets.

## Try the original Chat interface locally

Use **two Git worktrees** so the local backend from Draft PR #13 and
the frontend from Draft PR #14 can run concurrently without mixing source
files or accidentally restarting an older `llm/app.py`.

Terminal A: stay in the original repository where `data/base/` and
`data/embeddings/` exist. Check out PR #13 and run its server:

```powershell
git fetch origin
git switch feat/local-ai-runtime-security
.\.venv\Scripts\Activate.ps1
python -m llm.app
```

Terminal B: create a separate frontend-only worktree from the new branch:

```powershell
git worktree add --detach ..\Sergei-Luna-Chat origin/feat/react-chat-ui-local-preview
Set-Location ..\Sergei-Luna-Chat
npm ci
$env:VITE_ENABLE_CHAT_UI="true"
npm run dev
```

The second worktree intentionally has no private `data/` directory. Its
frontend talks only to the first worktree's running local Flask server.
Stop both processes when finished.

Open http://127.0.0.1:5001 and select **Ask about me** in the lower-right
corner. `src/lib/api.ts` calls `http://127.0.0.1:5002/chat` and `/ready`
**only in a local Vite dev session** (`import.meta.env.DEV` and loopback
browser hostname). Cross-origin access must remain confined to Flask's
configured local origins.

The launcher appears **only in Vite DEV when the opt-in flag is true**.
Every `npm run build` output remains chat-free, even when the environment
contains `VITE_ENABLE_CHAT_UI=true`. This prevents hydration differences in
the static prerender and prevents accidentally shipping an offline-only
chat panel. A public static site cannot rely on visitors reaching a server
running on the owner's PC.

No `VITE_API_BASE_URL`, ngrok URL, backend key, cloud service, or remote proxy
is introduced. Do not add these without explicit owner agreement.

## Feature parity and pending acceptance

Adapted from the original `wip/portfolio-ui-draft`:
- Chat launcher, responsive panel, example prompts and locally rendered history
- Send, Enter / Shift+Enter, Stop, Retry, Clear chat
- Readiness/offline feedback, timeout and draft retention
- Safe text rendering; only verified HTTPS GitHub/portfolio source URLs are linked
- Focus restoration, keyboard modal dialog on mobile and menu switch

**Still requires:** owner visual review at desktop/mobile; real local Vite-to-
Flask/Ollama E2E; PR CI/keyboard/failed-request tests; source provenance and
retrieval quality improvements tracked separately in Phase 4.3. A production
public chat connection is **not** part of this PR.

## Browser test (offline fixtures, no Ollama dependency)

```powershell
npm run test:chat-dev
```

The test starts a Vite DEV process with Chat enabled on loopback, intercepts
Flask URLs with deterministic JSON responses, checks actual chat interactions
and mobile menu transitions, and never calls a remote/cloud service. The
existing frontend CI additionally verifies default production behavior.
