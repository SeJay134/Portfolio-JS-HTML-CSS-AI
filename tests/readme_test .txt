PORTFOLIO TEST DIRECTORY - COMMAND INDEX AND TEST CATALOG
=========================================================
Repository: SeJay134/Portfolio-JS-HTML-CSS-AI
Reviewed branch: add_project_World_Happiness_Pipeline
Repository review date: October 30, 2026
File location in the repository: tests/readme_test.txt

PURPOSE
-------
Use this file as a copy-and-run menu of the project's tests. It describes
which tests exist, what they cover, how to launch them, and where to read
results. It is a reference document, not an executable script.

All commands in this guide run from the REPOSITORY ROOT, not from tests/.
The examples target Windows PowerShell, which is the normal local environment.
For architecture and test ownership rules, also see tests/README.md.

TABLE OF CONTENTS
-----------------
  1. Prerequisites and command rules
  2. Quick command menu
  3. Complete test-file catalog
       A. Frontend unit tests (Vitest)             - 7 files
       B. Backend integration tests (pytest)       - 6 files
       C. Frontend integration tests               - 3 files
       D. Browser smoke tests                      - 1 file
       E. Browser end-to-end tests                 - 1 file
       F. Browser regression tests                 - 6 files
       G. PR16 and PR19 deterministic test files   - 4 files
  4. Safe local pytest execution with protected .env settings
  5. Recommended test workflows
  6. CI coverage and test reports
  7. Manual scenarios and test support files
  8. Language conventions and repository audit
  9. Maintenance checklist

1. PREREQUISITES AND COMMAND RULES
----------------------------------
Open PowerShell in the repository root and verify the working directory:

    git rev-parse --show-toplevel
    git branch --show-current

Frontend prerequisites: Node.js 22.12.0 or newer and npm.
Install the exact JavaScript dependencies from the lockfile:

    npm ci

Backend prerequisites: a project Python virtual environment and the local
API development dependencies. When necessary, activate the environment and
install the pinned requirements:

    .\.venv\Scripts\Activate.ps1
    python -m pip install -r requirements-local-api-dev.txt

Playwright browser suites run against the production preview at
http://127.0.0.1:4173. Build the project first and install Chromium:

    npm run build
    npx playwright install chromium

The default Playwright configuration defines five browser projects:
chromium, firefox, webkit, mobile (iPhone/WebKit), and mobile-chromium.
Commands without an explicit project may run the entire browser matrix.
For a reliable Chromium-only run on Windows, invoke Playwright directly
with --project=chromium, as shown below.

Install the remaining supported Playwright browsers only if needed:

    npx playwright install chromium firefox webkit

Ordinary unit tests and mocked browser integration tests do not need a
running Flask, Ollama, or FAISS service. Real AI quality runners are
separate; see Section 3G.

2. QUICK COMMAND MENU
---------------------
Choose a command by number. Paste the command into PowerShell while in
 the repository root. Run npm run build before the standard browser suites.

 [01] Frontend lint
      npm run lint

 [02] TypeScript type checking
      npm run typecheck

 [03] All frontend unit tests (Vitest)
      npm run test:unit

 [04] Production build and prerender
      npm run build

 [05] Browser smoke tests - Chromium
      npx playwright test tests/smoke --project=chromium

 [06] Browser E2E tests - Chromium
      npx playwright test tests/e2e --project=chromium

 [07] Browser regression tests - Chromium
      npx playwright test tests/regression --project=chromium

 [08] All standard browser suites - Chromium
      npx playwright test tests/smoke tests/e2e tests/regression --project=chromium

 [09] All standard browser suites - full configured browser matrix
      npm run test:browser

 [10] Development chat browser integration (mock Flask endpoints)
      npm run test:chat-dev

 [11] Vercel/ngrok server bridge (mock network requests)
      node --test tests/integration/frontend/ngrok-bridge.test.mjs

 [12] All backend integration tests (pytest)
      python -m pytest -q tests/integration/backend
      IMPORTANT: If your .env contains tunnel hosts or API-key settings,
      use Invoke-PortfolioPytest from Section 4 instead.

 [13] All deterministic Python tests included in the CI local-api job
      python -m pytest -q tests/integration/backend tests/pr19/test_runner.py tests/pr16/test_evaluator.py tests/pr16/test_quality_runner.py tests/pr16/test_retrieval_probe.py
      IMPORTANT: Use the isolated helper from Section 4 on a computer
      configured for authenticated Flask/ngrok access.

 [14] Show the most recent Playwright HTML report
      npx playwright show-report

 [15] Run only a selected Playwright test by its title (example)
      npx playwright test tests/regression/projects.regression.spec.ts --project=chromium -g "keyboard filters"

 [16] Run one backend test by its exact test name (example)
      python -m pytest -q tests/integration/backend/test_public_knowledge.py::test_verified_catalogue_lists_five_canonical_projects
      IMPORTANT: The same .env caution applies to individual pytest runs.

 [17] Run the public-chat hydration browser test
      Follow the special build instructions in Section 3C, item C02.

 [18] Run PR16 or PR19 full real-AI checks
      Follow the branch and local-service requirements in Section 3G.

