# PR B — Local-only violence / gore research

## Status (not a production detector)

This is a **research/prototype PR** stacked on PR A. It does not merge into
"main", alter user-facing Photo Compressor/File Converter behavior, or add
any violence/gore category to the required production moderation policy.

The existing NSFWJS adult check stays exactly as it was in PR A.
"adult-only-v1" remains the only active policy. Neither sexual-content
detection nor an NSFL model establishes legality, child safety, permission,
consent, copyright status, terrorism, threats, or general violence.

## Model comparison (published artifacts, NOT independent accuracy)

Benchmarked here means **screened candidates for suitability by documented
weight download footprint, licensing, task coverage and known limitations**,
plus an optional direct desktop browser inference benchmark for the two
ONNX research candidates. Do not confuse this with a validated precision/recall benchmark.
To print the source-derived comparison:

    node scripts/benchmark-moderation-candidates.mjs

| Model / task | Published approximate weights | License / note | Decision |
| --- | ---: | --- | --- |
| [OwenElliott/image-safety-classifier-xs](https://huggingface.co/OwenElliott/image-safety-classifier-xs) — NSFL (gore), NSFW, SFW | **13.1 MB** ONNX / ~3.5M params | MIT; SwiftFormer Apache notice; author warns NSFL class is underrepresented | **Selected for experimental ONNX browser integration; NOT approved for enforcement** |
| [onnx-community/vit-base-violence-detection-ONNX](https://huggingface.co/onnx-community/vit-base-violence-detection-ONNX/tree/main/onnx) — violent vs nonviolent scenes | **86.8 MB** int8 / 343 MB fp32 | Upstream Apache 2.0; trained on a "real life violence situations" dataset | Research only; too much memory/download cost until iPhone measured |
| [khasinski/siglip2-moderation-heads](https://huggingface.co/khasinski/siglip2-moderation-heads) — violence head | **789 KB** head **plus required 400M-param SigLIP2 encoder** | Apache 2.0; head is *not* an image model by itself | Not suitable for the mobile batch budget |
| [Stealthbox/stealthbox-onnx-models](https://huggingface.co/Stealthbox/stealthbox-onnx-models) — gore and violence | Not independently verified | GPL; insufficient provenance / evaluation evidence for this app | Not selected |

Important: the OwenElliott model card reports overall accuracy **97.76% on
its own dataset**, not externally verified accuracy for gore detection or
this portfolio. The same card explicitly says NSFL is underrepresented.
Its class order is **[NSFL, NSFW, SFW]** and its ONNX graph includes
normalization and softmax. Graphic gore is **not** synonymous with all
violence, bullying, self-harm or child abuse. These capabilities are not
being claimed or enabled.

Sources:
- https://huggingface.co/OwenElliott/image-safety-classifier-xs
- https://huggingface.co/OwenElliott/image-safety-classifier-xs/tree/main/onnx
- https://huggingface.co/onnx-community/vit-base-violence-detection-ONNX
- https://huggingface.co/khasinski/siglip2-moderation-heads
- https://huggingface.co/Stealthbox/stealthbox-onnx-models
- https://onnxruntime.ai/docs/tutorials/web/deploy.html

## What the prototype does

1. "goreDetector.ts" implements a conservative, optional gore score
   classifier for three validated classes. The class-zero NSFL score can
   produce a provisional flag; 0.5 is **NOT** a calibrated policy threshold.
2. "violenceDetector.ts" defines a separate binary violence detector
   interface for evaluation but ships **no vetted general-violence model**.
   "localViolenceCandidate.ts" provides a separate, opt-in **raw-logit probe**
   using the 86.8 MB quantized ViT and its specified [-1,1] normalization.
   It intentionally does not map logits to a safety verdict while the class
   ordering remains unverified, and is never called by public tools.
3. "localGoreCandidate.ts" loads an ONNX WASM runtime and 13.1 MB ONNX
   model from **this site's own origin only**, verifies the model's SHA-256,
   creates a 224 x 224 float32 RGB/NCHW tensor, and runs inference inside
   the browser. Zero image data is POSTed or stored. No CDN URLs appear in
   the runtime. The JS model loader is not invoked by either public tool.
4. The optional "scripts/prepare-gore-assets.mjs" downloads **only model
   weights and runtime code on the developer or CI machine**. With
   "--include-violence" it also downloads and SHA256-verifies the optional
   ViT quantized ONNX research weights. The model
   SHA256 and the ONNX Runtime 1.24.3 NPM tarball SHA512 are checked before
   files are written under "public/experimental-gore/". Generated binaries
   are git-ignored; a site build without prepared assets has no gore model.
5. The existing policy stays "adult-only-v1". Policy results remain
   "allow", "block", or "unverified". The gore detector is never active by
   accident or because its module has been imported.
6. Unit tests use **synthetic predictions only**, and separately test the
   CHW tensor layout. The opt-in browser benchmark uses only a synthesized
   colored canvas. No illicit or disturbing test images are needed.

## Reproducing research benchmark

    npm ci
    node scripts/benchmark-moderation-candidates.mjs
    node scripts/prepare-gore-assets.mjs --include-violence
    npx playwright install --with-deps chromium
    RUN_GORE_BENCHMARK=1 RUN_VIOLENCE_BENCHMARK=1 npx playwright test --config playwright.gore.config.ts

The last command runs locally in Chromium and prints p50/p95 warm-inference
latency for **both actual ONNX candidates** on the same synthetic canvas
and each model's cold setup time. This is *hardware-specific*, *not a dataset accuracy benchmark*,
and does not establish iPhone Safari performance. It also checks that
browser model/runtime requests stay same-origin and that no media POSTs
occur. The experimental GitHub Actions workflow runs the same probe.

### Recorded first benchmark — GitHub Actions, Ubuntu 24.04 / Chromium

Source: [experimental workflow #45047036160](https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/45047036160).
This is ONE candidate on a synthetic still image (5 measured inferences after
1 warmup), not a cross-model accuracy comparison or mobile-device test.

| Measurement | Observed result |
| --- | ---: |
| Candidate ONNX model bytes (SHA-256 verified) | 13,137,569 |
| Model+runtime cold setup | 817 ms |
| Inference median / p50 | 76.8 ms |
| Inference p95 | 83.4 ms |
| Inference mean | 77.84 ms |
| Model outcome on synthetic safe fixture | allow |
| Actual image uploads | none |

### Two-candidate measured benchmark — same GitHub Linux/Chromium runner

Source: [experimental workflow #45047345543](https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/45047345543).
Both models passed real browser-side inference (each: 1 warmup + 5 timed
passes of the **same synthetic, safe canvas**). No photos were uploaded.
Model artifacts were downloaded only by CI and verified by pinned hashes.

| Metric | Owen XS, NSFL/gore | ViT INT8, general violence probe |
| --- | ---: | ---: |
| Verified ONNX bytes | 13,137,569 | 86,803,109 |
| Cold model/runtime setup | 893 ms | 2,270 ms |
| Inference p50 | 84.8 ms | 748.7 ms |
| Inference p95 | 90.0 ms | 845.9 ms |
| Inference mean | 85.48 ms | 760.08 ms |
| Output policy meaning | Provisional NSFL score only | **Raw logits only — class mapping unverified** |
| Enforcement status | Disabled | Disabled |

The ViT candidate was roughly **9× slower** in this small, single-host
comparison, with more than six times the model download size. This does
not establish device-independent performance, iPhone viability, real
precision/recall, or legal/ethical suitability. No assertion about either
model's safety accuracy follows from a synthetic test.

Caution: running a sequential 100–300 image batch involves more than multiplying
this inference-only benchmark by the photo count. Load time, decoding, the
existing NSFWJS screen, memory pressure and iOS Safari performance differ.
No reliable violence/gore recall or false-positive rate has been measured.

Generated binaries must **not** be checked into Git or automatically
downloaded by ordinary users. Run tests first, review model attribution and
security, and record real-device benchmarks before considering deployment.

## Release gates still outstanding

- Validate operator support on iPhone Safari, memory use, cold start,
  p50/p95, and repeated 100–300 image batches.
- Measure separate recall/precision/false-positive rates for gore and
  *non-graphic violence* on legally obtained, vetted and representative
  datasets, including legitimate artistic, documentary and medical cases.
- Determine calibrated thresholds and a contextual review policy.
- Independently validate the quantized ViT **general violence** candidate,
  establish its missing class-label mapping, or select a more suitable model.
- Validate model dataset licensing, data provenance, and the right to
  redistribute all binary assets; retain MIT/Apache notices as applicable.
- Handle animation frames or explicitly exclude formats with unreviewed
  frames; do not claim every frame was classified.
- Integrate into both image-processing tools only after sign-off; require
  all newly mandatory detectors to pass, and treat unavailable/failed models
  as "unverified". No bypass button.
- Keep user photos out of uploads, telemetry, logs, and third-party APIs.
- Coordinate stacked PR B with PR A and existing independent PR #33 to
  prevent policy/UI conflicts. Do not merge any PR automatically.
