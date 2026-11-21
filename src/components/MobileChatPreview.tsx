import React from "react";
import { useEffect, useRef, useState } from "react";
import { AiNetworkMark } from "./AiNetworkMark";
import { Icon } from "./Icon";

const questions = [
  "Show me Sergei's projects",
  "What's his experience?",
  "What technologies does he use?",
  "Tell me more about Sergei",
];

export function MobileChatPreview({
  onClose,
}: {
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const showPreview = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setQuestion(next);
    setDraft("");
  };

  return (
    <section
      id="mobile-ai-panel"
      className="mobile-chat-preview"
      role="dialog"
      aria-label="Ask AI UI preview"
      aria-modal="false"
    >
      <div className="mobile-sheet-handle" aria-hidden="true" />
      <header className="mobile-sheet-header">
        <AiNetworkMark large />
        <div className="mobile-sheet-title">
          <h2>Ask AI</h2>
          <p>Your portfolio assistant</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="icon-button mobile-sheet-close"
          aria-label="Close chat"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="mobile-sheet-content">
        {!question ? (
          <>
            <div className="mobile-preview-intro">
              <AiNetworkMark large />
              <h3>Hi! I'm Sergei's AI assistant.</h3>
              <p>I can help you explore his projects, experience, skills, and more.</p>
            </div>
            <div className="mobile-preview-suggestions">
              {questions.map((text) => (
                <button type="button" key={text} onClick={() => showPreview(text)}>
                  {text}
                  <Icon name="arrow" size={16} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mobile-preview-conversation" role="status">
            <p className="mobile-preview-question">{question}</p>
            <p className="mobile-preview-answer">
              UI preview only. The live AI connection is unchanged; responses will appear here when the assistant is enabled.
            </p>
            <button className="mobile-preview-reset" type="button" onClick={() => setQuestion("")}>
              Back to suggested questions
            </button>
          </div>
        )}
      </div>
      <form className="mobile-preview-composer" onSubmit={(e) => {
        e.preventDefault();
        showPreview(draft);
      }}>
        <label htmlFor="mobile-ai-preview-input" className="sr-only">Preview a question</label>
        <input
          id="mobile-ai-preview-input"
          type="text"
          value={draft}
          maxLength={300}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question…"
        />
        <button type="submit" aria-label="Preview question" disabled={!draft.trim()}>
          <Icon name="send" size={19} />
        </button>
      </form>
      <p className="mobile-preview-note">Design preview — no AI requests are sent.</p>
    </section>
  );
}