3. COMPLETE TEST-FILE CATALOG
-----------------------------
Each entry identifies a tracked test file, its purpose, and the command
that runs it. One file may contain multiple test cases or parameters.

A. FRONTEND UNIT TESTS / VITEST - tests/unit/frontend/

 A01  Chat.test.tsx
      React chat interaction: opening, closing, sending, clearing,
      retrying, stopping, safe output, and accessible behavior.
      npx vitest run tests/unit/frontend/Chat.test.tsx

 A02  ChatApi.test.ts
      Browser-to-local API contract, restricted origins, trusted source
      links, readiness, and timeout/error handling.
      npx vitest run tests/unit/frontend/ChatApi.test.ts

 A03  Contact.test.tsx
      Contact form validation, safe email-draft creation, clipboard
      behavior, error states, and no false delivery claims.
      npx vitest run tests/unit/frontend/Contact.test.tsx

 A04  Projects.test.tsx
      Project category filtering, rendering without network access,
      and browser-history behavior.
      npx vitest run tests/unit/frontend/Projects.test.tsx

 A05  chat-status.test.ts
      Assistant status transitions: ready, unavailable, rate-limited,
      timeout, retry, cancellation, and stale requests.
      npx vitest run tests/unit/frontend/chat-status.test.ts

 A06  projects-data.test.ts
      Project IDs, repository links, categories, local preview images,
      allowed URLs, and filtering rules.
      npx vitest run tests/unit/frontend/projects-data.test.ts

 A07  public-project-facts.test.ts
      Parity between reviewed React project data and the public facts
      used by the RAG catalog.
      npx vitest run tests/unit/frontend/public-project-facts.test.ts

B. BACKEND INTEGRATION TESTS / PYTEST - tests/integration/backend/

For B01-B06, use the corresponding filename as the target in the
Invoke-PortfolioPytest helper from Section 4 if your local .env contains
external hosts or protected API settings.

 B01  test_index_readiness.py
      Readiness checks for FAISS and the local model, and separation
      between public-only and private retrieval modes.
      python -m pytest -q tests/integration/backend/test_index_readiness.py

 B02  test_index_snapshots.py
      Real FAISS round trips, active index pointers, snapshot integrity,
      SHA-256 checks, atomic publishing, and concurrency safeguards.
      python -m pytest -q tests/integration/backend/test_index_snapshots.py

 B03  test_local_api.py
      Flask /health, /ready, and /chat endpoints; request validation,
      CORS, host checks, rate limits, API keys, and concurrency handling.
      python -m pytest -q tests/integration/backend/test_local_api.py

 B04  test_local_rag_security.py
      Trusted hosts and origins, tunnel security, protected/public
      modes, safe vector metadata, and retrieval isolation.
      python -m pytest -q tests/integration/backend/test_local_rag_security.py

 B05  test_public_knowledge.py
      The five-project public catalog, approved source links, grounded
      responses, bilingual AI inputs, and handling of a nonexistent
      sixth published project.
      python -m pytest -q tests/integration/backend/test_public_knowledge.py

 B06  test_vector_store_atomic.py
      Atomic index publication, pointer validation, metadata integrity,
      previous-version retention, and interrupted writes.
      python -m pytest -q tests/integration/backend/test_vector_store_atomic.py

