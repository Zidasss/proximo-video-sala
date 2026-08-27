"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.klipTheme === "light" ? "light" : "dark";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const syncTheme = () => setTheme(currentTheme());
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key === "klip_theme") syncTheme();
    };
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystemTheme = () => {
      let hasStoredTheme = false;
      try {
        hasStoredTheme = Boolean(localStorage.getItem("klip_theme"));
      } catch {
        hasStoredTheme = false;
      }
      if (!hasStoredTheme) {
        const next: Theme = media.matches ? "light" : "dark";
        document.documentElement.dataset.klipTheme = next;
        document.documentElement.style.colorScheme = next;
      }
      syncTheme();
    };

    syncTheme();
    window.addEventListener("klip-theme-change", syncTheme);
    window.addEventListener("storage", syncStoredTheme);
    media.addEventListener("change", syncSystemTheme);
    return () => {
      window.removeEventListener("klip-theme-change", syncTheme);
      window.removeEventListener("storage", syncStoredTheme);
      media.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  const toggle = () => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.klipTheme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem("klip_theme", next);
    } catch {
      // The theme still applies for the current document when storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent("klip-theme-change", { detail: next }));
    setTheme(next);
  };

  const target = theme === "dark" ? "claro" : "escuro";
  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      onClick={toggle}
      data-theme={theme}
      aria-label={`Tema atual ${theme === "dark" ? "escuro" : "claro"}. Usar tema ${target}`}
      title={`Usar tema ${target}`}
    >
      {theme === "dark" ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
    </button>
  );
}
