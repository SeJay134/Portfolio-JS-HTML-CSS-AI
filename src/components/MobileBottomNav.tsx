import React from "react";
import type { Ref } from "react";
import type { SectionId } from "./Drawer";
import { Icon } from "./Icon";
import { AiNetworkMark } from "./AiNetworkMark";

const destinations = [
  { id: "Projects", label: "Work", icon: "work" },
  { id: "Experience", label: "Experience", icon: "experience" },
  { id: "About", label: "About", icon: "user" },
  { id: "Connect", label: "Contact", icon: "mail" },
] as const;

export function MobileBottomNav({
  active,
  chatOpen,
  onToggleChat,
  onNavigate,
  chatButtonRef,
}: {
  active: SectionId;
  chatOpen: boolean;
  onToggleChat: () => void;
  onNavigate: () => void;
  chatButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {destinations.map(({ id, label, icon }) => {
        const selected = !chatOpen && (active === id || (id === "Projects" && (
          active === "Home" || active === "Skills"
        )));
        return (
          <a
            key={id}
            href={`#${id}`}
            className={selected ? "mobile-tab is-active" : "mobile-tab"}
            aria-current={selected ? "location" : undefined}
            onClick={onNavigate}
          >
            <Icon name={icon} size={23} />
            <span>{label}</span>
          </a>
        );
      })}
      <button
        ref={chatButtonRef}
        type="button"
        className={chatOpen ? "mobile-tab mobile-ai-tab is-active" : "mobile-tab mobile-ai-tab"}
        aria-label="Ask AI"
        aria-expanded={chatOpen}
        aria-controls="mobile-ai-panel"
        onClick={onToggleChat}
      >
        <AiNetworkMark />
        <span>Ask AI</span>
      </button>
    </nav>
  );
}
