"use client";

import { useCallback, useEffect, useState } from "react";
import FableHome from "./FableHome";
import FableWorld, { type FableWorldLanguage } from "./FableWorld";

const LANGUAGE_KEY = "0xaa:lang";
const MODE_KEY = "0xaa:fable-mode";

type ExperienceMode = "game" | "read";

export default function FableExperience() {
  const [mode, setMode] = useState<ExperienceMode>("game");
  const [language, setLanguage] = useState<FableWorldLanguage>("zh");
  const [isRevealed, setIsRevealed] = useState(false);

  // Restore the shared language preference and the chosen mode after
  // hydration; storage and media queries are unavailable during SSR. Users
  // who prefer reduced motion start in reading mode unless they explicitly
  // chose the game before.
  useEffect(() => {
    let savedMode: string | null = null;
    try {
      savedMode = window.localStorage.getItem(MODE_KEY);
      const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
      if (savedLanguage === "zh" || savedLanguage === "en") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring persisted state after hydration, not a derived-state anti-pattern
        setLanguage(savedLanguage);
      }
    } catch {
      // Storage unavailable — keep defaults.
    }
    if (savedMode === "read" || savedMode === "game") {
      setMode(savedMode);
    } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMode("read");
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    try {
      window.localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Ignore write failures (e.g. storage disabled or full).
    }
  }, [language]);

  useEffect(() => {
    if (mode !== "read") return;
    let revealFrame: number | null = null;
    const mountFrame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => setIsRevealed(true));
    });
    return () => {
      window.cancelAnimationFrame(mountFrame);
      if (revealFrame !== null) window.cancelAnimationFrame(revealFrame);
    };
  }, [mode]);

  const persistMode = useCallback((next: ExperienceMode) => {
    setMode(next);
    setIsRevealed(false);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // Ignore write failures.
    }
  }, []);

  const switchToReading = useCallback(() => persistMode("read"), [persistMode]);
  const switchToGame = useCallback(() => persistMode("game"), [persistMode]);

  if (mode === "game") {
    return (
      <FableWorld language={language} onLanguageChange={setLanguage} onSwitchToReading={switchToReading} />
    );
  }

  return (
    <FableHome
      language={language}
      onLanguageChange={setLanguage}
      isRevealed={isRevealed}
      onEnterGame={switchToGame}
    />
  );
}
