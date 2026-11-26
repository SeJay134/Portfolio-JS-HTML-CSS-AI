# Phase 3E.2C.4 — publication lifecycle verification

Promotes verified atomic candidate (188 SQL / 215 real local API checks) into normal migrations and tests. No hosted migration. The test-only gate is enabled after checking default denial, then restored to false. Real RPC replaces synthetic publication in standard database CI.

Extended local acceptance checks: deliberately abort the last binding write with a fixture-only trigger and verify rollback of mapping/event/reference/post; retry the same request successfully; preserve text/image/quote order and captions; reject an incomplete alt-text republish without altering the existing snapshot; share one JPEG between two live articles; unpublish the first without losing the shared JPEG; archive the last, deny Storage and return HTTP 404. Fixture-only trigger removed in finally. No hosted signer, route activation, UI activation or deploy. New tests pending CI.
