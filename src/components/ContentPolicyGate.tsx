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
        <span>I confirm I have the right to process these files, that they comply with the prohibited-content rules, and that I have read and agree to the Terms of Service.</span>
      </label>
      <p className="compressor-note">
        Active on-device screening checks some adult imagery in supported image inputs.
        Experimental violence and gore models are not enabled. Document contents,
        later animation frames, exploitation, threats, hate, consent, copyright, and
        legality are not reliably verified. This checkbox is acknowledgment, not clearance.
      </p>
    </div>
  );
}
