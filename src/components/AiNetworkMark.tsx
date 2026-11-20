import React from "react";

/** Lightweight version of the owner's original connected-node chatbot mark. */
export function AiNetworkMark({ large = false }: { large?: boolean }) {
  return (
    <span className={large ? "ai-network-mark ai-network-mark-large" : "ai-network-mark"} aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false">
        <g className="ai-network-orbit">
          <g className="ai-network-links" fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="M16 21 29 13 45 22 49 38 35 49 20 44 12 33 16 21Z" />
            <path d="M16 21 35 29 45 22M12 33 35 29 49 38M20 44 35 29 35 49M29 13 35 29" />
          </g>
          <g className="ai-network-nodes" fill="currentColor">
            <circle cx="16" cy="21" r="3" />
            <circle cx="29" cy="13" r="2.7" />
            <circle cx="45" cy="22" r="3.1" />
            <circle cx="49" cy="38" r="2.7" />
            <circle cx="35" cy="49" r="3" />
            <circle cx="20" cy="44" r="2.6" />
            <circle cx="12" cy="33" r="2.8" />
            <circle cx="35" cy="29" r="3.4" />
          </g>
        </g>
      </svg>
    </span>
  );
}
