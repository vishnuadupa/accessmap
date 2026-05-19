"use client";
import type { ParkingSpot } from "@/types";

interface Props {
  spot: ParkingSpot;
  selected: boolean;
  isFavorite: boolean;
  community: Record<string, number> | null;
  onSelect: () => void;
  onRoute: () => void;
  onFavorite: () => void;
  onReport: () => void;
}

function verificationInfo(spot: ParkingSpot) {
  const d = spot.verified_at
    ?? (spot.check_date_wheelchair ? new Date(spot.check_date_wheelchair) : null);
  if (d) {
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (days < 30) return { label: `Verified ${days}d ago`, color: "#4ade80" };
    if (days < 180) return { label: `Verified ${Math.floor(days / 30)}mo ago`, color: "#fb923c" };
    return { label: `Last verified ${Math.floor(days / 30)}mo ago`, color: "#f87171" };
  }
  // Distinguish: has OSM accessibility tags (but no recent ground-truth) vs completely untagged
  const hasTag = spot.wheelchair === "yes" || spot.wheelchair === "limited"
    || spot.van_accessible === true
    || (spot.capacity_disabled !== null && spot.capacity_disabled > 0);
  if (hasTag) return { label: "OSM tagged · unverified", color: "#fb923c" };
  return { label: "No accessibility data", color: "#555" };
}

function parkingTypeLabel(type: ParkingSpot["parking_type"]) {
  const map: Record<string, { icon: string; label: string }> = {
    "surface": { icon: "🅿️", label: "Surface lot" },
    "multi-storey": { icon: "🏗️", label: "Multi-storey" },
    "underground": { icon: "🏢", label: "Underground" },
    "rooftop": { icon: "🌤️", label: "Rooftop" },
    "street_side": { icon: "🛣️", label: "Street side" },
    "other": { icon: "🅿️", label: "Parking" },
  };
  return type ? map[type] ?? null : null;
}

const COMMUNITY_LABELS: Record<string, { label: string; color: string }> = {
  confirmed_ok: { label: "Confirmed accessible", color: "#4ade80" },
  still_accessible: { label: "Still accessible", color: "#86efac" },
  blocked: { label: "Reported blocked", color: "#fb923c" },
  damaged: { label: "Reported damaged", color: "#fb923c" },
  no_longer_accessible: { label: "No longer accessible", color: "#f87171" },
  not_accessible: { label: "Never accessible", color: "#f87171" },
};

