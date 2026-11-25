# Phase 2F.2 — local real Google OAuth acceptance record

Date: 2026-11-25. Scope: operator-reported Windows local staging; reviewed commit `d5e642e4f0f2dd2708fde573d937d9a79d90a96f` (PR #50 stacked on PR #49). This is a record of observed manual results supplied by the operator, not an independent remote inspection. No production deployment, hosted migration, hosted admin assignment, or hosted storage change was authorized.

## Environment and prerequisites

- Windows PowerShell, WSL 2, local Docker Desktop Linux engine (29.9.3 after recovery from a WSL timeout); Python 3.11.0, Node 22.23.5, npm 10.9.9, Supabase CLI 3.4.0.
- Separate Google Cloud staging project and Web OAuth client, External / Testing, operator-confirmed setup. Loopback app 127.0.0.1:5511, OAuth callback 127.0.0.1:54321/auth/v1/callback. No real credentials or email recorded here.
- PR #50: all four push/PR workflows completed successfully; fresh npm audit zero findings on Linux, Windows and the operator's workstation; 183 unit tests on each platform, 84 E2E, 180 regression, 29 local Data API checks. The existing nsfwjs engine and ESLint deprecation warnings remain. CI OAuth smoke uses fake credentials, not a real Google identity.
- Windows Firewall enabled with default inbound block; additional inbound TCP block for staging ports 5511 and 54320–54329, active-policy output included Enforced. Operator stopped cloudflared; existing ngrok target was localhost:5002 (not staging). A disposable Docker HTTP probe at port 54321 was reachable on the PC via loopback and not reachable on an iPhone on the same Wi-Fi. This is limited evidence, not proof of isolation across all interfaces, IPv6, devices, tunnels or ports.
- One existing Google account was used as an explicitly accepted local-test exception because a second identity was unavailable. This does not grant any production permission. Do not treat this exception as approval to seed a production allowlist or change the recommended dedicated-identity policy.

## Executed scenarios

| Scenario | Outcome | Evidence / scope |
|---|---|---|
| Disposable local smoke | PASS | Operator terminal: Google sole enabled provider; expected Google authorization redirect (not followed); stack stopped |
| Public blog | PASS | Operator reported the local public blog opened as expected |
| Anonymous Blog Studio gate | PASS | Operator reported Google sign-in was required |
| Real Google OAuth | PASS | Operator reported the real sign-in returned to Blog Studio |
| Admin enrollment | PASS | UI displayed Administrator access confirmed |
| Local DB binding | PASS | Aggregate query returned admins=1, profiles=1, bound_allowlist=1; no account IDs or email printed in report |
| Repeat login, refresh, logout | PASS (operator summary) | Operator reported the instructed sequence worked; no separate network capture or individual step trace |
| Allowlist disable | PASS (UI) | After requested local disable and reload: Administrator access is not available for this account |
| Allowlist restore | PASS (UI) | After requested local enable and reload: Administrator access confirmed |
| Session revocation | PASS (UI) | After requested local session deletion and reload: Administrator access is not available for this account |

The UI results complement the earlier automated SQL/REST tests; they do not independently establish exact HTTP status, actual JWT claims, or every authorization policy.

## Outstanding acceptance items

- NOT RUN: distinct non-allowlisted real Google account; cancel consent callback; separate blocked-profile status test; back-forward cache behavior as an individually observed scenario.
- NOT CAPTURED: verified identity/session claim aggregates (provider, amr, session_id, no client_id) from real OAuth, exact CORS/HTTP responses, same-token denial of real OAuth Data API requests. Synthetic coverage is not a substitute for these observations.
- Cleanup after the interactive session: Ctrl+C and closing the private browser window were instructed; final output/container removal not yet reported. The earlier smoke cleanup was confirmed. Before the next run, verify no staging containers or stale volumes remain; never delete unrelated containers/volumes.
- Staging Google client remains available for future testing; no deletion/rotation confirmed. No credentials in Git, screenshots, HAR, logs or this record.
- Hosted Phase 2F.3 backup/restore, configuration audit, deployment rollback readiness, explicit migration approval, hosted postchecks and production admin enrollment/feature flags remain separate gates. No production GO decision.

## Decision

Local real administrator OAuth, allowlist enforcement/restoration and UI denial after revocation are demonstrated for the executed scenarios. The overall original Phase 2F.2 acceptance checklist is PARTIAL, not complete. GO for isolated Phase 3 planning/development with synthetic and local test data; NO-GO for production activation, real content publication or hosted migration. Record later outstanding tests in a follow-up without storing personal data.
