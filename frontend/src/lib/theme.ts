import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

function read(): ThemePref {
  try {
    const stored = localStorage.getItem("tf_theme");
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyStoredTheme() {
  document.documentElement.dataset.theme = resolve(read());
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolve(read()));

  useEffect(() => {
    const apply = () => {
      const next = resolve(pref);
      document.documentElement.dataset.theme = next;
      setResolved(next);
    };
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [pref]);

  const set = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem("tf_theme", next);
    } catch {
      /* storage unavailable */
    }
    setPref(next);
  }, []);

  const toggle = useCallback(() => set(resolve(pref) === "dark" ? "light" : "dark"), [pref, set]);

  return { pref, resolved, set, toggle };
}
