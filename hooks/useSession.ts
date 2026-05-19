"use client";
import { useState, useEffect } from "react";

// Returns null while hydrating (server), then the UUID string once mounted.
// Callers should gate on `sessionId !== null` before making API calls.
export function useSession(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    // Avoid calling setState synchronously inside an effect if possible, but here we only do it once on mount.
    // Wrap it in a timeout or just disable the rule for this specific use case,
    // as it's the standard way to handle client-side hydration for localStorage.
    try {
      let stored = localStorage.getItem("accessmap_session");
      if (!stored) {
        stored = crypto.randomUUID();
        localStorage.setItem("accessmap_session", stored);
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setId(stored);
    } catch {
      // Private-browsing localStorage may throw — fall back to a session-only UUID

      setId(crypto.randomUUID());
    }
  }, []);

  return id;
}
