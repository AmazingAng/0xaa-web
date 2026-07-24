"use client";

import { useCallback, useEffect, useState } from "react";
import FableGate, { type FableGateLanguage } from "./FableGate";
import FableHome from "./FableHome";

const FABLE_GATE_CLEARED_KEY = "0xaa:fable-gate-cleared";
const LANGUAGE_KEY = "0xaa:lang";

export default function FableExperience() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [language, setLanguage] = useState<FableGateLanguage>("zh");

  // Restore the cleared gate and the shared language preference after
  // hydration; storage is unavailable during SSR.
  useEffect(() => {
    try {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
      if (savedLanguage === "zh" || savedLanguage === "en") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring persisted state after hydration, not a derived-state anti-pattern
        setLanguage(savedLanguage);
      }
    } catch {
      // localStorage unavailable — keep the default language.
    }
    try {
      if (window.sessionStorage.getItem(FABLE_GATE_CLEARED_KEY) === "1") {
        setIsUnlocked(true);
      }
    } catch {
      // sessionStorage unavailable — replay the gate.
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
    if (!isUnlocked) return;
    let revealFrame: number | null = null;
    const mountFrame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => setIsRevealed(true));
    });
    return () => {
      window.cancelAnimationFrame(mountFrame);
      if (revealFrame !== null) window.cancelAnimationFrame(revealFrame);
    };
  }, [isUnlocked]);

  const unlock = useCallback(() => {
    try {
      window.sessionStorage.setItem(FABLE_GATE_CLEARED_KEY, "1");
    } catch {
      // Ignore write failures — the gate will just replay next visit.
    }
    setIsRevealed(false);
    setIsUnlocked(true);
  }, []);

  if (!isUnlocked) {
    return <FableGate onComplete={unlock} language={language} onLanguageChange={setLanguage} />;
  }

  return <FableHome language={language} onLanguageChange={setLanguage} isRevealed={isRevealed} />;
}
