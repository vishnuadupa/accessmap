"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { ParkingSpot } from "@/types";

interface Props {
  spot: ParkingSpot;
  sessionId: string | null;
  onClose: () => void;
}

type Status =
  | "confirmed_ok"
  | "not_accessible"
  | "blocked"
  | "damaged"
  | "still_accessible"
  | "no_longer_accessible";

const STATUS_OPTIONS: { value: Status; label: string; description: string; color: string; icon: string }[] = [
  {
    value: "confirmed_ok",
    label: "Confirmed accessible",
    description: "I used this spot — it's fully accessible",
    color: "#4ade80",
    icon: "✓",
  },
  {
    value: "still_accessible",
    label: "Still accessible",
    description: "Spot is still in the condition described",
    color: "#86efac",
    icon: "♿",
  },
  {
    value: "blocked",
    label: "Blocked",
    description: "Space is blocked or occupied by a non-accessible vehicle",
    color: "#fb923c",
    icon: "🚧",
  },
  {
    value: "damaged",
    label: "Damaged",
    description: "Ramp, surface, or signage is damaged",
    color: "#fb923c",
    icon: "⚠️",
  },
  {
    value: "no_longer_accessible",
    label: "No longer accessible",
    description: "Spot no longer meets accessibility standards",
    color: "#f87171",
    icon: "✗",
  },
  {
    value: "not_accessible",
    label: "Never accessible",
    description: "This spot was never actually accessible",
    color: "#f87171",
    icon: "✗",
  },
];

export default function ReportModal({ spot, sessionId, onClose }: Props) {
  const [selected, setSelected] = useState<Status | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!selected || !sessionId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.report(sessionId, spot.osm_id, selected, note.trim() || undefined);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "var(--bg)", border: "1px solid var(--border-2, #2e2e2e)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Report Spot</p>
            <p className="text-xs mt-0.5 truncate max-w-[220px]" style={{ color: "var(--text-3)" }}>{spot.name}</p>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-3)" }} aria-label="Close report modal" title="Close">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl"
              style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)" }}
            >
              ✓
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: "var(--text)" }}>Thanks for your report</p>
            <p className="text-xs mb-5" style={{ color: "var(--text-3)" }}>
              Community reports help everyone find accessible parking.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent)", color: "#0c0c0c" }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs" style={{ color: "var(--text-3)" }}>What did you find?</p>

            {/* Status options */}
            <div className="space-y-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelected(opt.value)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    background: selected === opt.value ? `${opt.color}12` : "var(--surface)",
                    border: `1px solid ${selected === opt.value ? `${opt.color}40` : "var(--border)"}`,
                  }}
                  aria-pressed={selected === opt.value}
                >
                  <span className="text-sm mt-0.5 flex-shrink-0">{opt.icon}</span>
                  <div className="min-w-0">
                    <p
                      className="text-xs font-medium"
                      style={{ color: selected === opt.value ? opt.color : "var(--text)" }}
                    >
                      {opt.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Note */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional: add details (e.g. ramp broken, sign missing…)"
              rows={2}
              className="w-full text-xs rounded-lg px-3 py-2 resize-none outline-none"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />

            {error && (
              <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!selected || submitting}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: selected ? "var(--accent)" : "var(--surface-2)",
                color: selected ? "#0c0c0c" : "var(--text-3)",
                cursor: selected ? "pointer" : "not-allowed",
              }}
            >
              {submitting ? "Submitting…" : "Submit Report"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
