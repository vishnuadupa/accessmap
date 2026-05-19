"use client";
import { useState, useEffect } from "react";

// Returns null while hydrating (server), then the UUID string once mounted.
// Callers should gate on `sessionId !== null` before making API calls.
export function useSession(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    // Wrap in setTimeout to avoid synchronous setState during hydration
    const timer = setTimeout(() => {
      try {
        let stored = localStorage.getItem("accessmap_session");
        if (!stored) {
          stored = crypto.randomUUID();
          localStorage.setItem("accessmap_session", stored);
        }
        setId(stored);
      } catch {
        // Private-browsing localStorage may throw — fall back to a session-only UUID
        setId(crypto.randomUUID());
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return id;
}
