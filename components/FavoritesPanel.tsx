"use client";
import type { SavedFavorite } from "@/types";

interface Props {
  favorites: SavedFavorite[];
  onRemove: (spotId: string) => void;
}

function accessibilityBadge(fav: SavedFavorite) {
  if (fav.van_accessible) return { text: "🚐 Van Accessible", color: "#4ade80", bg: "rgba(74,222,128,0.12)" };
  if (fav.wheelchair === "yes") return { text: "♿ Accessible", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" };
  if (fav.wheelchair === "limited") return { text: "♿ Limited", color: "#fb923c", bg: "rgba(251,146,60,0.12)" };
  return null;
}

export default function FavoritesPanel({ favorites, onRemove }: Props) {
  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-8 text-center py-16 h-full">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          ♡
        </div>
        <p className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>No saved spots</p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          Tap the heart icon on any spot to save it here for quick access.
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      <p className="px-5 py-2 text-xs" style={{ color: "var(--text-3)" }}>
        {favorites.length} saved spot{favorites.length !== 1 ? "s" : ""}
      </p>
      {favorites.map((fav) => {
        const badge = accessibilityBadge(fav);
        const reportFlagged = (fav.report_flags ?? 0) >= 3;

        return (
          <div
            key={fav.spot_id}
            className="mx-4 my-2 rounded-xl p-4 animate-fade-up"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                  {fav.spot_name}
                </p>
                {fav.address && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                    {fav.address}
                  </p>
                )}
              </div>
              <button
                onClick={() => onRemove(fav.spot_id)}
                className="flex-shrink-0 transition-all"
                style={{ color: "#f87171" }}
                title="Remove from saved"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {badge && (
                <span
                  className="px-2 py-0.5 rounded-md text-xs font-medium"
                  style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}30` }}
                >
                  {badge.text}
                </span>
              )}
              {fav.parking_type && (
                <span
                  className="px-2 py-0.5 rounded-md text-xs"
                  style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
                >
                  {fav.parking_type}
                </span>
              )}
              {fav.opening_hours && (
                <span
                  className="px-2 py-0.5 rounded-md text-xs"
                  style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
                >
                  {fav.opening_hours === "24/7" ? "Open 24/7" : fav.opening_hours.slice(0, 16)}
                </span>
              )}
            </div>

            {/* Report warning */}
            {reportFlagged && (
              <div
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}
              >
                ⚠️ Accessibility complaints reported since saved
              </div>
            )}

            {/* Saved date */}
            <p className="text-xs mt-2" style={{ color: "var(--text-3)" }}>
              Saved {new Date(fav.saved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
