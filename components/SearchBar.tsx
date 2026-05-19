"use client";
import { useState, useRef, useEffect } from "react";

interface Props {
  onSearch: (query: string) => void;
  loading: boolean;
  history: string[];
}

export default function SearchBar({ onSearch, loading, history }: Props) {
  const [value, setValue] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function submit(q = value) {
    if (!q.trim()) return;
    setValue(q);
    setShowHistory(false);
    onSearch(q.trim());
  }

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-2, #2e2e2e)",
          outline: "none",
        }}
      >
        {loading ? (
          <div
            className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
            aria-hidden="true"
          />
        ) : (
          <svg aria-hidden="true" className="flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ color: "var(--text-3)" }}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
        )}

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); setShowHistory(true); }}
          onFocus={() => setShowHistory(true)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. van accessible near UCSF"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-3)]"
          style={{ color: "var(--text)" }}
          aria-label="Search for parking spots"
        />

        {value && (
          <button
            onClick={() => { setValue(""); inputRef.current?.focus(); }}
            className="flex-shrink-0"
            style={{ color: "var(--text-3)" }}
            aria-label="Clear search"
            title="Clear search"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        <button
          onClick={() => submit()}
          disabled={!value.trim() || loading}
          className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all"
          style={{
            background: value.trim() && !loading ? "var(--accent)" : "transparent",
            color: value.trim() && !loading ? "#0c0c0c" : "var(--text-3)",
            cursor: value.trim() && !loading ? "pointer" : "default",
          }}
          aria-label="Search"
          title="Search"
        >
          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* History dropdown */}
      {showHistory && history.length > 0 && !loading && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-50"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="px-3 py-2 text-xs" style={{ color: "var(--text-3)" }}>Recent searches</p>
          {history.slice(0, 6).map((q) => (
            <button
              key={q}
              onClick={() => submit(q)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-all"
              style={{ color: "var(--text-2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="12 8 12 12 14 14" /><circle cx="12" cy="12" r="10" />
              </svg>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
