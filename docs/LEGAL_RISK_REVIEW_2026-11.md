# Preliminary legal-risk review: 2026-11-22

This is a **technical and policy gap review**, not an attorney opinion or a finding of compliance. Scope: the US-focused public portfolio, its Google/Supabase sign-in, local image tools and optionally enabled owner-hosted AI assistant. Specific legal applicability depends on the operator's location, business model, service audience and any marketing/monitoring in other jurisdictions.

## Verified in repository

- Images and document conversions run locally in the browser; the checked-in code does not POST source images or results to a moderation service. Supported image inputs are screened using the active NSFWJS adult-only policy.
- Additional ONNX gore / general-violence adapters are experimental, not active safety controls.
- Content policy acknowledgment is required per selected batch by the user interface, but is client-side and bypassable. It now references assent to Terms as well as file-rights confirmation.
- Sign-in (when enabled) uses Google + Supabase, with local browser session persistence. The Privacy Policy includes account identifiers and the relevant service providers.
- Optional AI question text is **not** processed locally in the browser. The same-origin Vercel endpoint can forward a request over ngrok to a developer-operated Flask/Ollama backend. This is distinct from image privacy. Client chat history is held in memory, with the backend accepting individual messages. Runtime/vendor logging settings were not verified from source code.
- The contact form prepares a mail draft locally, rather than POSTing a form to the portfolio server.

## Primary-source-driven risk questions

| Area | Current finding | Remaining owner/qualified-adviser verification |
| --- | --- | --- |
| FTC truth in privacy promises | Public notice now distinguishes optional AI chat text transmission from local image processing. | Inspect actual Vercel, Supabase, ngrok and Flask runtime logs/retention and ensure there are no unexpected analytics or telemetry scripts. |
| US children under 13 (COPPA) | General-audience, not child-directed statement added. | Confirm actual audience, whether any users under 13 are known, and establish age handling/parental consent if applicable. **A Terms statement does not implement age verification or satisfy COPPA by itself.** |
| GDPR | Mere EU website accessibility is not sufficient alone for Art. 3(2); EU targeting or monitoring can trigger obligations. | Determine whether the owner is established in the EU, intentionally targets EU individuals or monitors behavior there. If in scope, add purpose-by-purpose legal bases, data subject rights, international transfers, retention criteria, processors and other mandatory Art. 13 details and implement operational rights fulfillment. |
| California CCPA/CPRA | Not automatically applicable to every small portfolio; statutory business thresholds and coverage must be checked. | Confirm revenue, data volume, sale/share of personal data and California nexus. Do not claim coverage or exemption without facts. |
| Account deletion | Contact route exists; public policy says there is no inactivity-based auto-deletion schedule. | Verify actual Supabase Auth + profile deletion workflow, ID verification and provider retention, and implement deletion requests before claiming operational completeness. |
| Incident response | Public terms provide reporting email and warn against emailing suspected illicit files. | Establish internal workflow for account breaches and misuse. Review applicable notification laws if an incident occurs; hosting/processing model changes may create new reporting duties. |
| Contract formation | Tool checkbox explicitly acknowledges Terms, but is a browser-only interaction. | Confirm current terms are adequately linked/displayed, notice is accessible, and consent mechanism is appropriate for intended jurisdictions; preserve acceptance records only if needed and disclosed. |
| Security and safety | Local model is fallible and bypassable; Terms accurately disclose limits. | Do not enable experimental gore/violence or add uploads without independent validation, licensing and safeguards. |

## Official sources (reviewed November 22, 2026)

- [FTC privacy and security guidance](https://www.ftc.gov/business-guidance/privacy-security/consumer-privacy)
- [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [EDPB GDPR territorial scope guidance](https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf)
- [EDPB guidance to small businesses on legal bases](https://www.edpb.europa.eu/topics/key-gdpr-concepts/legal-basis_en)
- [California Privacy Protection Agency FAQ](https://cppa.ca.gov/faq)
- [FTC breach response](https://www.ftc.gov/business-guidance/resources/data-breach-response-guide-business)
- [18 USC §2258A](https://www.law.cornell.edu/uscode/text/18/2258A) — statutory reporting duties depend on the actual provider and circumstances
- [ngrok data/security details](https://ngrok.com/security)

This checklist does not certify the website for every jurisdiction; professional advice remains appropriate if serving regulated users, operating internationally or adding user-generated content hosting.
