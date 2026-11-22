# Local moderation engine (PR A)

## Current scope

Photo Compressor and File Converter use the same backward-compatible
"contentSafety.ts" facade. It now delegates to "src/lib/moderation/":

- "types.ts" - detector contracts, category identifiers, and explicit allow/block/unverified results.
- "imagePreprocessor.ts" - local file validation, still-frame decoding, 224x224 canvas preparation, memory safeguards and cleanup.
- "detectors/adultDetector.ts" - existing NSFWJS MobileNetV2 model and unchanged adult thresholds.
- "policyEngine.ts" - versioned, pure fail-closed decision logic.
- "moderationEngine.ts" - sequential orchestration of explicitly required classifiers.
- "contentSafety.ts" - stable "loadSafetyModel()" and "screenImage()" APIs used by both tools; "moderateImage()" is an additive structured-decision API.

No new model provider, client API key, network upload, server processing, or
image/database storage has been introduced. Models are bundled and lazy-loaded.
The browser obtains a Blob URL for local decoding and revokes it after use.

## Safety invariants

1. In the active policy version "adult-only-v1", ONLY adult imagery is checked.
   The presence of other category types does not constitute a detector or legal check.
2. Invalid or missing required detector results produce "unverified", not "allow".
3. A verified positive result is "block". Other mandatory checks can be
   unavailable without changing that known-block result.
4. "screenImage()" converts "unverified" to "SafetyCheckError". Both existing
   browser tools skip that input; a model initialization failure aborts the batch.
5. Cancellation is propagated as AbortError rather than treated as an allowed image.
6. The legacy NSFWJS classification thresholds, supported format set,
   25 MiB / 40 megapixel resource caps and 300-file batch cap remain unchanged.
7. Screening occurs on a single decoded still frame. Animated later frames are NOT
   checked and cannot be claimed safe by this mechanism.
8. Browser checks can be bypassed and are not moderation enforcement for public uploads,
   publishing, sharing, or media retained by a server. CSAM and other severe harms need
   specialist evaluation and legally reviewed processes if hosted functionality is added.

## Extending the engine (future PRs)

- First license, independently evaluate and validate a suitable on-device model.
- Introduce one "ModerationDetector" implementation per category, with a stable detector
  identifier; preserve the local canvas input unless privacy architecture is revised.
- Add a policy version and required category only AFTER the corresponding detector
  has been tested on intended mobile browsers and an appropriate benchmark.
- Treat model unavailable/malformed output as "unverified" and never expose a bypass
  that silently downgrades required safety checks.
- Define new policy-specific thresholds through evaluation, including false positives,
  false negatives and contextual limitations. Do not claim consent, copyright, legal
  jurisdiction, or criminality can be established from a visual classifier alone.
- Before any addition of cloud moderation, obtain privacy/legal review and explicit
  change approval; this PR intentionally uses **strictly local processing**.

## Validation

- npm run lint
- npm run typecheck
- npm run test:unit
- npm run build
- npm run test:smoke -- --project=chromium
- npm run test:regression -- --project=chromium
- npm run test:e2e (PR workflow, Chromium/Firefox/WebKit)
- Verify on physical iPhone Safari before release; no PR A merge or production rollout.
