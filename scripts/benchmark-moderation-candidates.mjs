/**
 * Source-derived model footprint comparison, NOT a performance or accuracy
 * benchmark. Actual runtime testing is in tests/experimental/.
 */
const models = [
  {
    candidate: "OwenElliott/image-safety-classifier-xs",
    task: "NSFL (gore), not general violence",
    license: "MIT + SwiftFormer Apache notice",
    approximateOnnxMB: 13.1,
    validatedOnThisSite: false,
    risk: "NSFL underrepresented; metrics are author-reported, not independently validated",
    url: "https://huggingface.co/OwenElliott/image-safety-classifier-xs",
  },
  {
    candidate: "onnx-community/vit-base-violence-detection-ONNX",
    task: "general violent/non-violent scenes (not gore-specific)",
    license: "Apache-2.0 (upstream model card)",
    approximateOnnxMB: 86.8, // int8/quantized file; fp32 is 343 MB
    validatedOnThisSite: false,
    risk: "ViT size/latency likely unsuitable for 100+ photo batches on iPhone",
    url: "https://huggingface.co/onnx-community/vit-base-violence-detection-ONNX",
  },
  {
    candidate: "khasinski/siglip2-moderation-heads",
    task: "violence classification head",
    license: "Apache-2.0",
    approximateOnnxMB: 0.789, // head only; 400M-param encoder REQUIRED
    validatedOnThisSite: false,
    risk: "Reported head size excludes ~400M-parameter SigLIP2 image encoder",
    url: "https://huggingface.co/khasinski/siglip2-moderation-heads",
  },
  {
    candidate: "Stealthbox/stealthbox-onnx-models",
    task: "separate gore and violence binaries",
    license: "GPL, obligations require review",
    approximateOnnxMB: null,
    validatedOnThisSite: false,
    risk: "No adequate independent quality or licensing review",
    url: "https://huggingface.co/Stealthbox/stealthbox-onnx-models",
  },
];
console.log("Research-only ONNX model footprint comparison; not measured inference performance:");
console.table(models.map(({ candidate, task, license, approximateOnnxMB, risk }) => ({
  candidate, task, license, approximateOnnxMB: approximateOnnxMB ?? "unknown", risk,
})));
if (process.argv.includes("--json")) console.log(JSON.stringify(models, null, 2));
