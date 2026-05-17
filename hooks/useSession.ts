"use client";
import { useState, useEffect } from "react";

export function useSession(): string {
  const [id, setId] = useState("");

  useEffect(() => {
    let stored = localStorage.getItem("accessmap_session");
    if (!stored) {
      stored = crypto.randomUUID();
      localStorage.setItem("accessmap_session", stored);
    }
    setId(stored);
  }, []);

  return id;
}
