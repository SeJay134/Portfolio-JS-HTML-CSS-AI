"""Local runner safety and reports; no real filesystem secrets/network."""
import importlib.util
import json
from pathlib import Path
import sys

import pytest

DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(DIR))
spec = importlib.util.spec_from_file_location("pr16_runner", DIR / "run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def test_only_pr16_and_merged_main_branches_allowed(monkeypatch):
    for branch in ("feat/rag-answer-quality-evaluation", "main"):
        monkeypatch.setattr(runner, "git", lambda *a, b=branch:
                            b if a == ("branch", "--show-current") else "abc123")
        assert runner.check_branch() == (branch, "abc123")
    monkeypatch.setattr(runner, "git", lambda *a: "unrelated")
    with pytest.raises(runner.VerificationError):
        runner.check_branch()


def test_safe_config_is_local_and_no_secrets_displayed(monkeypatch):
    from dotenv import load_dotenv
    monkeypatch.setenv("OLLAMA_HOST", "http://external.example:11434")
    with pytest.raises(runner.VerificationError, match="loopback"):
        runner.safe_config()


def test_report_contains_verdicts_without_user_prompt_or_reply(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    runner.write_report({
        "pr": 16, "status": "needs_review",
        "public_quality": {
            "summary": {"pass_rate": 0.93},
            "cases": [
                {"id": "PUB-OV-1", "status": "pass",
                 "reasons": [], "elapsed_seconds": 1.5},
                {"id": "NEG-3", "status": "needs_review",
                 "reasons": ["ambiguous_refusal"], "elapsed_seconds": 3.2}
            ]
        }
    })
    data = json.loads((tmp_path / "latest.json").read_text())
    page = (tmp_path / "latest.html").read_text()
    assert data["public_quality"]["summary"]["pass_rate"] == .93
    assert "PUB-OV-1" in page
    assert "LOCAL_API_KEY" not in page
    assert "reply" not in page.lower()


def test_report_html_escapes_all_case_values(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    runner.write_report({"status": "failed", "public_quality": {
        "cases": [{"id": "<script>alert(1)</script>", "status": "fail",
                   "reasons": ["<b>"]}]
    }})
    text = (tmp_path / "latest.html").read_text()
    assert "<script>" not in text and "<b>" not in text
    assert "&lt;script&gt;" in text


def test_required_python_tests_are_launched_in_single_call(monkeypatch):
    calls = []
    class Result:
        returncode = 0
    def run(args, **kwargs):
        calls.append(args)
        return Result()
    monkeypatch.setattr(runner.subprocess, "run", run)
    runner.run_pytest()
    assert len(calls) == 1
    assert "tests/pr16/test_evaluator.py" in calls[0]
    assert "tests/integration/backend" in calls[0]


def test_safe_config_passes_offline_flags_to_flask_child(monkeypatch):
    monkeypatch.setenv("OLLAMA_HOST", "http://127.0.0.1:11434")
    cfg = runner.safe_config()
    assert cfg["HF_HUB_OFFLINE"] == "1"
    assert cfg["TRANSFORMERS_OFFLINE"] == "1"


def test_repeated_runs_compare_only_same_model_and_catalogue(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    old = {
        "status": "passed",
        "public_quality": {
            "model": "test-model",
            "catalogue_sha256": "a" * 64,
            "case_suite_sha256": "b" * 64,
            "prompt_sha256": "c" * 64,
            "public_evidence_sha256": "d" * 64,
            "summary": {"pass_rate": .9, "p50_seconds": 10,
                        "p95_seconds": 25},
            "cases": [{"id": "T-1", "status": "pass"}],
        }
    }
    runner.write_report(old)
    new = {
        "status": "passed",
        "public_quality": {
            "model": "test-model",
            "catalogue_sha256": "a" * 64,
            "case_suite_sha256": "b" * 64,
            "prompt_sha256": "c" * 64,
            "public_evidence_sha256": "d" * 64,
            "summary": {"pass_rate": 1., "p50_seconds": 7,
                        "p95_seconds": 20},
            "cases": [{"id": "T-1", "status": "pass"}],
        }
    }
    runner.compare_previous(new)
    assert new["comparison"] == {
        "pass_rate_change": .1, "p50_seconds_change": -3,
        "p95_seconds_change": -5
    }
    other_model = json.loads(json.dumps(new))
    other_model["public_quality"]["model"] = "different-model"
    runner.compare_previous(other_model)
    assert "comparison" not in other_model


def test_pytest_isolation_does_not_modify_real_env_or_key(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "true")
    monkeypatch.setenv("LOCAL_API_KEY", "private-do-not-share")
    monkeypatch.setenv("PUBLIC_ONLY_MODE", "true")
    monkeypatch.setenv("FRONTEND_URLS", "https://external.example")
    monkeypatch.setenv("TRUSTED_HOSTS", "external.example")
    test_env = runner.isolated_test_env()
    assert test_env["PYTHON_DOTENV_DISABLED"] == "1"
    assert test_env["REQUIRE_API_KEY"] == "false"
    assert test_env["PUBLIC_ONLY_MODE"] == "false"
    assert test_env["FRONTEND_URLS"].startswith("http://127.0.0.1")
    assert "LOCAL_API_KEY" not in test_env
    assert runner.os.environ["LOCAL_API_KEY"] == "private-do-not-share"
    assert runner.os.environ["REQUIRE_API_KEY"] == "true"


def test_pytest_failure_reports_only_safe_test_ids(monkeypatch):
    output = (
        "FAILED tests/integration/backend/test_local_api.py::test_health_ready_cors_and_static_files - AssertionError\n"
        "ERROR tests/pr16/test_evaluator.py\n"
        "secret path C:\\Users\\private\\data\\base\\do-not-share.md\n"
    )
    class Result:
        returncode = 1
        stdout = output
        stderr = ""
    monkeypatch.setattr(
        runner.subprocess, "run", lambda *args, **kwargs: Result()
    )
    with pytest.raises(runner.VerificationError) as caught:
        runner.run_pytest()
    assert caught.value.code == "pytest_failed"
    info = caught.value.details
    assert info["pytest_exit_code"] == 1
    assert "tests/integration/backend/test_local_api.py::test_health_ready_cors_and_static_files" in info["failed_tests"]
    assert "tests/pr16/test_evaluator.py" in info["failed_tests"]
    assert "do-not-share" not in str(info)


def test_failure_report_identifies_exact_stage(tmp_path, monkeypatch):
    class FakeSmoke:
        def ensure_packages(self):
            return None
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    monkeypatch.setattr(
        runner, "check_branch",
        lambda: ("feat/rag-answer-quality-evaluation", "abc123")
    )
    monkeypatch.setattr(runner, "import_pr19_runner", lambda: FakeSmoke())
    def fail_pytest():
        raise runner.VerificationError(
            "Python regressions failed.", code="pytest_failed",
            details={"pytest_exit_code": 1, "category": "test_assertion",
                     "failed_tests": ["tests/pr16/test_evaluator.py"]},
        )
    monkeypatch.setattr(runner, "run_pytest", fail_pytest)
    assert runner.main() == 1
    data = json.loads((tmp_path / "latest.json").read_text())
    assert data["stage"] == "deterministic_tests"
    assert data["error_code"] == "pytest_failed"
    assert data["checks"] == {
        "branch": "pass", "dependencies": "pass", "deterministic_tests": "fail"
    }
    assert data["diagnostics"]["failed_tests"] == ["tests/pr16/test_evaluator.py"]


def test_safe_html_shows_stage_and_failure_identifiers(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    runner.write_report({
        "status": "failed", "stage": "deterministic_tests",
        "error_code": "pytest_failed",
        "diagnostics": {
            "category": "test_assertion",
            "failed_tests": ["tests/integration/backend/test_local_api.py"],
        }
    })
    html_text = (tmp_path / "latest.html").read_text()
    assert "deterministic_tests" in html_text
    assert "pytest_failed" in html_text
    assert "tests/integration/backend/test_local_api.py" in html_text


def test_windows_launcher_opens_generated_report_automatically():
    script = (DIR / "RUN_PR16.cmd").read_text(encoding="utf-8")
    assert 'start "" "%~dp0reports\\latest.html"' in script


def test_frontend_diagnostics_classify_port_and_missing_chromium():
    assert runner._classify_frontend_failure(
        "Error: Port 5001 is already in use", "chat_dev"
    ) == "port_in_use"
    assert runner._classify_frontend_failure(
        "browserType.launch: Executable doesn't exist", "chromium_browser"
    ) == "browser_not_installed"
    assert runner._classify_frontend_failure(
        "FAIL: unknown case", "vitest"
    ) == "test_or_build_failure"


def test_frontend_failing_step_reports_safe_identifier(monkeypatch):
    monkeypatch.setattr(
        runner.shutil, "which",
        lambda name: "C:/test/npm.cmd" if "npm" in name else "C:/test/node.exe"
    )
    monkeypatch.setattr(
        runner.Path, "is_file",
        lambda self: True
    )
    class FakeResult:
        returncode = 1
        stdout = "Error: Port 4173 is already in use; secret=hidden"
        stderr = ""
    monkeypatch.setattr(runner.subprocess, "run",
                        lambda *args, **kwargs: FakeResult())
    report = {}
    with pytest.raises(runner.VerificationError) as exc:
        runner.run_frontend_suite(report)
    assert exc.value.code == "frontend_failed"
    assert exc.value.details["step"] == "eslint"
    assert exc.value.details["category"] == "port_in_use"
    assert "hidden" not in str(exc.value.details)
    assert report["frontend_steps"]["eslint"] == "fail"


def test_frontend_report_contains_only_safe_stage_and_exit_code(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    runner.write_report({
        "status": "failed", "stage": "frontend_browser",
        "frontend_diagnostics": {
            "step": "chat_dev", "category": "port_in_use", "exit_code": 1,
        }, "frontend_steps": {"eslint": "pass", "chat_dev": "fail"}
    })
    data = json.loads((tmp_path / "latest.json").read_text())
    html_text = (tmp_path / "latest.html").read_text()
    assert data["frontend_diagnostics"]["step"] == "chat_dev"
    assert "chat_dev" in html_text and "port_in_use" in html_text
    assert "LOCAL_API_KEY" not in html_text


def test_frontend_failure_still_allows_real_quality_stage(monkeypatch, tmp_path):
    class FakeSmoke:
        def ensure_packages(self): pass
        def run_live(self, config): pass
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    monkeypatch.setattr(
        runner, "check_branch",
        lambda: ("feat/rag-answer-quality-evaluation", "abc123")
    )
    monkeypatch.setattr(runner, "import_pr19_runner", lambda: FakeSmoke())
    monkeypatch.setattr(runner, "run_pytest", lambda: None)
    def failing_frontend(report):
        report["frontend_steps"] = {"chat_dev": "fail"}
        raise runner.VerificationError(
            "Frontend failed", code="frontend_failed",
            details={"step": "chat_dev", "category": "port_in_use", "exit_code": 1},
        )
    monkeypatch.setattr(runner, "run_frontend_suite", failing_frontend)
    monkeypatch.setattr(runner, "safe_config", lambda: {})
    reached = []
    def quality(config):
        reached.append(True)
        return {"summary": {"status": "passed", "pass_rate": 1},
                "cases": [], "retrieval": []}
    monkeypatch.setattr(runner, "public_quality", quality)
    assert runner.main() == 1
    assert reached
    saved = json.loads((tmp_path / "latest.json").read_text())
    assert saved["checks"]["frontend_browser"] == "fail"
    assert saved["checks"]["public_quality"] == "passed"
    assert saved["checks"]["private_api_smoke"] == "pass"
    assert saved["frontend_diagnostics"]["step"] == "chat_dev"
    assert saved["status"] == "failed"


def test_chat_dev_failure_location_parser_keeps_only_whitelisted_line_numbers():
    output = (
        "  1) [chromium] › tests/integration/frontend/chat-dev.spec.ts:117:3 "
        "› failing public chat test\n"
        "  private path C:\\Users\\owner\\secrets.md\n"
        "  2) [chromium] › tests/integration/frontend/untrusted.spec.ts:40:1 "
        "› private assertion\n"
    )
    positions = runner._safe_chat_dev_test_locations(output)
    assert positions == ["chat-dev.spec.ts:117"]
    assert "owner" not in str(positions)
    assert "private" not in str(positions)


def test_chat_test_port_is_loopback_ephemeral_and_not_regular_site_port():
    port = runner.choose_chat_test_port()
    assert 1024 <= port <= 65535
    assert port != 5001


def test_isolated_chat_port_is_forwarded_only_to_chat_dev(monkeypatch):
    monkeypatch.setattr(
        runner.shutil, "which",
        lambda name: "C:/test/npm.cmd" if "npm" in name else "C:/test/node.exe"
    )
    monkeypatch.setattr(runner.Path, "is_file", lambda self: True)
    monkeypatch.setattr(runner, "choose_chat_test_port", lambda: 51019)
    seen = []
    class Result:
        returncode = 0
        stdout = ""
        stderr = ""
    def fake_subprocess(command, **kwargs):
        seen.append((command, kwargs.get("env")))
        return Result()
    monkeypatch.setattr(runner.subprocess, "run", fake_subprocess)
    report = {}
    runner.run_frontend_suite(report)
    chat_calls = [env for args, env in seen if "test:chat-dev" in args]
    assert len(chat_calls) == 1
    assert chat_calls[0]["PR16_CHAT_DEV_PORT"] == "51019"
    # No leaked temporary port is passed to other tests or the env itself.
    assert not any(env and "PR16_CHAT_DEV_PORT" in env
                   for args, env in seen if "test:chat-dev" not in args)
    assert report["frontend_steps"]["chat_dev"] == "pass"


def test_suite_fingerprint_changes_for_same_size_new_id_or_expectation(scenarios):
    import copy
    current = runner.case_suite_sha256(scenarios)
    assert len(current) == 64
    adjusted = copy.deepcopy(scenarios)
    adjusted[0]["id"] = "DIFFERENT-ID"
    assert runner.case_suite_sha256(adjusted) != current
    adjusted = copy.deepcopy(scenarios)
    adjusted[0]["question"] = "A different question with identical case ID?"
    assert runner.case_suite_sha256(adjusted) != current
    adjusted = copy.deepcopy(scenarios)
    adjusted[0]["required_terms"][0] += " amended"
    assert runner.case_suite_sha256(adjusted) != current
    adjusted = copy.deepcopy(scenarios)
    adjusted[-1]["check_language"] = True
    assert runner.case_suite_sha256(adjusted) != current


def _baseline_stub(hash_a="a" * 64):
    return {"status": "passed", "public_quality": {
        "model": "test-model",
        "catalogue_sha256": "b" * 64,
        "case_suite_sha256": hash_a,
        "prompt_sha256": "c" * 64,
        "public_evidence_sha256": "d" * 64,
        "summary": {"pass_rate": .95, "p50_seconds": 1, "p95_seconds": 5},
        "cases": [{"id": "CASE-1", "status": "pass"}],
    }}


def test_report_comparison_rejects_different_suite_with_equal_count(
    tmp_path, monkeypatch
):
    import copy
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    old = _baseline_stub()
    runner.write_report(old)
    new = _baseline_stub(hash_a="f" * 64)
    new["public_quality"]["summary"]["pass_rate"] = 1.
    runner.compare_previous(new)
    assert "comparison" not in new
    # A changed ID is also rejected even if someone spoofs the suite hash.
    changed_id = copy.deepcopy(old)
    changed_id["public_quality"]["cases"][0]["id"] = "CASE-2"
    runner.compare_previous(changed_id)
    assert "comparison" not in changed_id


def test_report_comparison_rejects_legacy_and_changed_prompts(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    old = _baseline_stub()
    runner.write_report(old)
    changed_prompt = _baseline_stub()
    changed_prompt["public_quality"]["prompt_sha256"] = "e" * 64
    runner.compare_previous(changed_prompt)
    assert "comparison" not in changed_prompt
    legacy = _baseline_stub()
    del legacy["public_quality"]["case_suite_sha256"]
    runner.write_report(legacy)
    next_run = _baseline_stub()
    runner.compare_previous(next_run)
    assert "comparison" not in next_run


def test_comparable_reports_preserve_only_aggregate_deltas(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "REPORTS", tmp_path)
    old = _baseline_stub()
    runner.write_report(old)
    new = _baseline_stub()
    new["public_quality"]["summary"]["pass_rate"] = 1.0
    runner.compare_previous(new)
    assert new["comparison"]["pass_rate_change"] == .05
    assert "question" not in str(new["comparison"])
