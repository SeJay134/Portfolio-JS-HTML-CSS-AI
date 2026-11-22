import React from "react";

type Props = {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * User-facing acceptable-content policy. This is a consent/awareness gate, not
 * an automated detector and never a substitute for server-side enforcement.
 * Photos remain on the visitor's device.
 */
export function ContentPolicyGate({ id, checked, disabled = false, onChange }: Props) {
  return (
    <div className="content-policy-gate">
      <p className="compressor-note">
        Prohibited: child sexual exploitation material, intimate images without consent,
        graphic abuse or glorification of violence, credible threats, terrorist recruitment,
        hate-based incitement, unlawful privacy violations, and files you have no right
        to process. See the <a href="/terms/#prohibited-content">content rules</a>.
      </p>
      <label htmlFor={id} className="content-policy-confirmation">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span>I confirm I have the right to process these files and that they do not contain prohibited material.</span>
      </label>
      <p className="compressor-note">
        Current automated screening detects some adult imagery only. It does not reliably
        detect violence, child exploitation, threats, hate, copyright infringement, or
        whether a file is legal. This confirmation is not verification or a legal clearance.
      </p>
    </div>
  );
}
