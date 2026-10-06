import React from "react";
import { containModalFocus } from "../lib/dialog";
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export const sections = [
  ["Home", "Home"],
  ["Projects", "Projects"],
  ["Skills", "Skills"],
  ["Experience", "Experience"],
  ["About", "About"],
  ["Connect", "Contact"],
] as const;

export type SectionId = (typeof sections)[number][0];

export function Drawer({
  open,
  onClose,
  onNavigate,
  active,
}: {
  open: boolean;
  onClose: (reason: "dismiss" | "navigate") => void;
  onNavigate: (id: SectionId) => void;
  active: SectionId;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function navigate(
    id: SectionId,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) {
    event.preventDefault();
    onNavigate(id);
    onClose("navigate");
  }
  return (
    <dialog
      ref={ref}
      id="navigation-drawer"
      onKeyDown={containModalFocus}
      className="drawer"
      aria-labelledby="navigation-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose("dismiss");
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose("dismiss");
      }}
    >
      <div className="drawer-panel">
        <div className="drawer-top">
        <a href="#Home" className="wordmark" onClick={(event) => navigate("Home", event)}>
          SP<span>.</span>
        </a>
        <button
          className="icon-button"
          aria-label="Close menu"
          onClick={() => onClose("dismiss")}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="eyebrow" id="navigation-title">
        Explore the portfolio
      </p>
      <nav aria-label="Main navigation">
        <ol className="drawer-links">
          {sections.map(([id, label], i) => (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={active === id ? "location" : undefined}
                onClick={(event) => navigate(id, event)}
              >
                <span className="nav-number">0{i + 1}</span>
                {label}
                <Icon name="arrow" />
              </a>
            </li>
          ))}
        </ol>
      </nav>
        <div className="drawer-bottom">
          <p>Software. Data. Possibilities.</p>
          <a href="https://github.com/SeJay134" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <a
            href="https://www.linkedin.com/in/sergei_patrushev"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn ↗
          </a>
        </div>
      </div>
    </dialog>
  );
}
