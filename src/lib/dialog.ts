import type { KeyboardEvent } from 'react';

/** Keep keyboard focus inside a modal, including the last-to-first Tab boundary. */
export function containModalFocus(event: KeyboardEvent<HTMLDialogElement>) {
  const dialog = event.currentTarget;
  if (event.key !== 'Tab' || !dialog.matches(':modal')) return;
  const elements = Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
  )).filter(element => element.getClientRects().length > 0);
  const first = elements[0], last = elements.at(-1);
  if (!first || !last) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}
