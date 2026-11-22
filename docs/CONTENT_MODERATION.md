# Prohibited content and image safety — implementation notes

This portfolio currently offers browser-only Photo Compressor and File Converter tools. They do **not** accept user-image uploads to the site, store user images, or publish user galleries. Google account sign-in, where enabled, does not make local image processing server-side.

## Content policy

Both tools require an explicit checkbox for each newly selected batch. The acceptance is **not persisted**, and it is reset when the visitor selects new files or changes the input format.

The public [Terms of Service](/terms/#prohibited-content) prohibit:
- Child sexual exploitation and abuse material (CSAM).
- Nonconsensual intimate imagery and sexual exploitation.
- Graphic abuse or glorification of extreme violence, credible threats and incitement.
- Terrorist recruitment, extremist recruitment and hate-based incitement.
- Unlawful exposure of private information, intellectual-property infringements and content the user cannot lawfully process.
- Anything otherwise prohibited by laws applicable to the user or service.

Policy restrictions are not assertions that every depiction of violence, historical symbols, or copyrighted objects is illegal. Context and jurisdiction matter. Country-specific rules need local legal review.

## What technology actually enforces

| Control | Current status | Scope and limitation |
| --- | --- | --- |
| Adult imagery | **Active, automated, best effort** | Shared local moderation engine (`adult-only-v1`) runs NSFWJS on decoded still images in supported image paths. Unverified results fail closed. No guarantees; false positives/negatives and client bypass remain possible. |
| Unsupported/oversized inputs | **Enforced locally** | Rejected by existing MIME, size and dimension checks. |
| Content acknowledgment | **Required by UI** | A checkbox gates batch processing but cannot detect content and can be bypassed by modified client code. |
| Gore and general violence | **Experimental only; not active** | Local ONNX research candidates and synthetic browser inference benchmarks exist (PR B). They are not loaded by the production tools or required by `adult-only-v1`; detection accuracy, model license/provenance, iPhone performance, and thresholds are not validated for enforcement. See [research results](VIOLENCE_GORE_RESEARCH.md). |
| Hate symbols, terrorist propaganda, threats, child exploitation, nonconsensual content, copyright, location-specific illegality | **Not automatically detected** | Requires specialized safeguards or evidence of context, consent, rights and applicable jurisdiction. Ordinary image classification cannot establish these facts. |
| File converter document contents | **Not scanned for harmful images** | PDFs and Office documents can contain images; no claim of content screening for embedded pictures. |
| Server-side anti-abuse/CSAM reporting | **Not implemented** | No user image hosting, upload endpoint, or server-side content store exists in these tools. |

Do not present the content-policy checkbox as a classifier or as proof of compliance. `screenImage` continues to use the adult-only decision path. Do not describe the research gore/violence ONNX candidates as active controls: benchmark execution on a synthetic image is not validated detection accuracy. Image files and conversion results remain on-device; only ordinary website/model asset requests reach the hosting server.

## If uploads, publication, or sharing are added later

1. Decide **where images are hosted and which jurisdictions apply**. Obtain appropriate legal advice before accepting public uploads.
2. Run server-side validation and moderation **before** accepting, publishing, or distributing any media. Define strict fail-closed policies for unavailable required checks. A browser-only filter can be bypassed.
3. Select approved detection/hashing services for known CSAM and other priority harms, and establish a legally reviewed incident/reporting response. Do not collect, email or commit suspected CSAM as test material.
4. Create appeal/manual-review channels and controls for false positives, privacy, lawful educational/journalistic contexts and retention; avoid keeping harmful files longer than legitimately needed.
5. Publish a privacy notice for any third-party moderation or server processing. This is a **change from current on-device privacy expectations** and must not be enabled silently.
6. Rate-limit expensive server-side checks, log access to moderation results safely (not image contents), and establish measurable evaluations with licensed, vetted test datasets.
7. Verify applicable reporting and notice obligations. In the US, 18 U.S.C. §2258A establishes certain reporting requirements for qualifying providers that obtain actual knowledge, but applicability depends on the service and circumstances; get qualified legal review.

Reference sources (checked November 2026):
- [Vercel Acceptable Use Policy](https://vercel.com/legal/acceptable-use-policy)
- [Google Cloud Vision SafeSearch](https://docs.cloud.google.com/vision/docs/detecting-safe-search) (adult/racy/violence etc., sends image content to provider)
- [OpenAI Moderation documentation](https://developers.openai.com/api/docs/guides/moderation) (image-category support differs by category; not universal)
- [18 U.S.C. §2258A](https://uscode.house.gov/us/usc/119-134/t18/s2258A/)

## Acceptance checks

- Before any conversion/compression, action button is disabled until checkbox acceptance.
- A new selection clears acceptance and previously generated download links.
- Each tool links to the exact public prohibited-content section.
- Existing NSFWJS screening remains mandatory for images.
- All local processing continues without image POST uploads.
- Check browser accessibility and mobile viewport.
- Test only with synthetic images and mocked classifier outputs; do not import illicit media fixtures.
