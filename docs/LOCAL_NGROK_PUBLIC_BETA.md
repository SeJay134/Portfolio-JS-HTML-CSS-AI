# Public ngrok/Flask runtime — owner-hosted preview

**Selected topology:** Visitor → Vercel same-origin `/api/chat` → Vercel
server-side relay → ngrok HTTPS → Flask on the owner's computer → local
FAISS + Ollama (`qwen2.5:7b`). No remote model, new model provider or
off-machine knowledge storage.

This is **NOT** permission to expose the existing private RAG process.
A public instance must run with `PUBLIC_ONLY_MODE=true`. This changes
only which documents are indexed **in memory** at serving time:
`llm.public_retriever.PublicCatalogueRetriever` creates a fresh FAISS index
from the four reviewed `content/public-projects.json` project cards.
It must never load the owner's private `data/base` or existing mixed
`data/embeddings/index.faiss` / `meta.json`.

## Backend protection

- `PUBLIC_ONLY_MODE=true` is required on the public Flask instance.
  It refuses startup without `REQUIRE_API_KEY=true` and a secret of at
  least 24 characters.
- The public tunnel must terminate at this **public-only Flask process**,
  never at the private-owner Flask runtime.
- Only `/chat` and `/ready` are proxied by the Vercel relay. Both require
  `X-Local-API-Key`. The browser never sees this key or the ngrok hostname.
- The local process remains bound to `127.0.0.1:5002` and reachable via
  `ngrok http 5002`. Set `TRUSTED_HOSTS` to include loopback and the
  **exact** hostname assigned by ngrok. Do not use `0.0.0.0`.
- The local Flask server uses one conservative **global** rate-limit bucket
  for the public beta, plus `MAX_GENERATIONS=1`. This deliberately favors
  safety over allowing many simultaneous visitors. Rate-limit storage is
  process-local; not suitable as a distributed or large-scale DDoS defense.
- Flask refuses non-loopback trusted hosts unless both API-key protection
  and public-only retrieval are enabled.

## Owner setup — secret values are never committed

1. On the computer, review that the checked-out code includes the public
   runtime branch (this PR) and the source provenance branch (PR #15).
   Stop the private Flask server before opening the tunnel. **Do not
   run ngrok against an old Flask build.**
2. Create a long, random secret locally and retain it privately. Set
   `LOCAL_API_KEY` in the Flask shell. Set
   `PUBLIC_ONLY_MODE=true`, `REQUIRE_API_KEY=true`,
   `MAX_GENERATIONS=1`, and a small `CHAT_LIMIT` such as `4/minute`.
3. Start `ngrok http 5002` and note the HTTPS hostname (do not paste
   it into source code). In the Flask PowerShell set
   `TRUSTED_HOSTS=127.0.0.1,localhost,<exact-ngrok-hostname>`.
4. **For public visitors**, serve the public-only Flask app through
   Waitress (Windows-compatible production WSGI), rather than Flask's
   development server. Install the reviewed requirements into the venv:
   `python -m pip install -r requirements-local-api.txt`. Run:
   `waitress-serve --listen=127.0.0.1:5002 --threads=4 llm.app:app`.
   The ngrok tunnel still points to local port 5002.
   Do **not** start `python -m llm.app` alongside Waitress on that port.
   `python -m llm.app` remains a local *development-only* command.
   Verify local `/ready` and `/chat` reject requests without the key.
   With the key they must use only the four reviewed public project cards.
   Owner-local `data/base` and private index must remain untouched.
5. In the Vercel `sergei-luna` project set **server-only** environment
   variables `NGROK_TUNNEL_ORIGIN` (the HTTPS origin, no path) and
   `LOCAL_FLASK_API_KEY` (same secret) in Preview environment first.
   Never use `VITE_*` for either secret.
6. In the Preview environment of the beta branch only, set the **public**
   flag `VITE_ENABLE_PUBLIC_CHAT_UI=true`. The Vercel Function proxies
   same-origin `/api/chat` and `/api/ready`; no frontend cross-origin
   CORS or browser secret is required.
7. Verify the exact Preview deployment by asking the four-project question,
   an absent-fact question and Russian-language question. Check source URLs,
   rate limiting, offline/PC-disconnected message, long Ollama latency and
   keyboard/mobile UI. Do not run broad load tests against the laptop.
8. Only after successful manual tests and reviewed branch integration,
   explicitly approve the production merge/flag rollout, with a quick
   rollback mechanism: remove the production UI flag / redeploy or stop ngrok.
   If the PC is off, visitors must see offline, not a fabricated answer.

## Important limitations

The owner computer must remain on, awake and connected. For an ongoing public beta, use the pinned Waitress WSGI server rather than the Flask development server; keep port 5002 bound to 127.0.0.1. Ngrok free tunnel
URLs can change after restarts. Vercel server-only `NGROK_TUNNEL_ORIGIN`
must then be updated and the relevant deployment refreshed. Protect the
secret, do not post it to GitHub, chats, screenshots or browser JavaScript.

The Vercel relay uses a 125-second upstream timeout; the local model's
default read timeout is 120 seconds. Public browsing and model generation
times can vary. The current UI waits 135 seconds. This is a **small beta**,
not a high-availability public service. Public RAG answers may still fail
language/relevance evaluations tracked in separate Draft PR #16.

No main-branch merge or public flag activation is performed by this document.
