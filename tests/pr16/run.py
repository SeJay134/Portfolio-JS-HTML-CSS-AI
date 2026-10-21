"""One-click PR #16 quality baseline against LOCAL Ollama and PUBLIC evidence.

Reports include metadata and pass/fail only. No raw generated text, prompts,
private paths, model secrets, or owner documents are retained or printed.
"""
from __future__ import annotations

import hashlib
import html
import importlib.util
import json
import os
import re
import shutil
import socket
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from evaluator import load_catalogue, load_cases, evaluate, summarize, CATALOG_PATH
from retrieval_probe import probe

REPORTS = Path(__file__).resolve().parent / "reports"
EXPECTED = {"feat/rag-answer-quality-evaluation", "main"}


class VerificationError(Exception):
    def __init__(self, message: str, *, code: str = "verification_failed",
                 details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}



def git(*args: str) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT,
                            capture_output=True, text=True, check=False)
    if result.returncode:
        raise VerificationError("Cannot read Git branch.")
    return result.stdout.strip()


def check_branch() -> tuple[str, str]:
    branch = git("branch", "--show-current")
    if branch not in EXPECTED:
        raise VerificationError(
            "Run this file from the PR #16 branch or merged main; "
            "no Git branch was changed."
        )
    return branch, git("rev-parse", "--short", "HEAD")


