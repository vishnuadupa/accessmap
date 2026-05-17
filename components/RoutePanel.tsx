"use client";
import type { RouteResult, ParkingSpot } from "@/types";

interface Props {
  route: RouteResult | null;
  loading: boolean;
  error: string | null;
  spot: ParkingSpot;
  onClose: () => void;
}

const SURFACE_COLORS: Record<string, string> = {
  paved: "#4ade80",
  asphalt: "#4ade80",
  concrete: "#4ade80",
  cobblestone: "#fb923c",
  gravel: "#fb923c",
  unpaved: "#f87171",
  dirt: "#f87171",
  grass: "#f87171",
  sand: "#f87171",
};

function surfaceColor(label: string) {
  return SURFACE_COLORS[label.toLowerCase()] ?? "#6b7280";
}

function suitabilityLabel(score: number | null) {
  if (score === null) return { text: "Unknown", color: "#6b7280" };
  if (score >= 2.5) return { text: "Excellent", color: "#4ade80" };
  if (score >= 1.8) return { text: "Good", color: "#86efac" };
  if (score >= 1.0) return { text: "Moderate", color: "#fb923c" };
  return { text: "Difficult", color: "#f87171" };
}

function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function RoutePanel({ route, loading, error, spot, onClose }: Props) {
  const distance = route?.distance_m ?? 0;
  const duration = route?.duration_s ?? 0;

  return (
    <div
      className="mx-4 mt-3 mb-1 rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ color: "var(--accent)" }}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
            Route to {spot.name}
          </span>
        </div>
        <button onClick={onClose} style={{ color: "var(--text-3)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 px-4 py-4">
          <div
            className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Calculating accessible route…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-4 py-4">
          <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
        </div>
      )}

      {/* Route details */}
      {route && !loading && (
        <div className="px-4 py-3 space-y-3">
          {/* Steps warning */}
          {route.has_steps && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}
            >
              ⚠️ Route includes steps — may not be fully accessible
            </div>
          )}

          {/* Warnings from ORS */}
          {route.warnings?.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)", color: "#fb923c" }}
            >
              ⚠️ {w}
            </div>
          ))}

          {/* Stats row */}
          <div className="flex gap-4">
            <div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Duration</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text)" }}>
                {formatDuration(duration)}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Distance</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text)" }}>
                {formatDistance(distance)}
              </p>
            </div>
            {route.suitability_score !== null && (
              <div>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Suitability</p>
                <p
                  className="text-sm font-semibold mt-0.5"
                  style={{ color: suitabilityLabel(route.suitability_score).color }}
                >
                  {suitabilityLabel(route.suitability_score).text}
                </p>
              </div>
            )}
          </div>

          {/* Suitability score bar */}
          {route.suitability_score !== null && (
            <div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--surface-2)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(((route.suitability_score ?? 0) / 3) * 100)}%`,
                    background: suitabilityLabel(route.suitability_score).color,
                  }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                Wheelchair suitability {Math.round(((route.suitability_score ?? 0) / 3) * 100)}%
              </p>
            </div>
          )}

          {/* Surface breakdown */}
          {route.surface_summary && route.surface_summary.length > 0 && (
            <div>
              <p className="text-xs mb-1.5" style={{ color: "var(--text-3)" }}>Surface breakdown</p>
              <div className="flex flex-wrap gap-1.5">
                {route.surface_summary.map((seg) => (
                  <span
                    key={seg.label}
                    className="px-2 py-0.5 rounded text-xs"
                    style={{
                      background: `${surfaceColor(seg.label)}18`,
                      color: surfaceColor(seg.label),
                      border: `1px solid ${surfaceColor(seg.label)}30`,
                    }}
                  >
                    {seg.label} {Math.round(seg.percent)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
