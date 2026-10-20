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
            "model": "test-model", "catalogue_sha256": "abcd",
            "summary": {"pass_rate": .9, "p50_seconds": 10,
                        "p95_seconds": 25},
            "cases": [{"id": "T-1", "status": "pass"}],
        }
    }
    runner.write_report(old)
    new = {
        "status": "passed",
        "public_quality": {
            "model": "test-model", "catalogue_sha256": "abcd",
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
