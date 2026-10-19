"""Fast tests of the PR #19 one-click runner (no real network or secrets)."""
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

RUNNER_FILE = Path(__file__).with_name("run.py")
spec = importlib.util.spec_from_file_location("pr19_runner", RUNNER_FILE)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def test_expected_branch_is_verified_without_switching(monkeypatch):
    monkeypatch.setattr(runner, "git", lambda *args: (
        runner.EXPECTED_BRANCH if args == ("branch", "--show-current") else "abc1234"
    ))
    assert runner.assert_branch() == "abc1234"


def test_wrong_branch_is_blocked_without_changing_git(monkeypatch):
    called = []
    def git(*args):
        called.append(args)
        return "main"
    monkeypatch.setattr(runner, "git", git)
    with pytest.raises(runner.CheckFailure, match="Expected PR #19 branch"):
        runner.assert_branch()
    assert called == [("branch", "--show-current")]


def test_child_process_is_forced_to_loopback_private_mode_without_mutating_input():
    source = {
        "LOCAL_API_KEY": "local-super-secret-for-unit-testing",
        "REQUIRE_API_KEY": "true",
        "PUBLIC_ONLY_MODE": "true",
        "TRUSTED_HOSTS": "external.example",
        "FRONTEND_URLS": "https://external.example",
        "MODEL_NAME": "local-model",
    }
    env = runner.isolated_env(source, 58585)
    assert env["LOCAL_API_PORT"] == "58585"
    assert env["PUBLIC_ONLY_MODE"] == "false"
    assert env["TRUSTED_HOSTS"] == "127.0.0.1,localhost"
    assert env["FRONTEND_URLS"].startswith("http://127.0.0.1:")
    assert env["REQUIRE_API_KEY"] == "true"
    assert env["LOCAL_API_KEY"] == source["LOCAL_API_KEY"]
    assert source["PUBLIC_ONLY_MODE"] == "true"


def test_http_request_includes_key_only_as_header(monkeypatch):
    observed = []
    class Response:
        status = 200
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def read(self, limit):
            return b'{"status":"ready"}'
    def urlopen(req, timeout):
        observed.append(req)
        return Response()
    monkeypatch.setattr(runner, "urlopen", urlopen)
    status, data = runner.http_json(
        58585, "/ready", key="local-super-secret", timeout=2
    )
    assert status == 200 and data == {"status": "ready"}
    assert observed[0].get_header("X-local-api-key") == "local-super-secret"
    assert b"local-super-secret" not in (observed[0].data or b"")
    assert "local-super-secret" not in observed[0].full_url


@pytest.mark.parametrize("result", [
    {"reply": ""},
    {"reply": 22},
    {"reply": "ok", "sources": "bad"},
])
def test_invalid_chat_payload_is_rejected(result):
    with pytest.raises(runner.CheckFailure):
        runner.assert_answer(200, result)


def test_empty_or_nonlocal_health_is_rejected():
    with pytest.raises(runner.CheckFailure):
        runner.assert_health(200, {"status": "ok", "scope": "public"})
    runner.assert_health(200, {"status": "ok", "scope": "local-only"})


def test_report_contains_no_api_key(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "REPORT_DIR", tmp_path)
    runner.write_report({
        "pr": 19, "status": "passed", "checks": {"local_ready_chat": "pass"}
    })
    report = json.loads((tmp_path / "latest.json").read_text())
    assert report["status"] == "passed"
    assert "LOCAL_API_KEY" not in str(report)
