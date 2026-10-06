import React from "react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
export function Contact() {
  const [draft, setDraft] = useState<{ href: string; body: string } | null>(
    null,
  );
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "failed"
  >("idle");
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    message?: string;
  }>({});
  const draftVersion = useRef(0);
  const manualCopy = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (copyState === "failed") {
      manualCopy.current?.focus();
      manualCopy.current?.select();
    }
  }, [copyState]);
  return (
    <section id="Connect" tabIndex={-1} className="section contact-section">
      <span id="leave_message" className="legacy-anchor" />
      <span id="messages" className="legacy-anchor" />
      <div>
        <p className="eyebrow">05 / Let's connect</p>
        <h2>
          Have something
          <br />
          in mind?
        </h2>
        <p>
          I'd like to hear about your project,
          <br />
          your team, or a problem worth solving.
        </p>
        <a className="contact-email" href="mailto:patrushev.s.job@gmail.com">
          patrushev.s.job@gmail.com <Icon name="arrow" />
        </a>
        <div className="socials">
          <a
            href="https://www.linkedin.com/in/sergei_patrushev"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn ↗
          </a>
          <a
            href="https://github.com/SeJay134"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </div>
      </div>
      <form
        className="contact-form"
        noValidate
        onChange={(event) => {
          draftVersion.current++;
          setDraft(null);
          setCopyState("idle");
          const target = event.target;
          const field =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement
              ? target.name
              : "";
          setErrors((previous) => ({ ...previous, [field]: undefined }));
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const name = String(form.get("name")).trim(),
            email = String(form.get("email")).trim(),
            message = String(form.get("message")).trim();
          const emailField = e.currentTarget.elements.namedItem(
            "email",
          ) as HTMLInputElement;
          const emailValid = Boolean(email) && emailField.checkValidity();
          const nextErrors = {
            name: name ? undefined : "Enter your name, not just spaces.",
            email: emailValid ? undefined : "Enter a valid email address.",
            message: message ? undefined : "Enter a message, not just spaces.",
          };
          setErrors(nextErrors);
          if (!name || !emailValid || !message) {
            const fieldName = !name ? "name" : !emailValid ? "email" : "message";
            const field = e.currentTarget.elements.namedItem(fieldName);
            (field as HTMLInputElement | HTMLTextAreaElement)?.focus();
            return;
          }
          draftVersion.current++;
          const body = `${message}\n\nFrom: ${name}\nReply to: ${email}`;
          setDraft({
            href: `mailto:patrushev.s.job@gmail.com?subject=${encodeURIComponent(`Portfolio inquiry from ${name}`)}&body=${encodeURIComponent(body)}`,
            body,
          });
          setCopyState("idle");
        }}
      >
        <label htmlFor="contact-name">Your name</label>
        <input
          aria-invalid={Boolean(errors.name)}
          aria-describedby={
            errors.name
              ? "contact-name-help contact-name-error"
              : "contact-name-help"
          }
          id="contact-name"
          name="name"
          autoComplete="name"
          required
          maxLength={80}
          placeholder="Alex Taylor"
        />
        <p id="contact-name-help" className="field-help">
          Up to 80 characters.
        </p>
        {errors.name && (
          <p id="contact-name-error" role="alert">
            {errors.name}
          </p>
        )}
        <label htmlFor="contact-email">Email</label>
        <input
          aria-invalid={Boolean(errors.email)}
          aria-describedby={
            errors.email
              ? "contact-email-help contact-email-error"
              : "contact-email-help"
          }
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="alex@example.com"
        />
        <p id="contact-email-help" className="field-help">
          Used only in the email draft. This website does not store it.
        </p>
        {errors.email && (
          <p id="contact-email-error" role="alert">
            {errors.email}
          </p>
        )}
        <label htmlFor="contact-message">
          What would you like to talk about?
        </label>
        <textarea
          aria-invalid={Boolean(errors.message)}
          aria-describedby={
            errors.message
              ? "contact-message-help contact-message-error"
              : "contact-message-help"
          }
          id="contact-message"
          name="message"
          required
          maxLength={2000}
          rows={4}
          placeholder="A project, an opportunity, or just a hello…"
        />
        <p id="contact-message-help" className="field-help">
          Up to 2,000 characters. Nothing is sent until you use your email app.
        </p>
        {errors.message && (
          <p id="contact-message-error" role="alert">
            {errors.message}
          </p>
        )}
        <p className="form-note">
          Prepare an email draft. Nothing is sent or stored by this website.
        </p>
        <button className="button primary" type="submit">
          Prepare email <Icon name="arrow" />
        </button>
        {draft && (
          <div
            className="draft-result"
            role="status"
            aria-busy={copyState === "copying"}
          >
            <p>
              Your draft is ready. Open your email app to review and send it.
            </p>
            <a href={draft.href} className="text-link">
              Open email app ↗
            </a>
            <button
              type="button"
              className="text-button"
              disabled={copyState === "copying"}
              onClick={async () => {
                const version = draftVersion.current;
                setCopyState("copying");
                try {
                  await navigator.clipboard.writeText(draft.body);
                  if (version === draftVersion.current) setCopyState("copied");
                } catch {
                  if (version === draftVersion.current) setCopyState("failed");
                }
              }}
            >
              {copyState === "copied"
                ? "Copied"
                : copyState === "copying"
                  ? "Copying…"
                  : "Copy draft"}
            </button>
            {copyState === "failed" && (
              <div>
                <p role="alert">
                  Automatic copying is unavailable. Select and copy the draft
                  below.
                </p>
                <label htmlFor="manual-draft">Email draft</label>
                <textarea
                  ref={manualCopy}
                  id="manual-draft"
                  readOnly
                  rows={6}
                  value={draft.body}
                />
              </div>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