export default function SpotCard({
  spot, selected, isFavorite, community, onSelect, onRoute, onFavorite, onReport,
}: Props) {
  const verification = verificationInfo(spot);
  const parkingType = parkingTypeLabel(spot.parking_type);
  const hasHeightWarning = spot.height && spot.parking_type === "underground";
  const distanceLabel = spot.distance_m !== undefined
    ? spot.distance_m < 1000
      ? `${spot.distance_m}m`
      : `${(spot.distance_m / 1000).toFixed(1)}km`
    : null;

  return (
    <div
      onClick={onSelect}
      className="mx-4 my-2 rounded-xl cursor-pointer transition-all duration-200 animate-fade-up"
      style={{
        background: selected ? "var(--surface-2)" : "var(--surface)",
        border: `1px solid ${selected ? "rgba(74,222,128,0.3)" : "var(--border)"}`,
        boxShadow: selected ? "0 0 0 1px rgba(74,222,128,0.2)" : "none",
      }}
    >
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold truncate"
              style={{ color: "var(--text)" }}
            >
              {spot.name}
            </p>
            {spot.address && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                {spot.address}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {distanceLabel && (
              <span className="text-xs" style={{ color: "var(--text-3)" }}>{distanceLabel}</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onFavorite(); }}
              className="transition-all"
              style={{ color: isFavorite ? "#f87171" : "var(--text-3)" }}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={isFavorite}
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {/* Van accessible — hero badge */}
          {spot.van_accessible === true && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
              style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}
            >
              🚐 Van Accessible
            </span>
          )}
          {spot.van_accessible === false && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
              style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
            >
              Standard accessible
            </span>
          )}

          {/* Wheelchair status */}
          {spot.wheelchair === "yes" && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}
            >
              ♿ Accessible
            </span>
          )}
          {spot.wheelchair === "limited" && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{ background: "rgba(251,146,60,0.1)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.2)" }}
            >
              ♿ Limited access
            </span>
          )}

          {/* Ramp */}
          {spot.ramp_wheelchair === true && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}
            >
              Ramp ✓
            </span>
          )}

          {/* Parking type */}
          {parkingType && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{
                background: spot.parking_type === "underground" ? "rgba(251,146,60,0.1)" : "var(--surface-2)",
                color: spot.parking_type === "underground" ? "#fb923c" : "var(--text-3)",
                border: `1px solid ${spot.parking_type === "underground" ? "rgba(251,146,60,0.2)" : "var(--border)"}`,
              }}
            >
              {parkingType.icon} {parkingType.label}
            </span>
          )}

          {/* Fee */}
          {spot.fee === false && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}
            >
              Free
            </span>
          )}
          {spot.fee === true && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
            >
              Paid
            </span>
          )}

          {/* Covered */}
          {spot.covered === true && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
            >
              Covered
            </span>
          )}

          {/* Lit */}
          {spot.lit === true && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
            >
              Lit
            </span>
          )}

          {/* Accessible spaces count */}
          {spot.capacity_disabled !== null && spot.capacity_disabled > 0 && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{ background: "rgba(74,222,128,0.08)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}
            >
              {spot.capacity_disabled} accessible space{spot.capacity_disabled !== 1 ? "s" : ""}
            </span>
          )}

          {/* Level */}
          {spot.level && (
            <span
              className="px-2 py-0.5 rounded-md text-xs"
              style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
            >
              Level {spot.level}
            </span>
          )}
        </div>

        {/* Height warning */}
        {hasHeightWarning && (
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg mb-3 text-xs"
            style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)", color: "#fb923c" }}
          >
            ⚠️ Height limit: {spot.height} — verify van clearance before entry
          </div>
        )}

        {/* Report flags warning */}
        {spot.report_flags >= 3 && (
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg mb-3 text-xs"
            style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}
          >
            ⚠️ Recent accessibility complaints reported
          </div>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: verification.color }}
            />
            <span className="text-xs" style={{ color: verification.color }}>
              {verification.label}
            </span>
            {spot.opening_hours && (
              <span className="text-xs" style={{ color: "var(--text-3)" }}>
                · {spot.opening_hours === "24/7" ? "Open 24/7" : spot.opening_hours.slice(0, 20)}
              </span>
            )}
          </div>

          {spot.maxstay && (
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              ⏱ {spot.maxstay}
            </span>
          )}
        </div>
      </div>

      {/* Community report breakdown (30-day) */}
      {selected && community && Object.keys(community).length > 0 && (
        <div
          className="px-4 pb-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs mb-2" style={{ color: "var(--text-3)" }}>Community reports (30 days)</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(community).map(([status, count]) => {
              const meta = COMMUNITY_LABELS[status];
              if (!meta || count === 0) return null;
              return (
                <span
                  key={status}
                  className="px-2 py-0.5 rounded-md text-xs"
                  style={{ background: `${meta.color}12`, color: meta.color, border: `1px solid ${meta.color}30` }}
                >
                  {meta.label} ×{count}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Expanded actions */}
      {selected && (
        <div
          className="flex gap-2 px-4 pb-4"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onRoute}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "var(--accent)", color: "#0c0c0c" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#86efac")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
          >
            Get Route
          </button>
          <button
            onClick={onReport}
            className="py-2 px-3 rounded-lg text-sm transition-all"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(248,113,113,0.4)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            Report
          </button>
        </div>
      )}
    </div>
  );
}