C. FRONTEND INTEGRATION TESTS - tests/integration/frontend/

 C01  chat-dev.spec.ts
      React chat against intercepted/mocked Flask responses: source
      safety, mobile dialogs, retries, 429/503 behavior, and status races.
      Uses a separate Vite development server on loopback port 5001.
      No real Flask or Ollama is required.
      npm run test:chat-dev

 C02  chat-public-hydration.spec.ts
      Public-chat launcher appears after React hydration without
      mismatches when the public-chat build option is enabled.
      Build with VITE_ENABLE_PUBLIC_CHAT_UI=true first, then execute
      the dedicated Chromium configuration. PowerShell example:

          $savedChatFlag = [Environment]::GetEnvironmentVariable("VITE_ENABLE_PUBLIC_CHAT_UI", "Process")
          try {
              $env:VITE_ENABLE_PUBLIC_CHAT_UI = "true"
              npm run build
              if ($LASTEXITCODE -ne 0) { throw "Public chat build failed" }
              npm run test:chat-hydration
          }
          finally {
              [Environment]::SetEnvironmentVariable("VITE_ENABLE_PUBLIC_CHAT_UI", $savedChatFlag, "Process")
          }

      Rebuild without that flag before running tests that expect the
      default public frontend (for example, the normal E2E suite).

 C03  ngrok-bridge.test.mjs
      Mocked server bridge behavior: HTTPS-only upstreams, server-side
      credentials, safe source forwarding, validation, and failures.
      No live ngrok request is required.
      node --test tests/integration/frontend/ngrok-bridge.test.mjs

D. BROWSER SMOKE TESTS - tests/smoke/

 D01  portfolio.smoke.spec.ts
      Essential site shell, section navigation, menu, and contact
      usability without a functioning external API.
      npx playwright test tests/smoke/portfolio.smoke.spec.ts --project=chromium

E. BROWSER END-TO-END TESTS - tests/e2e/

 E01  portfolio.spec.ts
      User-facing contact flows, accessibility (WCAG checks),
      pre-rendered HTML, no-JavaScript behavior, and mobile interaction.
      npx playwright test tests/e2e/portfolio.spec.ts --project=chromium

F. BROWSER REGRESSION TESTS - tests/regression/

 F01  anchors.regression.spec.ts
      Section hash navigation, browser Back/Forward history, sticky
      header behavior, form focus, and legacy hash compatibility.
      npx playwright test tests/regression/anchors.regression.spec.ts --project=chromium

 F02  drawer.regression.spec.ts
      Menu drawer, Escape, focus management, backdrop, resize,
      keyboard accessibility, and reduced motion.
      npx playwright test tests/regression/drawer.regression.spec.ts --project=chromium

 F03  layout.regression.spec.ts
      Light/dark rendering at six viewport widths from 320px to
      1440px; expanded project details and unwanted horizontal scroll.
      npx playwright test tests/regression/layout.regression.spec.ts --project=chromium

 F04  projects.regression.spec.ts
      Five project cards, category filtering (three Data projects),
      deep links, browser history, and image-loading fallbacks.
      npx playwright test tests/regression/projects.regression.spec.ts --project=chromium

 F05  seo.regression.spec.ts
      Canonical URLs, metadata, robots.txt, sitemap.xml, shared-image
      assets, and indexable production HTML.
      npx playwright test tests/regression/seo.regression.spec.ts --project=chromium

 F06  theme.regression.spec.ts
      System/light/dark theme selection, persisted preferences,
      contrast, keyboard behavior, and hydration flash prevention.
      npx playwright test tests/regression/theme.regression.spec.ts --project=chromium

G. DETERMINISTIC PR16 / PR19 TESTS AND REAL-AI LAUNCHERS

 G01  tests/pr16/test_evaluator.py
      Deterministic RAG scoring, refusal/safety rules, and evaluation
      classifications. Does not generate a real Ollama answer.
      python -m pytest -q tests/pr16/test_evaluator.py

 G02  tests/pr16/test_quality_runner.py
      Quality runner's safety, staging, environment isolation,
      diagnostic handling, and report behavior.
      python -m pytest -q tests/pr16/test_quality_runner.py

 G03  tests/pr16/test_retrieval_probe.py
      Deterministic retrieval-probe validation.
      python -m pytest -q tests/pr16/test_retrieval_probe.py

 G04  tests/pr19/test_runner.py
      Deterministic checks of the PR19 one-click verification runner.
      python -m pytest -q tests/pr19/test_runner.py

 G05  tests/pr16/RUN_PR16.cmd - LIVE public RAG quality runner
      Windows launcher (run or double-click):
          .\tests\pr16\RUN_PR16.cmd
      Checks the approved PR16 branch or main before running. Requires
      the existing .venv and local Ollama/model resources. Includes
      deterministic test stages, actual public RAG answer evaluation,
      retrieval probes, browser checks, and authenticated private API
      verification. It does not expose credentials in its reports.
      Local reports: tests/pr16/reports/latest.html and latest.json.
      This branch-gated runner is NOT a generic command for arbitrary
      feature branches. See tests/pr16/README.md.

 G06  tests/pr19/RUN_PR19.cmd - LIVE private API/FAISS verification
      Windows launcher (run or double-click):
          .\tests\pr19\RUN_PR19.cmd
      Accepts branch fix/atomic-rag-index-snapshots or main. Requires
      .venv, Ollama, a configured local model, and a readable private
      FAISS index. Exercises the real protected Flask /health, /ready,
      and /chat API in an isolated loopback process.
      Local report: tests/pr19/reports/latest.json.
      This branch-gated runner is NOT a generic command for arbitrary
      feature branches. See tests/pr19/README.md.

