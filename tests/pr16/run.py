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
    pass


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


def run_pytest() -> None:
    print("[RUN] Deterministic backend, evaluator and prior snapshot tests.", flush=True)
    rc = subprocess.run([
        sys.executable, "-m", "pytest", "-q",
        "tests/integration/backend", "tests/pr19/test_runner.py",
        "tests/pr16/test_evaluator.py", "tests/pr16/test_quality_runner.py",
        "tests/pr16/test_retrieval_probe.py"
    ], cwd=ROOT, check=False).returncode
    if rc:
        raise VerificationError("Python regressions failed.")


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
    markup = (
        '<!doctype html><html lang="en"><meta charset="utf-8">'
        '<title>PR16 RAG quality summary</title>'
        '<style>body{font:16px system-ui;max-width:960px;margin:40px auto}'
        'td,th{border:1px solid #ddd;padding:8px;text-align:left}'
        'table{border-collapse:collapse;width:100%}</style>'
        f'<h1>PR #16 — {safe_status}</h1>'
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
        branch, sha = check_branch()
        report["branch"], report["commit"] = branch, sha
        print(f"[OK] Verification branch: {branch} at {sha}", flush=True)
        smoke = import_pr19_runner()
        smoke.ensure_packages()
        run_pytest()
        report["checks"]["deterministic_tests"] = "pass"
        smoke.run_frontend_suite()
        report["checks"]["frontend_browser"] = "pass"
        config = safe_config()
        print("[RUN] Real Ollama quality baseline on PUBLIC catalogue.", flush=True)
        public = public_quality(config)
        report["public_quality"] = public
        report["checks"]["public_quality"] = public["summary"]["status"]
        print("[RUN] Authenticated private /ready and /chat via PR19 smoke.", flush=True)
        smoke.run_live(config)
        report["checks"]["private_api_smoke"] = "pass"
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
        report["error_code"] = "verification_failed"
        print(f"[FAIL] {exc}", flush=True)
        return 1
    except Exception as exc:
        report["error_code"] = type(exc).__name__
        print(f"[FAIL] {type(exc).__name__}; private data not printed.", flush=True)
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
