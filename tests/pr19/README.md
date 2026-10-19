# PR #19 — one-click verification (Windows)

**Only one user action:** double-click `tests/pr19/RUN_PR19.cmd` in the
PR #19 working tree (or run that file in a terminal). You do not type
credentials, switch branches, copy headers, start Flask manually, or select
a port. The script verifies its own branch. It does **not** merge or switch.

The launcher uses the project's existing `.venv`, automatically installs
missing Python dependencies **into that environment only** from the pinned
project requirements, and runs:

1. All backend and RAG unit/integration regressions, including real FAISS,
   plus isolated tests of this runner.
2. Frontend lint, TypeScript, Vitest, Node/Vercel bridge tests, and build.
   Local Playwright Chromium smoke, E2E, regression, chat-dev and chat-hydration
   suites; missing JavaScript dependencies/Chromium are installed automatically.
3. A fresh short-lived Flask process on an automatically chosen loopback
   port (does not stop or reuse your separately running port 5002).
4. A true `GET /health` and authenticated `GET /ready`, using
   `LOCAL_API_KEY` from the local `.env` and/or already-set environment.
5. An authenticated `POST /chat` and validation of HTTP 200, nonempty
   `reply`, and a `sources` list (the reply itself is never printed).
6. Stops only the Flask child process it created. Saves a secret-free report
   to `tests/pr19/reports/latest.json` (**gitignored**).

The script creates a **private loopback-only test process**, overriding its
`FRONTEND_URLS` and `TRUSTED_HOSTS` to localhost and forcing
`PUBLIC_ONLY_MODE=false` so the test exercises the actual owner-local
FAISS index. It preserves the existing `REQUIRE_API_KEY` setting and secret.
No changes are saved to `.env`, and no external tunnel is created.

The test suite uses pytest `tmp_path` for its synthetic indices and has no
permission or reason to edit your real `data/base/`, `data/embeddings/`,
`.env`, or model files. The live checks are read-only API requests: no
automatic index rebuild, model download, document deletion, Git merge, or
secret printing.

**Requirements:** Python virtual environment at `.venv`, Node.js/npm installed,
Ollama running
with the model already installed per the existing local configuration, and
a readable private RAG index. If one of these isn't ready, this is shown
as **FAIL**, not silently reported as passed. The script does not request
any secret or password.

`tests/pr19/reports/latest.json` contains PASS/FAIL only, with no API key,
document content or generated chat answer. The file should stay local.

GitHub Actions performs the full cross-browser matrix (Chromium, Firefox,
WebKit and mobile projects) plus deterministic backend checks. The local
one-click runner tests Chromium plus the real AI service and **additionally** checks
the owner's real Ollama/FAISS environment, which GitHub-hosted CI cannot access.