4. SAFE LOCAL PYTEST EXECUTION WITH PROTECTED .ENV SETTINGS
----------------------------------------------------------
The local Flask configuration may have ngrok/external TRUSTED_HOSTS,
FRONTEND_URLS, and REQUIRE_API_KEY enabled. Direct pytest execution can
then fail with 401 Unauthorized or during test collection. Never edit
or disable the working service's security settings just to run tests.

For deterministic tests only, paste this helper into the CURRENT
PowerShell session. It assigns loopback-only settings in the pytest
child process environment and restores the original process settings
regardless of whether pytest passes or fails. The real .env file is
not changed. This helper is not for running a public Flask service.

    function Invoke-PortfolioPytest {
        param([string[]]$Targets = @("tests/integration/backend"))

        $names = @(
            "REQUIRE_API_KEY", "PUBLIC_ONLY_MODE",
            "TRUSTED_HOSTS", "FRONTEND_URLS", "PYTHON_DOTENV_DISABLED"
        )
        $saved = @{}
        foreach ($name in $names) {
            $saved[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
        }
        try {
            $env:REQUIRE_API_KEY = "false"
            $env:PUBLIC_ONLY_MODE = "false"
            $env:TRUSTED_HOSTS = "localhost,127.0.0.1"
            $env:FRONTEND_URLS = "http://127.0.0.1:5001,http://localhost:5001"
            $env:PYTHON_DOTENV_DISABLED = "1"
            python -m pytest -q @Targets
        }
        finally {
            foreach ($name in $names) {
                [Environment]::SetEnvironmentVariable($name, $saved[$name], "Process")
            }
        }
    }

After defining the helper, select any of these commands:

    # Complete backend integration suite
    Invoke-PortfolioPytest

    # Public project catalog only
    Invoke-PortfolioPytest -Targets @("tests/integration/backend/test_public_knowledge.py")

    # Flask API contract only
    Invoke-PortfolioPytest -Targets @("tests/integration/backend/test_local_api.py")

    # All deterministic Python checks used by the GitHub Actions local-api job
    Invoke-PortfolioPytest -Targets @(
        "tests/integration/backend",
        "tests/pr19/test_runner.py",
        "tests/pr16/test_evaluator.py",
        "tests/pr16/test_quality_runner.py",
        "tests/pr16/test_retrieval_probe.py"
    )

The helper exists only in the current PowerShell session; paste it again
in a new shell. Its settings are not intended for actual tunnel or live
Ollama/FAISS testing. The last confirmed local backend run on this branch
passed 142 tests using isolated settings; subsequent counts may change.

5. RECOMMENDED TEST WORKFLOWS
----------------------------

Frontend-only changes:
    npm run lint
    npm run typecheck
    npm run test:unit
    npm run build
    npx playwright test tests/smoke tests/e2e tests/regression --project=chromium

Backend, RAG, or public-project-catalog changes:
    Invoke-PortfolioPytest
    npm run test:unit
    npm run build
    npx playwright test tests/regression --project=chromium

Chat bridge or frontend AI changes:
    npm run test:unit
    node --test tests/integration/frontend/ngrok-bridge.test.mjs
    npm run test:chat-dev
    # Also run the public-chat hydration sequence in Section 3C if relevant.

Before a commit or pull request:
    git status
    git diff --check
    # Run relevant suites above, then review the next GitHub Actions run.

Important: a local PASS verifies local behavior; it does not automatically
mean that GitHub Actions or the deployed site passed verification.

6. CI COVERAGE AND TEST REPORTS
-------------------------------
GitHub Actions configuration: .github/workflows/ci.yml

    frontend           ESLint, TypeScript, unit tests, mocked Node bridge,
                       and production build.
    local-api          All backend integration tests plus deterministic
                       PR16 and PR19 Python tests.
    smoke              Chromium smoke, chat-dev tests, chat hydration.
    branch-regression  Chromium regression on non-main pushes.
    browser-regression E2E and regression across configured browser
                       projects for pull requests and main.

Reports and diagnostics:
    npx playwright show-report
    npx playwright show-trace <path-to-trace.zip>

Typical browser artifacts:
    playwright-report/
    test-results/

PR16 local quality reports:
    tests/pr16/reports/latest.html
    tests/pr16/reports/latest.json

PR19 local verification report:
    tests/pr19/reports/latest.json

Keep local .env values, API keys, private index content, private knowledge
sources, and actual private model responses out of shared reports.

7. MANUAL SCENARIOS AND TEST SUPPORT FILES
-----------------------------------------
The following are documentation/checklists, not directly runnable tests:

    tests/README.md
        Test architecture, suite ownership, and conventions.
    tests/future/README.md
        Planned tests not treated as passing CI coverage.
    tests/scenarios/original-feature-parity.md
        Existing-feature acceptance and regression scenarios.
    tests/scenarios/chat-assistant-status-manual.md
        Manual checks for chat readiness and failure states.
    tests/scenarios/release-gates.md
        Pre-merge and post-merge release verification.
    tests/pr16/README.md
        Requirements, safety constraints, and interpretation of PR16.
    tests/pr19/README.md
        Requirements and operation of the PR19 verification runner.

Additional test infrastructure and data:

    tests/setup/frontend.ts                  Vitest setup.
    tests/pr16/cases/public_facts.json       Curated quality scenarios.
    tests/pr16/cases/schema.json             Scenario structure.
    tests/pr16/evaluator.py                  RAG scoring implementation.
    tests/pr16/retrieval_probe.py            Retrieval probe implementation.
    tests/pr16/run.py                        PR16 launcher implementation.
    tests/pr19/run.py                        PR19 launcher implementation.

8. LANGUAGE CONVENTIONS AND REPOSITORY AUDIT
--------------------------------------------
All documentation, headings, instructions, comments written for readers,
UI copy, filenames, and new test names should be in English.

A repository audit of the reviewed branch (October 30, 2026) covered
128 tracked files: 115 readable text/code/configuration files and
13 binary image/font assets. All readable files were checked for
Cyrillic and selected non-Latin scripts; the 13 binary assets could
not be language-inspected by this text scan.

Seven existing tracked text files contain Cyrillic content:

    docs/VALIDATION.md
        Historical quoted Russian-language AI validation prompts.
    llm/public_knowledge.py
        Russian-language detection, ordinal matching, and response logic.
    tests/integration/backend/test_public_knowledge.py
        Bilingual test questions and expected answers.
    tests/pr16/README.md
        Russian words quoted as examples in an English explanation.
    tests/pr16/cases/public_facts.json
        Russian-language RAG quality evaluation questions.
    tests/pr16/evaluator.py
        Russian refusal and safety classification patterns.
    tests/pr16/test_evaluator.py
        Russian-language examples used to verify the evaluator.

These seven files are not evidence of untranslated English UI or
narrative documentation. Most non-English literals are intentional
test inputs or language-processing patterns; translating them to
English would reduce or change bilingual RAG coverage. Preserve the
literal test fixtures unless removing multilingual behavior is an
explicitly approved product requirement. Keep surrounding explanatory
text and all NEW documentation in English.

This readme_test.txt file contains English-only natural language.

9. MAINTENANCE CHECKLIST
------------------------
Whenever a test file is created, moved, renamed, or removed:
    - Update the corresponding A-G catalog entry and command.
    - Verify the command from the repository root on the intended OS.
    - Update the quick menu if a new important suite is introduced.
    - Keep tests/README.md and CI descriptions aligned with the code.
    - Record genuine release validation in docs/VALIDATION.md.
    - Do not loosen assertions merely to make failing tests pass.
    - Keep human-readable documentation in English, and retain only
      intentional non-English fixture data for multilingual behavior.

END OF TEST COMMAND INDEX
