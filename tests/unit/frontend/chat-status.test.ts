import { describe, expect, it } from "vitest";
import { ApiError } from "../../../src/lib/api";
import {
  ASSISTANT_STATUS_LABELS,
  assistantStatus,
  assistantStatusReducer,
  initialAssistantState,
  requestFailureStatus,
  type AssistantEvent,
} from "../../../src/lib/chatStatus";

const run = (...events: AssistantEvent[]) =>
  events.reduce(assistantStatusReducer, initialAssistantState);

describe("assistant header state machine", () => {
  it("reports readiness and generating separately", () => {
    expect(assistantStatus(initialAssistantState)).toBe("checking");
    expect(assistantStatus(run({ type: "ready", ready: true }))).toBe("online");
    expect(assistantStatus(run({ type: "ready", ready: false }))).toBe("offline");
    expect(assistantStatus(run(
      { type: "ready", ready: true },
      { type: "request-start" },
    ))).toBe("generating");
  });

  it("never displays online after chat returned 503, even if /ready completes late", () => {
    const state = run(
      { type: "request-start" },
      { type: "request-failure", status: "unavailable" },
      { type: "ready", ready: true },
    );
    expect(assistantStatus(state)).toBe("unavailable");
    expect(ASSISTANT_STATUS_LABELS[assistantStatus(state)]).toBe(
      "Assistant temporarily unavailable",
    );
  });

  it("ignores a stale offline readiness response after a successful answer", () => {
    const state = run(
      { type: "request-start" },
      { type: "request-success" },
      { type: "ready", ready: false },
    );
    expect(assistantStatus(state)).toBe("online");
  });

  it("returns to online on successful Retry after 503", () => {
    const state = run(
      { type: "ready", ready: true },
      { type: "request-start" },
      { type: "request-failure", status: "unavailable" },
      { type: "request-start" },
      { type: "request-success" },
    );
    expect(assistantStatus(state)).toBe("online");
  });

  it("keeps separate rate-limit and timeout states", () => {
    for (const status of ["rate-limited", "timed-out"] as const) {
      const state = run(
        { type: "ready", ready: true },
        { type: "request-start" },
        { type: "request-failure", status },
      );
      expect(assistantStatus(state)).toBe(status);
    }
  });

  it("pressing Stop does not incorrectly mark a reachable assistant offline", () => {
    const state = run(
      { type: "ready", ready: true },
      { type: "request-start" },
      { type: "request-cancelled" },
    );
    expect(assistantStatus(state)).toBe("online");
  });

  it("preserves prior error on cancelling a retry", () => {
    const state = run(
      { type: "request-start" },
      { type: "request-failure", status: "unavailable" },
      { type: "request-start" },
      { type: "request-cancelled" },
    );
    expect(assistantStatus(state)).toBe("unavailable");
  });

  it("rechecks on opening without keeping an old failure label", () => {
    const state = run(
      { type: "request-start" },
      { type: "request-failure", status: "unavailable" },
      { type: "check" },
      { type: "ready", ready: true },
    );
    expect(assistantStatus(state)).toBe("online");
  });
});

describe("request failure classification", () => {
  it("maps 429 to rate-limited and 503 or network outage to unavailable", () => {
    expect(requestFailureStatus(new ApiError("limited", 429), false)).toBe("rate-limited");
    expect(requestFailureStatus(new ApiError("down", 503), false)).toBe("unavailable");
    expect(requestFailureStatus(new TypeError("network"), false)).toBe("unavailable");
  });

  it("does not mistake validation errors, timeout or Stop for server downtime", () => {
    expect(requestFailureStatus(new ApiError("bad request", 400), false)).toBe("request-failed");
    expect(requestFailureStatus(new DOMException("aborted", "AbortError"), true)).toBe("timed-out");
    expect(requestFailureStatus(new DOMException("aborted", "AbortError"), false)).toBe("cancelled");
  });
});
