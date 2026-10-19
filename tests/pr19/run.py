"""One-click, keyless-for-the-user PR #19 verification.

Never edits .env, index files, git state, or secrets. Starts its own short-lived
loopback Flask process and passes the configured local key in memory only.
"""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_BRANCH = "fix/atomic-rag-index-snapshots"
REPORT_DIR = Path(__file__).resolve().parent / "reports"


class CheckFailure(Exception):
    pass


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise CheckFailure("This folder is not a valid Git working tree.")
    return result.stdout.strip()


def assert_branch() -> str:
    branch = git("branch", "--show-current")
    if branch != EXPECTED_BRANCH:
        raise CheckFailure(
            f"Expected PR #19 branch '{EXPECTED_BRANCH}', found '{branch or 'detached'}'. "
            "No changes were made. Open the PR #19 worktree and run this file there."
        )
    return git("rev-parse", "--short", "HEAD")


def ensure_packages() -> None:
    packages = (
        "pytest", "faiss", "numpy", "ollama", "flask", "flask_cors",
        "flask_limiter", "dotenv", "sentence_transformers",
    )
    missing = [package for package in packages
               if importlib.util.find_spec(package) is None]
    if not missing:
        print("[OK] Required Python packages are installed.", flush=True)
        return
    print("[SETUP] Installing missing Python dependencies in this environment...", flush=True)
    command = [sys.executable, "-m", "pip", "install",
               "-r", str(ROOT / "requirements-local-ai.txt"),
               "-r", str(ROOT / "requirements-local-api-dev.txt")]
    if subprocess.run(command, cwd=ROOT, check=False).returncode != 0:
        raise CheckFailure("Python dependency installation failed. See pip output above.")
    still_missing = [p for p in packages if importlib.util.find_spec(p) is None]
    if still_missing:
        raise CheckFailure("Some required Python packages are still unavailable.")


def run_frontend_suite() -> None:
    """Exercise JavaScript unit/build/browser tests without manual commands.

    Full cross-browser matrix remains in GitHub Actions; the local launcher
    exercises Chromium, including smoke, E2E, regression and chat variants.
    """
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    node = shutil.which("node.exe" if os.name == "nt" else "node")
    if not npm or not node:
        raise CheckFailure("Node.js and npm are required for automated frontend tests.")

    def execute(label: str, command: list[str], env: dict | None = None) -> None:
        print(f"[RUN] {label}", flush=True)
        if subprocess.run(command, cwd=ROOT, env=env, check=False).returncode != 0:
            raise CheckFailure(f"Frontend check failed: {label}")

    if not (ROOT / "node_modules" / ".bin" / (
        "playwright.cmd" if os.name == "nt" else "playwright"
    )).is_file():
        execute("Install locked JavaScript dependencies", [npm, "ci"])

    for label, command in [
        ("ESLint", [npm, "run", "lint"]),
        ("TypeScript", [npm, "run", "typecheck"]),
        ("Vitest unit tests", [npm, "run", "test:unit"]),
        ("Vercel proxy integration", [
            node, "--test", "tests/integration/frontend/ngrok-bridge.test.mjs"
        ]),
        ("Production frontend build", [npm, "run", "build"]),
    ]:
        execute(label, command)

    execute("Install Playwright Chromium if needed",
            [npm, "exec", "--", "playwright", "install", "chromium"])

    # CI=1 avoids attaching to an already-running Vite preview from another
    # branch, and also matches CI's browser test behavior.
    browser_env = dict(os.environ, CI="1")
    execute("Chromium smoke, E2E and regression",
            [npm, "run", "test:browser", "--", "--project=chromium"],
            browser_env)
    execute("Chat dev browser tests", [npm, "run", "test:chat-dev"], browser_env)
    public_build_env = dict(os.environ, VITE_ENABLE_PUBLIC_CHAT_UI="true")
    execute("Public chat build", [npm, "run", "build"], public_build_env)
    execute("Chat hydration browser tests", [npm, "run", "test:chat-hydration"],
            browser_env)
    print("[OK] Frontend and local Chromium regressions passed.", flush=True)


def load_config() -> dict[str, str]:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=False)
    # Environment variables take precedence over .env just as they do in Flask.
    config = dict(os.environ)
    enabled = config.get("REQUIRE_API_KEY", "false").strip().lower() in {
        "1", "true", "yes", "on"
    }
    if enabled and len(config.get("LOCAL_API_KEY", "")) < 24:
        raise CheckFailure("Local API-key protection is enabled but no usable key is configured.")
    return config


def isolated_env(config: dict[str, str], port: int) -> dict[str, str]:
    # Override networking ONLY for this child Flask process. Existing ngrok
    # settings in .env remain untouched; the private corpus stays loopback-only.
    return {
        **config,
        "LOCAL_API_PORT": str(port),
        "FRONTEND_URLS": "http://127.0.0.1:5001,http://localhost:5001",
        "TRUSTED_HOSTS": "127.0.0.1,localhost",
        "PUBLIC_ONLY_MODE": "false",
    }


