import { useCallback, useEffect, useState } from "react";

/** "system" follows the operating system's light/dark setting. */
export type ThemeChoice = "system" | "light" | "dark";

// Also read by the inline script in index.html, which applies the choice before the first paint.
const STORAGE_KEY = "dutchpoint-theme";
const ORDER: ThemeChoice[] = ["system", "light", "dark"];

function savedChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** The viewer's light/dark choice, applied as `data-theme` on <html> and remembered in this browser. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(savedChoice);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }
    try {
      if (theme === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, theme);
      }
    } catch {
      // Storage can be blocked (private windows, site data off); the choice then lasts for this visit.
    }
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
  }, []);

  return { theme, cycle };
}
