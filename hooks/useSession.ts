"use client";
import { useState, useEffect } from "react";

// Returns null while hydrating (server), then the UUID string once mounted.
// Callers should gate on `sessionId !== null` before making API calls.
// We intentionally set state here to trigger a re-render with the session ID
export function useSession(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    let newId;
    try {
      newId = localStorage.getItem("accessmap_session");
      if (!newId) {
        newId = crypto.randomUUID();
        localStorage.setItem("accessmap_session", newId);
      }
    } catch {
      // Private-browsing localStorage may throw — fall back to a session-only UUID
      newId = crypto.randomUUID();
    }

    // Disable the rule here because we must set the ID to trigger client-side hydration correctly
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(newId);
  }, []);

  return id;
}