def import_pr19_runner():
    file = ROOT / "tests" / "pr19" / "run.py"
    spec = importlib.util.spec_from_file_location("pr19_smoke", file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def safe_config() -> dict:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env", override=False)
    config = dict(os.environ)
    host = urlsplit(config.get("OLLAMA_HOST", "http://127.0.0.1:11434"))
    if host.hostname not in ("127.0.0.1", "localhost") or host.scheme != "http":
        raise VerificationError("Local model host must be loopback for private RAG.")
    if config.get("PUBLIC_ONLY_MODE", "").lower() in {"true", "1", "yes", "on"}:
        # The PR19 authenticated smoke intentionally checks PRIVATE index
        # using a separate private localhost-only child, regardless of this flag.
        pass
    # Prevent silently downloading transformer models or an unexpected new
    # dependency during evaluation. Existing cached embedding model is required.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    # Keep the child Flask smoke process offline too; no surprise downloads
    # or mutation of the owner's cached models during quality evaluation.
    config["HF_HUB_OFFLINE"] = "1"
    config["TRANSFORMERS_OFFLINE"] = "1"
    return config


def isolated_test_env() -> dict[str, str]:
    """Run synthetic tests independently of the owner's live .env.

    No permanent changes to the current environment. Production/integration
    smoke continues to load the real local key after this subprocess exits.
    """
    env = dict(os.environ)
    for key in (
        "REQUIRE_API_KEY", "LOCAL_API_KEY", "PUBLIC_ONLY_MODE",
        "FRONTEND_URLS", "TRUSTED_HOSTS", "CHAT_LIMIT",
        "RATELIMIT_STORAGE_URI", "OLLAMA_HOST", "MODEL_NAME",
        "MODEL_TIMEOUT", "MAX_GENERATIONS",
    ):
        env.pop(key, None)
    env.update({
        "PYTHON_DOTENV_DISABLED": "1",
        "REQUIRE_API_KEY": "false",
        "PUBLIC_ONLY_MODE": "false",
        "FRONTEND_URLS": "http://127.0.0.1:5001,http://localhost:5001",
        "TRUSTED_HOSTS": "127.0.0.1,localhost",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
    return env


def safe_pytest_diagnostics(output: str, exit_code: int) -> dict:
    """Retain only static test identifiers and generic error categories.

    Never persist raw stdout/tracebacks, absolute paths, env, case questions,
    or arbitrary exception messages.
    """
    failures = []
    expr = re.compile(
        r"(?:^|\s)(?:FAILED|ERROR)\s+"
        r"(tests/(?:integration/backend|pr16|pr19)/"
        r"[A-Za-z0-9_./-]+\.py)"
        r"(?:::(test_[A-Za-z0-9_]+))?"
    )
    for line in output.splitlines():
        match = expr.search(line)
        if match:
            ident = match.group(1)
            if match.group(2):
                ident += "::" + match.group(2)
            if ident not in failures:
                failures.append(ident)
    normalized = output.lower()
    category = (
        "collection_error" if ("error collecting" in normalized
                               or "import file mismatch" in normalized)
        else "missing_dependency" if ("modulenotfounderror" in normalized
                                      or "no module named" in normalized)
        else "test_assertion" if ("failed tests/" in normalized
                                  or "assertionerror" in normalized)
        else "test_process_error"
    )
    return {"pytest_exit_code": int(exit_code),
            "category": category, "failed_tests": failures[:12]}


def run_pytest() -> None:
    print("[RUN] Deterministic backend, evaluator and prior snapshot tests.", flush=True)
    completed = subprocess.run([
        sys.executable, "-m", "pytest", "-q",
        "tests/integration/backend", "tests/pr19/test_runner.py",
        "tests/pr16/test_evaluator.py", "tests/pr16/test_quality_runner.py",
        "tests/pr16/test_retrieval_probe.py"
    ], cwd=ROOT, env=isolated_test_env(), capture_output=True,
       text=True, errors="replace", check=False)
    rc = completed.returncode
    if rc:
        diagnostics = safe_pytest_diagnostics(
            str(getattr(completed, "stdout", "") or "") + "\n"
            + str(getattr(completed, "stderr", "") or ""), rc
        )
        print(
            f"[FAIL] Python tests: {diagnostics['category']} "
            f"(exit {rc}). Failed test IDs: "
            f"{', '.join(diagnostics['failed_tests']) or 'not identified'}.",
            flush=True,
        )
        raise VerificationError(
            "Python regressions failed; see safe report diagnostics.",
            code="pytest_failed", details=diagnostics,
        )
    print("[OK] Deterministic Python regressions passed.", flush=True)


FRONTEND_CHECKS = (
    ("javascript_dependencies", "Install locked JavaScript dependencies"),
    ("eslint", "ESLint"),
    ("typescript", "TypeScript"),
    ("vitest", "Vitest unit tests"),
    ("proxy_integration", "Vercel proxy integration"),
    ("production_build", "Production frontend build"),
    ("chromium_install", "Install Playwright Chromium"),
    ("chromium_browser", "Chromium smoke, E2E and regression"),
    ("chat_dev", "Chat dev browser tests"),
    ("public_chat_build", "Public chat build"),
    ("chat_hydration", "Chat hydration browser tests"),
)


def _classify_frontend_failure(output: str, step: str) -> str:
    """Classify known local issues; do not return arbitrary subprocess text."""
    lowered = output.lower()
    if any(s in lowered for s in (
        "eaddrinuse", "port 5001 is already in use", "port 4173 is already in use",
        "address already in use", "is already in use", "already in use by another",
        "port 5001 is in use", "port 4173 is in use", "is already used",
    )):
        return "port_in_use"
    if any(s in lowered for s in (
        "executable doesn't exist", "browser executable not found",
        "please run the following command to download new browsers",
        "playwright install",
    )) and step != "chromium_install":
        return "browser_not_installed"
    if any(s in lowered for s in ("enoent", "not recognized as an internal",
                                "command not found", "cannot find module")):
        return "missing_tool_or_dependency"
    if "timeout" in lowered or "timed out" in lowered:
        return "timeout"
    if "error loading config" in lowered or "failed to load config" in lowered:
        return "configuration_error"
    if ("failed" in lowered or "fail:" in lowered
            or "error:" in lowered or "tests failed" in lowered):
        return "test_or_build_failure"
    return "command_failed"


def _safe_chat_dev_test_locations(output: str) -> list[str]:
    """Extract only source line numbers in the fixed public chat test file.

    Never expose Playwright test names, assertion text, screenshots or
    arbitrary source paths that could contain private data.
    """
    found = []
    pattern = re.compile(
        r"(?m)^\s*\d+\)\s+\[chromium\]\s+›\s+"
        r"tests[/\\]integration[/\\]frontend[/\\]"
        r"chat-dev\.spec\.ts:(\d+):\d+\s+›"
    )
    for match in pattern.finditer(output):
        line = int(match.group(1))
        if 1 <= line <= 2000 and line not in found:
            found.append(line)
    return [f"chat-dev.spec.ts:{line}" for line in found[:10]]


def choose_chat_test_port() -> int:
    """Select a temporary loopback port; do not stop/reuse the owner's Vite.

    This port is used exclusively for the local PR16 chat-dev Playwright step.
    A small bind/close race remains possible; a failure still reports its step.
    """
    for _ in range(5):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            port = int(listener.getsockname()[1])
        if port != 5001:
            return port
    raise VerificationError(
        "Cannot allocate an isolated local chat test port.",
        code="frontend_failed",
        details={"step": "chat_dev", "category": "port_in_use"},
    )


def run_frontend_suite(report: dict) -> None:
    """Run Windows-friendly browser regressions with safe per-command evidence.

    Never store raw npm/Playwright output: Vite or test failures can contain
    configuration, user paths or test application text. Only the known command
    name, numeric return code, and allowlisted category are reported.
    """
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    node = shutil.which("node.exe" if os.name == "nt" else "node")
    report["frontend_steps"] = {}
    if not npm or not node:
        raise VerificationError(
            "Node.js/npm not found in PATH.",
            code="frontend_failed",
            details={"step": "node_npm", "category": "missing_tool_or_dependency"},
        )

    def execute(step: str, label: str, command: list[str],
                env: dict | None = None) -> None:
        print(f"[RUN] Frontend: {label}", flush=True)
        try:
            result = subprocess.run(
                command, cwd=ROOT, env=env, capture_output=True,
                text=True, errors="replace", check=False,
            )
        except OSError:
            report["frontend_steps"][step] = "fail"
            raise VerificationError(
                f"Frontend step '{step}' failed to start.",
                code="frontend_failed",
                details={"step": step, "category": "process_start_failed"},
            ) from None
        if result.returncode:
            category = _classify_frontend_failure(
                (result.stdout or "") + "\n" + (result.stderr or ""), step
            )
            report["frontend_steps"][step] = "fail"
            print(f"[FAIL] Frontend step '{step}': {category} "
                  f"(exit {result.returncode}).", flush=True)
            details = {"step": step, "category": category,
                       "exit_code": int(result.returncode)}
            if step == "chat_dev":
                locations = _safe_chat_dev_test_locations(
                    (result.stdout or "") + "\n" + (result.stderr or "")
                )
                if locations:
                    details["failed_test_locations"] = locations
            raise VerificationError(
                f"Frontend step '{step}' failed; see safe diagnostic report.",
                code="frontend_failed", details=details,
            )
        report["frontend_steps"][step] = "pass"
        print(f"[OK] Frontend: {label}", flush=True)

    frontend_bin = ROOT / "node_modules" / ".bin" / (
        "playwright.cmd" if os.name == "nt" else "playwright"
    )
    if not frontend_bin.is_file():
        execute("javascript_dependencies", "Install locked JavaScript dependencies",
                [npm, "ci"])
    for step, label, cmd in (
        ("eslint", "ESLint", [npm, "run", "lint"]),
        ("typescript", "TypeScript", [npm, "run", "typecheck"]),
        ("vitest", "Vitest unit tests", [npm, "run", "test:unit"]),
        ("proxy_integration", "Vercel proxy integration", [
            node, "--test", "tests/integration/frontend/ngrok-bridge.test.mjs",
        ]),
        ("production_build", "Production frontend build", [npm, "run", "build"]),
    ):
        execute(step, label, cmd)

    execute("chromium_install", "Install Playwright Chromium",
            [npm, "exec", "--", "playwright", "install", "chromium"])
    # Force Playwright's own servers to start for this run instead of reusing
    # an unrelated Vite preview from another branch.
    browser_env = dict(os.environ, CI="1")
    execute("chromium_browser", "Chromium smoke, E2E and regression",
            [npm, "run", "test:browser", "--", "--project=chromium"], browser_env)
    chat_port = choose_chat_test_port()
    isolated_chat_env = dict(browser_env, PR16_CHAT_DEV_PORT=str(chat_port))
    execute("chat_dev", "Chat dev browser tests",
            [npm, "run", "test:chat-dev"], isolated_chat_env)
    public_build_env = dict(os.environ, VITE_ENABLE_PUBLIC_CHAT_UI="true")
    execute("public_chat_build", "Public chat build",
            [npm, "run", "build"], public_build_env)
    execute("chat_hydration", "Chat hydration browser tests",
            [npm, "run", "test:chat-hydration"], browser_env)
    print("[OK] All PR16 local frontend/browser regressions passed.", flush=True)


def public_quality(config: dict) -> dict:
    from llm.app import LocalPortfolioService
    model_name = config.get("MODEL_NAME", "qwen2.5:3b")
    service = LocalPortfolioService({
        "MODEL_NAME": model_name,
        "OLLAMA_HOST": config.get("OLLAMA_HOST", "http://127.0.0.1:11434"),
        "MODEL_TIMEOUT": float(config.get("MODEL_TIMEOUT", "120")),
        "PUBLIC_ONLY_MODE": True,
    })
    if not service.ready():
        raise VerificationError(
            "Local Ollama model or cached public embedding model is not ready."
        )
    catalogue = load_catalogue()
    cases = load_cases(catalogue=catalogue)
    retriever = service._retriever()  # public-only in-memory FAISS
    results, probes = [], []
    for i, case in enumerate(cases, start=1):
        start = time.monotonic()
        print(f"[CASE {i}/{len(cases)}] {case['id']}", flush=True)
        try:
            response = service.answer(case["question"])
            verdict = evaluate(
                case, response.get("reply"), response.get("sources"), catalogue
            )
            # Sanitization protects visitors, but hallucinated model links
            # remain a strict FAIL rather than artificial acceptance.
            if response.get("unapproved_model_url_removed"):
                verdict["status"] = "fail"
                verdict["reasons"] = sorted(set(verdict["reasons"])
                                            | {"unapproved_model_url_removed"})
        except Exception as exc:
            # Never print the exception message: some model SDK errors echo
            # submitted questions or private configuration.
            verdict = {"id": case["id"], "status": "fail",
                       "reasons": ["model_or_evaluation_error"]}
        verdict["elapsed_seconds"] = round(time.monotonic() - start, 3)
        results.append(verdict)
        try:
            probes.append(probe(retriever, case))
        except Exception:
            probes.append({"id": case["id"], "attempted": True,
                           "expected_hit": None, "retrieved_count": 0,
                           "probe_error": True})
    summary = summarize(cases, results)
    doc_bytes = CATALOG_PATH.read_bytes()
    return {
        "model": model_name, "catalogue_sha256": hashlib.sha256(doc_bytes).hexdigest(),
        "summary": summary, "cases": results, "retrieval": probes,
        "notes": "Exact fact/source checks only; semantic truth needs review.",
    }


def compare_previous(report: dict) -> None:
    """Attach only aggregate deltas when model, public corpus and sample match."""
    # Reused report dictionaries must never carry deltas from an older model.
    report.pop("comparison", None)
    existing = REPORTS / "latest.json"
    if not existing.is_file() or "public_quality" not in report:
        return
    try:
        previous = json.loads(existing.read_text(encoding="utf-8"))
        old = previous.get("public_quality", {})
        new = report["public_quality"]
        if (old.get("model") != new.get("model")
                or old.get("catalogue_sha256") != new.get("catalogue_sha256")
                or len(old.get("cases", [])) != len(new.get("cases", []))):
            return
        old_metrics, new_metrics = old["summary"], new["summary"]
        deltas = {}
        for key in ("pass_rate", "p50_seconds", "p95_seconds"):
            a, b = old_metrics.get(key), new_metrics.get(key)
            if isinstance(a, (float, int)) and isinstance(b, (float, int)):
                deltas[key + "_change"] = round(b - a, 3)
        report["comparison"] = deltas
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return


def write_report(report: dict) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "latest.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    summary = report.get("public_quality", {}).get("summary", {})
    rows = "".join(
        "<tr><td>" + html.escape(str(case.get("id"))) + "</td><td>"
        + html.escape(str(case.get("status"))) + "</td><td>"
        + html.escape(str(case.get("elapsed_seconds", ""))) + "</td><td>"
        + html.escape(",".join(case.get("reasons", []))) + "</td></tr>"
        for case in report.get("public_quality", {}).get("cases", [])
    )
    safe_status = html.escape(str(report["status"]))
    safe_score = html.escape(str(summary.get("pass_rate", "N/A")))
    safe_stage = html.escape(str(report.get("stage", "unknown")))
    safe_error = html.escape(str(report.get("error_code", "none")))
    diagnostics = report.get("diagnostics") or {}
    safe_category = html.escape(str(diagnostics.get("category", "none")))
    safe_failed_tests = html.escape(
        ", ".join(diagnostics.get("failed_tests", [])) or "none identified"
    )
    frontend = report.get("frontend_diagnostics") or {}
    safe_frontend_step = html.escape(str(frontend.get("step", "none")))
    safe_frontend_category = html.escape(str(frontend.get("category", "none")))
    safe_frontend_exit_code = html.escape(str(frontend.get("exit_code", "N/A")))
    safe_failed_chat_locations = html.escape(
        ", ".join(frontend.get("failed_test_locations", [])) or "not identified"
    )
    markup = (
        '<!doctype html><html lang="en"><meta charset="utf-8">'
        '<title>PR16 RAG quality summary</title>'
        '<style>body{font:16px system-ui;max-width:960px;margin:40px auto}'
        'td,th{border:1px solid #ddd;padding:8px;text-align:left}'
        'table{border-collapse:collapse;width:100%}</style>'
        f'<h1>PR #16 — {safe_status}</h1>'
        f'<p>Last stage: <strong>{safe_stage}</strong>; '
        f'error code: <strong>{safe_error}</strong></p>'
        f'<p>Failure category: {safe_category}. '
        f'Failed test IDs: {safe_failed_tests}.</p>'
        f'<p>Frontend diagnostic: {safe_frontend_step}; '
        f'category: {safe_frontend_category}; '
        f'exit code: {safe_frontend_exit_code}; '
        f'failed chat test locations: {safe_failed_chat_locations}.</p>'
        f'<p>Mandatory pass rate: {safe_score}. '
        'Language checks are diagnostic-only.</p>'
        '<table><thead><tr><th>Case</th><th>Status</th><th>Seconds</th>'
        '<th>Safe reason codes</th></tr></thead><tbody>'
        + rows + '</tbody></table><p>No questions, answers, context, secrets '
        'or private document paths are stored here.</p></html>'
    )
    (REPORTS / "latest.html").write_text(markup, encoding="utf-8")


def main() -> int:
    report = {
        "pr": 16, "status": "failed",
        "time_utc": datetime.now(timezone.utc).isoformat(),
        "checks": {},
    }
    try:
        report["stage"] = "branch"
        branch, sha = check_branch()
        report["branch"], report["commit"] = branch, sha
        report["checks"]["branch"] = "pass"
        print(f"[OK] Verification branch: {branch} at {sha}", flush=True)
        report["stage"] = "dependencies"
        smoke = import_pr19_runner()
        smoke.ensure_packages()
        report["checks"]["dependencies"] = "pass"
        report["stage"] = "deterministic_tests"
        run_pytest()
        report["checks"]["deterministic_tests"] = "pass"
        # A broken local browser must not hide the RAG quality result.
        # Store only allowlisted step identifiers and attempt the model after
        # the browser diagnostics, while preserving overall FAIL status.
        frontend_failure = None
        report["stage"] = "frontend_browser"
        try:
            run_frontend_suite(report)
            report["checks"]["frontend_browser"] = "pass"
        except VerificationError as exc:
            frontend_failure = exc
            report["checks"]["frontend_browser"] = "fail"
            report["frontend_diagnostics"] = exc.details
            report["frontend_error_code"] = exc.code
            print("[WARN] Frontend failed; continuing to local RAG baseline "
                  "so results are not lost.", flush=True)
        report["stage"] = "local_config"
        config = safe_config()
        report["checks"]["local_config"] = "pass"
        report["stage"] = "public_quality"
        print("[RUN] Real Ollama quality baseline on PUBLIC catalogue.", flush=True)
        public = public_quality(config)
        report["public_quality"] = public
        report["checks"]["public_quality"] = public["summary"]["status"]
        report["stage"] = "private_api_smoke"
        print("[RUN] Authenticated private /ready and /chat via PR19 smoke.", flush=True)
        smoke.run_live(config)
        report["checks"]["private_api_smoke"] = "pass"
        report["stage"] = "complete"
        if frontend_failure is not None:
            report["status"] = "failed"
            report["stage"] = "frontend_browser"
            report["error_code"] = frontend_failure.code
            print("[RESULT] RAG baseline finished, but local frontend "
                  "regressions failed. Overall status: failed.", flush=True)
            return 1
        # A semantic review remains necessary even if the narrow automatic
        # checks pass: do not misrepresent this as complete quality assurance.
        report["status"] = public["summary"]["status"]
        print(
            f"[RESULT] Mandatory strict pass rate: "
            f"{public['summary']['pass_rate']:.1%}; "
            f"status={report['status']}", flush=True
        )
        return 0 if report["status"] == "passed" else 1
    except VerificationError as exc:
        report["error_code"] = exc.code
        report["checks"][report.get("stage", "unknown")] = "fail"
        if exc.details:
            report["diagnostics"] = exc.details
        print(f"[FAIL] At {report.get('stage', 'unknown')}: {exc}", flush=True)
        return 1
    except Exception as exc:
        report["error_code"] = type(exc).__name__
        report["checks"][report.get("stage", "unknown")] = "fail"
        print(
            f"[FAIL] At {report.get('stage', 'unknown')}: "
            f"{type(exc).__name__}; private data not printed.", flush=True,
        )
        return 1
    finally:
        try:
            compare_previous(report)
            write_report(report)
            print("[REPORT] tests/pr16/reports/latest.html and latest.json", flush=True)
        except OSError:
            print("[FAIL] Could not write local report.", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
