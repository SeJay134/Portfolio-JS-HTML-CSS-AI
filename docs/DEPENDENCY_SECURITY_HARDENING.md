# Development dependency security hardening

Scope: isolated OAuth staging (PR #49). No production settings, hosted database, migrations, auth logic or actual OAuth credentials changed. Initial local npm audit: 13 findings (9 moderate, 4 high); npm audit --omit=dev: zero.

## Resolution

The temporary GitHub Actions resolver (read-only token, no lifecycle scripts) ran npm install --save-dev --save-exact --package-lock-only --ignore-scripts vite@8.3.8 vitest@5.1.2 typescript-eslint@8.74.0, followed by npm audit fix --package-lock-only --ignore-scripts and npm audit --audit-level=low. No --force. Resolver run 45638646284 reported zero findings; lockfile JSON SHA-256 7f847b17a30257b6ad655b341996bc16a1c69999fb0af3f89265c40f7298240f. All changed lock entries except the root are dev-only; application dependency declarations unchanged. Final install and CI must still pass.

| Package | Before | After |
|---|---:|---:|
| vite | 8.3.1 | 8.3.8 |
| vitest / @vitest/mocker | 5.0.2 | 5.1.2 |
| typescript-eslint | 8.48.1 | 8.74.0 |
| minimatch (typescript-estree) | 9.0.9 | 11.0.9 |
| source-map-js | 1.2.1 | 1.2.4 |
| undici | 8.11.2 | 8.13.1 |
| zod | 4.6.5 | 4.6.7 |

CI adds a full npm audit gate and Windows Node 22.23.5 install/audit/typecheck/unit/build job; database workflows also run on dependency manifest/lock changes. Existing nsfwjs exact Node 22.13.0 engine warning was present in passing previous CI on 22.23.5; unchanged, not treated as proof of compatibility. ESLint 9 deprecation remains; no unrelated major upgrade. Audit is time-dependent and not proof of absence of security flaws.

Local operator: use the final reviewed commit only after required checks succeed. Run npm ci and npm audit (no --force). Do not start the staging launcher with actual credentials until audit, tests, local firewall verification and dedicated test identity requirements are satisfied. Do not commit supabase/.temp/ or credentials.
