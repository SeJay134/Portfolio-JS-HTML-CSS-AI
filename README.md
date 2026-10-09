# Sergei Patrushev — Portfolio

A redesigned, accessible and responsive **React + TypeScript + Vite** portfolio.
The primary goal is to modernize the original design and frontend architecture
**without losing the originally intended functionality**. Any nonessential feature
changes, new external services, or architectural departures require owner approval.

## Product goal and release boundaries

The project is a single evolving portfolio, not a replacement product:

- **New design (implemented for the public frontend):** responsive sections,
  accessible left navigation drawer, system/light/dark themes, curated projects,
  experience, about and contact. React/TypeScript/Vite is already shipped in
  the static Vercel frontend via merged PR #12.
- **Preserve the assistant (still to integrate):** restore the planned Chat UI
  in React with send, stop, retry, clear/new conversation, availability/offline
  handling and portfolio-grounded replies. The public frontend does **not** have
  the Chat UI or make AI requests yet; this is an incomplete stage, **not a
  cancellation of the original chat functionality**.
- **Keep the original AI technology:** Flask `app.py`, FAISS/RAG and local
  Ollama remain the model stack. Draft PR #13 separately restores/hardens the
  local API, without changing public hosting. Retrieval quality and verifiable
  source links are follow-up tasks, not claims of current accuracy.
- **Contact must remain usable:** the current release safely creates a local
  email draft (mailto/copy) and does not pretend to deliver messages. Adding a
  real delivery backend is a separate approved change with privacy/spam tests.
- **Visual effects stay purposeful:** optional Three.js or enhanced animation
  only with accessibility/performance review and owner approval; a 3D library
  is not required to preserve core interactions.

**Hosting policy:** $0 additional AI hosting. The public portfolio stays static
on Vercel and works while the owner's computer is off. Flask/RAG/Ollama run on
the owner's **own computer**, loopback-only by default. No public browser key,
no automatic ngrok tunnel, no remote AI service or API dependency without a
separately agreed integration plan.

The public frontend was merged in PR #12; the secure local backend is in
[Draft PR #13](https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/pull/13)
and is **not yet merged to main**. Do not confuse documentation in this PR
branch with files already released on main. See [ROADMAP.md](ROADMAP.md) for
the work order and [feature-parity scenarios](tests/scenarios/original-feature-parity.md)
for what must remain functional.

## Local development

Node 22.12+:

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:5001. Never use a static Python file server to run the
React source tree. For a production build:

```bash
npm run build
npm run preview
```

Build output is `dist/`; `scripts/prerender.tsx` adds crawlable HTML.
No API URL or backend credentials are necessary for this release.

## Visitor behavior

Project data is controlled in `src/data/projects.ts` and remains available
without GitHub or AI APIs. Filters are keyboard operable, encoded in
`?category=`, and preserve section anchors. Local images have alt text and
safe fallbacks.

Contact only prepares an email draft or copyable text. The visitor must send
the email using their own email app; this site neither stores nor submits
visitor messages. There is no public message list. Do not add a resume or
unverified employment/impact claims without owner review.

## Optional local AI backend

The public Vercel site does **not** call the AI backend in the current
release. **Running the local backend is optional for visitors, not optional
for completing the planned Chat feature.** These commands apply to PR #13
(or its eventual merged version) and run only on your computer.

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-local-ai.txt
ollama pull qwen2.5:7b
# Put reviewed .txt/.md knowledge files in data/base/ first.
# This directory is local/gitignored. No knowledge content is committed automatically.
python -m llm.indexer
python -m llm.app
```

The API listens only on `http://127.0.0.1:5002`. It loads a FAISS index
and safe `meta.json` metadata from `data/embeddings/`. Old `meta.pkl`
files are intentionally **not** deserialized: rebuild the index from trusted
local text documents after updating.

### If the local API refuses to start

If `python -m llm.app` reports a non-local address in `FRONTEND_URLS`
or `TRUSTED_HOSTS`, the likely cause is an older, **gitignored** `.env`
from when the website was connected through ngrok. Do **not** enable
`REQUIRE_API_KEY` merely to silence the error. Instead open `.env`:

```powershell
notepad .env
```

For computer-only operation use these values (remove duplicate old entries):

```dotenv
FRONTEND_URLS=http://localhost:5001,http://127.0.0.1:5001
TRUSTED_HOSTS=localhost,127.0.0.1
REQUIRE_API_KEY=false
OLLAMA_HOST=http://127.0.0.1:11434
```

Values already set as Windows/PowerShell environment variables take
precedence over `.env`. To clear only these overrides for the current
PowerShell session, run:

```powershell
Remove-Item Env:FRONTEND_URLS,Env:TRUSTED_HOSTS,Env:REQUIRE_API_KEY -ErrorAction SilentlyContinue
python -m llm.app
```

Do not share the contents of `.env` or any `LOCAL_API_KEY` value.
An already-built index does **not** need rebuilding to correct these settings.

Check the API with:

```powershell
curl.exe http://127.0.0.1:5002/health
curl.exe http://127.0.0.1:5002/ready
```

Current production frontend has no Chat UI, so starting `app.py` does not alter
the public website. React Chat UI is the next core frontend integration slice,
developed against local/mock APIs without connecting the public Vercel site to
a private PC. Public AI access requires a **separate owner decision**.

Do not expose Flask with `--host=0.0.0.0`. ngrok is unnecessary for normal
local work. A temporary tunnel must be an explicit test-only configuration with
trusted host/origin settings and API-key protection; app startup rejects
non-local origins/hosts without `REQUIRE_API_KEY=true`. Never place that key
in a public Vercel/Vite build. A tunnel does **not** make the Flask development
server appropriate for an untrusted public workload.

## Validation

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:smoke
npm run test:e2e
npm run test:regression
```

Browser tests use the built site at localhost:4173. See
`tests/README.md` and `docs/VALIDATION.md` for evidence and outstanding gates.

## Deployment

The Vercel configuration uses `npm run build` and publishes `dist/`.
Never merge merely because the CI is green: verify Preview, owner-controlled
content, and the review diff before merging to `main`. After deployment,
verify the deployed commit, robots/sitemap/social image, canonical metadata,
navigation, contact behavior and rollback target.

Every subsequent subphase should have its own short-lived branch, tested merge,
deployment and post-deploy acceptance.
