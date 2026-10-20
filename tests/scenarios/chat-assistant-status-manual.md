# Manual acceptance: assistant status after API failures

Scope: issue #5, `fix/chat-assistant-status-machine`. Test **before merge**.
The public production chat is normally disabled; use the local Vite build with the chat flag.

## Launch

From a clean checkout of the review branch, run `npm ci`, then in PowerShell:

```powershell
$env:VITE_ENABLE_CHAT_UI = "true"
npm run dev
```

Open `http://127.0.0.1:5001` in Chrome, Firefox or Edge.
No Flask server, Ollama, FAISS data or credentials are needed for this mock test.

## Simulate readiness, failures and recovery

Open DevTools (**F12**), Console, and paste this snippet **before opening the assistant**.
It intercepts only this tab's `/ready` and `/chat` calls.
It does not change source files or send requests to a real AI backend.

```js
(() => {
  const realFetch = window.fetch.bind(window);
  const outcomes = [503, 200, 429, 200];
  let position = 0;
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : String(input.url ?? input);
    if (url.endsWith("/ready")) {
      return new Response(JSON.stringify({ status: "ready" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/chat")) {
      const code = outcomes[Math.min(position++, outcomes.length - 1)];
      return new Response(JSON.stringify(
        code === 200
          ? { reply: "Mock answer: recovered successfully.", sources: [] }
          : { error: "Mock API failure" },
      ), { status: code, headers: { "Content-Type": "application/json" } });
    }
    return realFetch(input, init);
  };
  window.restoreChatFetch = () => { window.fetch = realFetch; };
  console.log("Chat mock enabled: ready 200; chat 503, 200, 429, 200.");
})();
```

1. Open **Ask about me**. The header must say **Assistant online**.
2. Send a question. First `/chat` returns mock 503. The header must switch to **Assistant temporarily unavailable**, the error alert must appear, and **Assistant online** must not remain visible.
3. Press **Retry**. A mock 200 arrives. The message must display, and the header must return to **Assistant online**.
4. Send a second question. Mock 429: header **Assistant rate limited**, alert contains "Too many requests". Never label this as offline.
5. Press **Retry** again. Mock 200: header **Assistant online**, reply appears.
6. Close and reopen the assistant. The header rechecks readiness and returns to **Assistant online**.
7. Test both 390px and desktop widths; dialogs, keyboard focus, send and close controls remain usable.

To restore normal network calls, run `window.restoreChatFetch()` in this tab's Console (or reload the page).
The mock is **development-only** and must not be installed in production.

## Evidence

Record browser and version, device width, pass/fail of each step,
any console exceptions, and a screenshot of the 503 status.
Do not approve merge if the status contradicts the error or Retry cannot recover.

The automated suite additionally checks late `/ready` responses,
timeout classification, user cancellation and network failures.
A live Ollama/production API integration is outside this manual mock scenario.
