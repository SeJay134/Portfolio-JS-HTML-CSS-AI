/** Chat header status, separate from the message-level error explanation. */
export type RequestPhase =
  | "idle"
  | "generating"
  | "unavailable"
  | "rate-limited"
  | "timed-out"
  | "request-failed";

export type AssistantStatus =
  | "checking"
  | "online"
  | "offline"
  | Exclude<RequestPhase, "idle">;

export interface AssistantState {
  readiness: "checking" | "online" | "offline";
  request: RequestPhase;
  previousRequest: Exclude<RequestPhase, "generating">;
  requestSettled: boolean;
  previousSettled: boolean;
}

export type AssistantEvent =
  | { type: "check" }
  | { type: "ready"; ready: boolean }
  | { type: "request-start" }
  | { type: "request-success" }
  | { type: "request-failure"; status: Exclude<RequestPhase, "idle" | "generating"> }
  | { type: "request-cancelled" };

export const initialAssistantState: AssistantState = {
  readiness: "checking",
  request: "idle",
  previousRequest: "idle",
  requestSettled: false,
  previousSettled: false,
};

export function assistantStatusReducer(
  state: AssistantState,
  event: AssistantEvent,
): AssistantState {
  switch (event.type) {
    case "check":
      // On re-opening, start a fresh readiness check unless a request is
      // already running. Do not leave an old failure label displayed forever.
      return {
        ...state,
        readiness: "checking",
        request: state.request === "generating" ? "generating" : "idle",
        requestSettled: false,
      };
    case "ready":
      // A /ready response arriving after a completed /chat must never change
      // the more recent result (success or failure).
      return state.requestSettled
        ? state
        : { ...state, readiness: event.ready ? "online" : "offline" };
    case "request-start":
      if (state.request === "generating") return state;
      return {
        ...state,
        previousRequest: state.request,
        previousSettled: state.requestSettled,
        request: "generating",
        requestSettled: false,
      };
    case "request-success":
      return {
        ...state,
        readiness: "online",
        request: "idle",
        previousRequest: "idle",
        requestSettled: true,
        previousSettled: true,
      };
    case "request-failure":
      return {
        ...state,
        request: event.status,
        requestSettled: true,
      };
    case "request-cancelled":
      // The visitor pressing Stop does not mean the assistant went offline.
      return {
        ...state,
        request: state.previousRequest,
        requestSettled: state.previousSettled,
      };
  }
}

export function assistantStatus(state: AssistantState): AssistantStatus {
  return state.request === "idle" ? state.readiness : state.request;
}

export const ASSISTANT_STATUS_LABELS: Record<AssistantStatus, string> = {
  checking: "Checking assistant…",
  online: "Assistant online",
  offline: "Assistant offline",
  generating: "Generating answer…",
  unavailable: "Assistant temporarily unavailable",
  "rate-limited": "Assistant rate limited",
  "timed-out": "Assistant request timed out",
  "request-failed": "Assistant request failed",
};

/** Distinguish a rate limit, a temporary outage, a bad request and a timeout. */
export function requestFailureStatus(error: unknown, timedOut: boolean):
  | "cancelled"
  | Exclude<RequestPhase, "idle" | "generating"> {
  if (timedOut) return "timed-out";
  if (typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError") return "cancelled";
  // ApiError adds a numeric HTTP status; plain network errors have none.
  const code =
    typeof error === "object" && error !== null && "status" in error
    && typeof error.status === "number" ? error.status : 0;
  if (code === 429) return "rate-limited";
  if (code >= 400 && code < 500) return "request-failed";
  return "unavailable";
}
