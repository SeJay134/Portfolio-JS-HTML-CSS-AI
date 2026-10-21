# PR #16 — one-click RAG quality evaluation

Run **`RUN_PR16.cmd`** (double-click on Windows). It verifies the PR #16
branch (or `main` after merge), uses the project's existing Python virtual
environment, and runs all deterministic backend/evaluator tests, frontend
lint/typecheck/Vitest/browser regressions, a real PUBLIC-only in-memory
Ollama quality baseline, read-only FAISS retrieval probes and the separate
existing authenticated PR #19 private-index smoke.

**No manual key, question, model name, branch switch, Flask startup or API
calls are required.** It reads existing `.env` in memory and does not print
secrets. Missing Ollama, cached embedding model or private index is reported
as failure — not a silent pass. It does not download Ollama models, rebuild
indexes, delete documents or modify your `.env`.

36 cases: 30 mandatory curated public-facts/safety and 6 non-blocking Russian
language diagnostics. Narrow deterministic PASS does not imply the whole
generated answer is semantically true; inspect ambiguous cases locally.

Reports: `tests/pr16/reports/latest.html` and `latest.json`, gitignored.
Only case IDs, status codes, timings, public catalogue hash and safe metadata
are recorded; generated model answers/questions and private data are omitted.
CI runs deterministic cases, not actual owner Ollama.
See `docs/RAG_ANSWER_EVALUATION.md` for gates and caveats.


## User-local `pytest_failed` diagnosis

The launcher now isolates deterministic backend test settings from the real
`.env`. In particular, it disables dotenv loading **only for the synthetic
pytest subprocess**, with local-only Flask options and no API key in that
process. Real Ollama quality and authenticated Flask smoke still use the
existing `.env` automatically and never require typing a secret.

If a stage fails, `reports/latest.json` now records `stage`, `error_code`,
and for Python test failures a safe `diagnostics` section with the pytest
exit code and verified test identifiers. Full pytest tracebacks, local
absolute paths, environment secrets and model outputs are never stored.
After updating the PR #16 branch, double-click the same `RUN_PR16.cmd`
and share only `latest.json` if an error persists.

After a Windows run ends, the launcher automatically opens the local HTML
report in the default browser. The page now shows failure stage, safe error
code and test IDs as well as quality metrics; there is no need to open JSON
manually unless further diagnosis is needed.

## Windows frontend/browser failures

A failed frontend step is now recorded under `frontend_diagnostics` with an
allowlisted command ID, failure category and numeric exit code. The report also
contains `frontend_steps` PASS/FAIL information for completed checks.
No npm stdout/stderr, absolute file paths, keys or model responses are saved.
For example, the diagnostic category `port_in_use` means a local Vite
development/preview port is already occupied; the runner never kills unrelated
user processes or silently reuses a different branch's server.

A local frontend failure **does not suppress the real Ollama quality baseline**:
the runner attempts public RAG evaluation and the separate private API smoke
after recording the browser error, but the overall run remains FAIL until all
mandatory checks pass. If Ollama itself is unavailable, that also fails
independently. Language diagnostics remain non-blocking.


## Owner baseline of October 21, 2026

The real local run on `38dc50c` confirmed 25/30 mandatory public RAG
assertions, 1 flagged safety case and 24/24 expected top-k public retrieval
hits. Six language probes were diagnostic-only (2 failed and did not count).
The local `chat_dev` Playwright step returned `test_or_build_failure`
(exit 1) while other completed frontend and private Flask checks passed.
Raw model responses and Playwright tracebacks were deliberately not saved,
so no precise root cause is proven for individual model answers or chat test.

The next report may include a safe `failed_test_locations` array with
fixed public Playwright spec line numbers, never test titles or private paths.
The evaluation keeps the >=90% gate and zero definite safety failures.