def free_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def http_json(port: int, path: str, key: str = "", payload: dict | None = None,
              timeout: float = 4) -> tuple[int, dict]:
    headers = {"Accept": "application/json"}
    if key:
        headers["X-Local-API-Key"] = key
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = Request(
        url=f"http://127.0.0.1:{port}{path}",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers=headers,
        method="POST" if payload is not None else "GET",
    )
    try:
        with urlopen(req, timeout=timeout) as response:
            status, body = response.status, response.read(16384)
    except HTTPError as error:
        status, body = error.code, error.read(16384)
    result = json.loads(body) if body else {}
    if not isinstance(result, dict):
        raise CheckFailure(f"{path} returned a non-object JSON response.")
    return status, result


def assert_health(status: int, result: dict) -> None:
    if status != 200 or result.get("status") != "ok" or result.get("scope") != "local-only":
        raise CheckFailure("The temporary process did not return the expected /health payload.")


def assert_answer(status: int, result: dict) -> None:
    if status != 200 or not isinstance(result.get("reply"), str) or not result["reply"].strip():
        raise CheckFailure(f"/chat failed (HTTP {status} or empty reply).")
    if not isinstance(result.get("sources"), list):
        raise CheckFailure("/chat returned an invalid sources field.")


def wait_for_flask(proc: subprocess.Popen, port: int) -> None:
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise CheckFailure(
                "Temporary Flask process exited during startup. "
                "Check the local Flask/Ollama configuration; .env was not modified."
            )
        try:
            status, data = http_json(port, "/health", timeout=1)
            assert_health(status, data)
            return
        except (OSError, URLError, TimeoutError, ValueError):
            time.sleep(0.35)
    raise CheckFailure("Temporary Flask failed to start on a loopback port.")


def run_live(config: dict[str, str]) -> None:
    port = free_loopback_port()
    child_env = isolated_env(config, port)
    key = config.get("LOCAL_API_KEY", "") if (
        config.get("REQUIRE_API_KEY", "false").strip().lower()
        in {"1", "true", "yes", "on"}
    ) else ""
    # Temporary logfile is neither persisted nor echoed; it may contain runtime
    # diagnostic text that should not be shared or committed.
    with tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as output:
        proc = subprocess.Popen(
            [sys.executable, "-m", "llm.app"], cwd=ROOT,
            env=child_env, stdout=output, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        try:
            wait_for_flask(proc, port)
            print("[OK] Private Flask started on temporary 127.0.0.1 port.", flush=True)
            status, data = http_json(port, "/ready", key=key, timeout=15)
            if status == 401:
                raise CheckFailure(
                    "/ready returned HTTP 401. The existing process/environment "
                    "API-key settings do not agree; no key was displayed or changed."
                )
            if status != 200 or data.get("status") != "ready":
                # Tell apart FAISS failure from missing Ollama/model, without
                # exposing document contents, index paths or configuration values.
                try:
                    from llm.vector_store import load_index
                    load_index()
                except Exception as exc:
                    raise CheckFailure(
                        f"/ready HTTP {status}; active FAISS load failed "
                        f"({type(exc).__name__}). Local data was not modified."
                    ) from None
                raise CheckFailure(
                    f"/ready HTTP {status}; FAISS loaded, but Ollama or the "
                    "configured model is not ready."
                )
            print("[OK] Authenticated /ready returned HTTP 200.", flush=True)
            try:
                status, data = http_json(
                    port, "/chat", key=key,
                    payload={"message": "What projects has Sergei built?"},
                    timeout=155,
                )
            except (TimeoutError, OSError) as exc:
                raise CheckFailure(
                    f"/chat transport or generation timeout ({type(exc).__name__})."
                ) from None
            assert_answer(status, data)
            print("[OK] Authenticated /chat returned a non-empty reply.", flush=True)
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)


def write_report(report: dict) -> None:
    try:
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        (REPORT_DIR / "latest.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    except OSError:
        print("[WARN] Could not write the local summary report.", flush=True)


def main() -> int:
    report = {
        "pr": 19,
        "branch": EXPECTED_BRANCH,
        "time_utc": datetime.now(timezone.utc).isoformat(),
        "status": "failed",
        "checks": {},
    }
    try:
        sha = assert_branch()
        report["commit"] = sha
        report["checks"]["branch"] = "pass"
        print(f"[OK] PR #19 branch and commit: {sha}", flush=True)
        ensure_packages()
        report["checks"]["dependencies"] = "pass"
        print("[RUN] Automated backend / FAISS regression suite...", flush=True)
        status = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "tests/integration/backend",
             "tests/pr19/test_runner.py"],
            cwd=ROOT, check=False,
        ).returncode
        if status != 0:
            raise CheckFailure(f"Automated regression tests failed (exit {status}).")
        report["checks"]["automated_tests"] = "pass"
        print("[OK] All backend and PR #19 runner tests passed.", flush=True)
        run_frontend_suite()
        report["checks"]["frontend_browser"] = "pass"
        config = load_config()
        run_live(config)
        report["checks"]["local_ready_chat"] = "pass"
        report["status"] = "passed"
        print("\nPASS: PR #19 local tests and authenticated AI checks passed.", flush=True)
        return 0
    except CheckFailure as exc:
        print(f"\nFAIL: {exc}", flush=True)
        return 1
    except Exception as exc:
        print(f"\nFAIL: Unexpected {type(exc).__name__}; no secrets printed.", flush=True)
        return 1
    finally:
        write_report(report)
        print("Report: tests/pr19/reports/latest.json", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
