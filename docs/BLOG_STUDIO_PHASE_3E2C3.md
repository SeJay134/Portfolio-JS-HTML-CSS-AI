# Phase 3E.2C.3 — atomic media publication candidate

Stacked on #70 (final CI pending). Candidate remains outside normal migrations until verified using pinned CLI in disposable CI. Private singleton gate OFF by default; no browser or service role may change it. No hosted issuer or Vercel route configured.

Reuses authorized owner, live session, locks, revision/generation CAS, idempotency and event limits. Validated image/gallery blocks in original order, cover metadata, verified object size existence check and generation-specific references are written in the same transaction as public snapshot and event. Text-only behavior unchanged. Cover captions rejected, alt text required. Failed binding rolls back transaction. Unpublish/archive use existing lifecycle; old generation references retained but ineligible. Gate controls new publication, not existing delivery. Previously copied bytes cannot be recalled.

Normal API tests retain synthetic fixture. Candidate CI enables gate only in disposable postgres and exercises real authenticated publish, anonymous canonical projection, local HTTP JPEG, real unpublish and old-request replay. Additional shared-asset, rollback and mixed-block tests required before activation. No hosted changes, merge or deploy. CI pending.
