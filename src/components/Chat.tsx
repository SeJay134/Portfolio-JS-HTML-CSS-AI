import React from "react";
import { containModalFocus } from "../lib/dialog";
import { useEffect, useRef, useState } from "react";
import { ApiError, readiness, requestAnswer, type Source } from "../lib/api";
import { Icon } from "./Icon";
interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
}
export default function Chat({
  open,
  onClose,
  onOpenMenu,
}: {
  open: boolean;
  onClose: () => void;
  onOpenMenu: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [lastText, setLastText] = useState("");
  const [status, setStatus] = useState("Checking availability…");
  const [unread, setUnread] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const counter = useRef(0),
    nearBottom = useRef(true),
    historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    panel = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    const dialog = panel.current!;
    const media = window.matchMedia("(max-width: 600px)");
    function sync() {
      if (dialog.open) dialog.close();
      if (open) {
        if (media.matches) dialog.showModal();
        else dialog.show();
      }
    }
    sync();
    media.addEventListener("change", sync);
    if (open) inputRef.current?.focus();
    return () => {
      media.removeEventListener("change", sync);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 5000);
    readiness(c.signal)
      .then((ready) =>
        setStatus(ready ? "Assistant online" : "Assistant currently offline"),
      )
      .catch(() => setStatus("Availability could not be checked"))
      .finally(() => clearTimeout(timer));
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [open]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (nearBottom.current && historyRef.current)
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    else if (messages.length) setUnread(true);
  }, [messages, pending]);
  async function send(text: string, retry = false) {
    const clean = text.trim();
    if (!clean || [...clean].length > 300 || busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setLastText(clean);
    if (!retry)
      setMessages((m) => [
        ...m,
        { id: ++counter.current, role: "user", text: clean },
      ]);
    setDraft("");
    const c = new AbortController();
    controller.current = c;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      c.abort();
    }, 50000);
    try {
      const result = await requestAnswer(clean, c.signal);
      if (c.signal.aborted) throw new DOMException("Request aborted", "AbortError");
      setMessages((m) => [
        ...m,
        {
          id: ++counter.current,
          role: "assistant",
          text: result.reply,
          sources: result.sources,
        },
      ]);
      setStatus("Assistant online");
    } catch (e) {
      setDraft(clean);
      setError(
        c.signal.aborted
          ? timedOut
            ? "The request timed out. Your message is saved below."
            : "Request stopped. Your message is saved below."
          : e instanceof ApiError
            ? e.message
            : "Cannot reach the assistant. Your message is saved. You can also use Contact.",
      );
    } finally {
      clearTimeout(timeout);
      controller.current = null;
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <dialog
      ref={panel}
      className="chat-panel"
      onKeyDown={containModalFocus}
      aria-labelledby="chat-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="chat-heading">
        <div className="assistant-mark">
          <Icon name="spark" />
        </div>
        <div>
          <h2 id="chat-title">Ask about Sergei</h2>
          <p>{status}</p>
        </div>
        <button
          className="icon-button chat-menu-button"
          type="button"
          onClick={onOpenMenu}
          aria-label="Menu"
        >
          <Icon name="menu" />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close chat"
        >
          <Icon name="close" />
        </button>
      </header>
      <div
        className="chat-history"
        ref={historyRef}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 64;
          if (nearBottom.current) setUnread(false);
        }}
      >
        {!messages.length && (
          <div className="chat-welcome">
            <p className="eyebrow">A little help exploring</p>
            <h3>
              What would you
              <br />
              like to know?
            </h3>
            <p>
              Ask about projects, skills, or experience. Answers use portfolio
              evidence. Each question is independent.
            </p>
            <div className="suggestions">
              {[
                "What projects has Sergei built?",
                "What is his Python experience?",
                "How can I contact Sergei?",
              ].map((q) => (
                <button key={q} onClick={() => void send(q)}>
                  {q} <Icon name="arrow" size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <span className="message-author">
              {m.role === "user" ? "You" : "Assistant"}
            </span>
            <p>{m.text}</p>
            {m.sources?.length ? (
              <ul className="chat-sources">
                {m.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title} ↗
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {pending && (
          <p className="pending-text" role="status">
            Looking through portfolio evidence…
          </p>
        )}
      </div>
      {unread && (
        <button
          className="text-button"
          onClick={() => {
            historyRef.current?.scrollTo({
              top: historyRef.current.scrollHeight,
            });
            nearBottom.current = true;
            setUnread(false);
          }}
        >
          New response ↓
        </button>
      )}
      {error && (
        <div className="chat-error" role="alert">
          <p>{error}</p>
          <button
            className="text-button"
            disabled={pending}
            onClick={() => void send(lastText, true)}
          >
            Retry
          </button>
          <a href="#Connect" onClick={onClose}>
            Contact
          </a>
        </div>
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <textarea
          ref={inputRef}
          id="chat-input"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about projects or experience…"
          disabled={pending}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <div className="composer-actions">
          <span>{[...draft].length}/300</span>
          {pending ? (
            <button
              type="button"
              className="button small"
              key="stop"
              onClick={(e) => { e.preventDefault(); controller.current?.abort(); }}
            >
              Stop
            </button>
          ) : (
            <button
              key="send"
              type="submit"
              className="button small primary"
              disabled={!draft.trim() || [...draft].length > 300}
            >
              Send <Icon name="send" size={16} />
            </button>
          )}
        </div>
      </form>
      <div className="chat-footnote">
        <span>AI can make mistakes. Verify important details.</span>
        <button
          className="text-button"
          disabled={pending}
          onClick={() => {
            setMessages([]);
            setDraft("");
            setError("");
            setLastText("");
          }}
        >
          Clear chat
        </button>
      </div>
    </dialog>
  );
}
