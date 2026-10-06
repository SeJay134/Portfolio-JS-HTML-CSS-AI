import { useCallback, useEffect, useRef, useState } from "react";
import { readPreference, savePreference } from "../lib/preferences";

export type Theme = "system" | "light" | "dark";
export function normalizeTheme(value: string | null): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#0c141d" : "#f8f9fb");
}

export function useTheme() {
  // Keep the initial render deterministic for prerendered HTML hydration.
  const [theme, setTheme] = useState<Theme>("system");
  const current = useRef<Theme>("system");
  const update = useCallback((value: string | null) => {
    const next = normalizeTheme(value);
    current.current = next;
    setTheme(next);
    applyTheme(next);
  }, []);
  useEffect(() => {
    update(readPreference("portfolio-theme", "system"));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => applyTheme(current.current);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "portfolio-theme" || event.key === null) {
        update(event.key === null ? null : event.newValue);
      }
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [update]);
  const selectTheme = useCallback(
    (value: string) => {
      const next = normalizeTheme(value);
      savePreference("portfolio-theme", next);
      update(next);
    },
    [update],
  );
  return { theme, selectTheme };
}
