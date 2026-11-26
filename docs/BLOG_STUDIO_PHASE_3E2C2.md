# Phase 3E.2C.2A — scoped public Storage authorization candidate

Stacked on verified #68. Promotes exact tested #67 migration/test using CLI filename from run 45716583800. Removes the old temporary workflow and candidate copies. Normal CI rechecks it.

New candidate creates a non-login, non-bypass, read-only role scoped to one asset, a dedicated synthetic subject and a 60-second capability. Private helpers consult active publication references on every metadata resolution and Storage authenticated GET. Restrictive operation policy excludes signing/listing/write/delete, does not change browser/anon guards or bucket privacy. No issuer, route or published media activation. Only synthetic local CI uses the local JWT secret; no hosted signing keys, service-role fallback or credential configuration. See Supabase Storage access control and helper functions docs.

Candidate workflow allocates its own migration using pinned CLI and exercises pgTAP/lint and real local Storage with verified bytes from the existing API fixture. The synthetic publication is created only by disposable fixture SQL, not by the existing text-only RPC. It tests scope, operation denials and withdrawal. A later increment must validate the actual resolver/read adapter, shared asset cases and atomic publication before exposing a route. No hosted operations. CI pending.
