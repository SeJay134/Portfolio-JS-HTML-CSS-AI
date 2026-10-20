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
