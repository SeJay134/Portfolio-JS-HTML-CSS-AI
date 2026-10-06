# Test Architecture

All automated tests, fixtures, and manual scenarios live under this directory.

| Directory | Purpose | Normal trigger |
| --- | --- | --- |
| `unit/` | Deterministic module/component behavior | Every branch |
| `integration/` | Internal/API/module contracts | Every branch |
| `e2e/` | Complete browser journeys | PR/main release gate |
| `smoke/` | Minimal build/deploy health | Every branch and after deploy |
| `regression/` | Accepted behavior/fixed defects | PR/main release gate |
| `future/` | Planned, not-yet-implemented scenarios | Never executed as green CI |
| `fixtures/` | Reusable deterministic data | Suites/tools |
| `scenarios/` | Manual acceptance/release checklists | Before/after release |
| `setup/` | Test-runner setup | Runner configuration |

## Commands

```bash
npm run test:unit
python -m pytest -q tests/unit/backend tests/integration/backend
npm run build
npm run test:smoke
npm run test:e2e
npm run test:regression
npm run test:browser
```

Rules: keep one canonical test; add regression coverage for fixed defects when
practical; keep smoke small; convert future scenarios when implementation begins;
do not use public internet in unit/integration suites; record manual browser/device
evidence in docs/VALIDATION.md; never weaken a test merely to make a gate green.
