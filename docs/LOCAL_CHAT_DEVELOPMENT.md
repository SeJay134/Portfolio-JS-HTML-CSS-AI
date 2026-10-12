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

### Troubleshooting Windows ports, browser installs and Node

**Only port 5001 is supported for the local Vite frontend.** Flask listens
on port 5002. If `npm run dev` reports port 5001 occupied, do **not** use
Vite's fallback 5003: Flask's CORS allowlist covers
`http://127.0.0.1:5001` and `http://localhost:5001`, not 5003.

Stop the previous Vite process with Ctrl+C, and inspect the port before
stopping any other process:

```powershell
Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalAddress,LocalPort,OwningProcess
# Substitute the returned PID. Confirm its identity before stopping it:
Get-Process -Id <PID> | Select-Object Id,ProcessName,Path
```

Leave the Flask process on 5002 running. With `--strictPort`, Vite now fails
clearly instead of changing its URL and breaking local CORS. After stopping
only the known unwanted process, start Vite again.

The initial worktree command used `--detach`. To fetch the latest PR #14
fixes in the already-created `Sergei-Luna-Chat` folder:

```powershell
# Stop the old Vite process with Ctrl+C first.
cd "C:\Users\patru\OneDrive\Documents\GitHub\Sergei-Luna-Chat"
git status
git fetch origin
git switch --track origin/feat/react-chat-ui-local-preview
$env:VITE_ENABLE_CHAT_UI="true"
npm run dev
```

Run `git switch --track` only once. After it creates the local tracking
branch, future updates are `git pull --ff-only`. Never force/reset worktree
changes that have not been reviewed and saved.

If Playwright reports a missing Chromium headless executable, this is a
browser installation failure, **not** a failing chat assertion:

```powershell
npx playwright install chromium
npm run test:chat-dev
```

Stop the separate Vite server on 5001 before `test:chat-dev`; Playwright
launches its **own** Vite server with the correct flag and rejects reuse of
a different or stale app.

The project's locked jsdom dependencies need Node.js 22.22.2+ or 24.15.0+;
Node.js 22.13.1 can install with `EBADENGINE` warnings but should be upgraded
for reliable local testing. Open a new terminal and confirm `node -v` after
updating Node, then run `npm ci` again. Review `npm audit` findings separately;
do not blindly run `npm audit fix` on a release branch.

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
