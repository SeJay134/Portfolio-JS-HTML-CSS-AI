# React Chat UI — local-only development slice (Phase 4.2)

This is an intentionally separate **draft PR** branched from the verified
frontend `main`. The public Vercel site must remain independent of the user's
computer and carry no AI secrets.

## Try the original Chat interface locally

With the Vite/React frontend installed and Ollama + Flask running locally
from the separate `feat/local-ai-runtime-security` branch / PR #13:

```powershell
git fetch origin
git switch feat/react-chat-ui-local-preview
npm ci
$env:VITE_ENABLE_CHAT_UI="true"
npm run dev
```

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
