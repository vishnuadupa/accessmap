"use client";
import { useState, useEffect } from "react";

// Returns null while hydrating (server), then the UUID string once mounted.
// Callers should gate on `sessionId !== null` before making API calls.
export function useSession(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  return id;
}
