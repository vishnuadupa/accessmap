"use client";
import { useState, useEffect, useCallback, useMemo, type ComponentType } from "react";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import type {
  ParkingSpot,
  SearchResponse,
  IsochroneResult,
  SavedFavorite,
} from "@/types";
import type { Props as MapViewProps } from "./MapView";
import SearchBar from "./SearchBar";
import SpotList from "./SpotList";
import ReportModal from "./ReportModal";
import FavoritesPanel from "./FavoritesPanel";

const MapLoading = () => (
  <div className="flex-1 flex items-center justify-center" style={{ background: "#0c0c0c", width: "100%", height: "100%" }}>
    <div className="text-center">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      <p className="text-xs" style={{ color: "var(--text-3)" }}>Loading map…</p>
    </div>
  </div>
);

type Tab = "search" | "favorites";

export default function AppShell() {
  const sessionId = useSession();

  // Lazy-load MapView manually to avoid Turbopack dynamic-import CSS chunk hang
  const [MapView, setMapView] = useState<ComponentType<MapViewProps> | null>(null);
  useEffect(() => {
    import("./MapView").then((m) => setMapView(() => m.default));
  }, []);

  // Search state
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selection
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Quick filters (client-side)
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  // Isochrone
  const [isochrone, setIsochrone] = useState<IsochroneResult | null>(null);
  const [isochroneLoading, setIsochroneLoading] = useState(false);

  // Favorites
  const [favorites, setFavorites] = useState<SavedFavorite[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // History + tab
  const [history, setHistory] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("search");

  // Community report breakdown for selected spot
  const [spotCommunity, setSpotCommunity] = useState<Record<string, number> | null>(null);

  // Report modal
  const [reportSpot, setReportSpot] = useState<ParkingSpot | null>(null);

  // Load history + favorites on mount
  useEffect(() => {
    if (sessionId === null) return;
    api.history(sessionId)
      .then((d) => setHistory(d.queries))
      .catch(() => {});
    api.favorites(sessionId)
      .then((d) => {
        setFavorites(d.favorites);
        setFavoriteIds(new Set(d.favorites.map((f) => f.spot_id)));
      })
      .catch(() => {});
  }, [sessionId]);

  // Get user location once
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    );
  }, []);

  const handleSearch = useCallback(async (query: string, coords?: { lat: number; lon: number }) => {
    if (sessionId === null || !query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSelectedSpot(null);
    setIsochrone(null);
    setActiveFilters(new Set());
    setTab("search");
    try {
      const result = await api.search(query, sessionId, coords);
      setSearchResult(result);
      setHistory((prev) => [query, ...prev.filter((q) => q !== query)].slice(0, 10));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [sessionId]);

  const handleNearMe = useCallback(() => {
    if (userLocation) {
      handleSearch("accessible parking near me", { lat: userLocation[0], lon: userLocation[1] });
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        handleSearch("accessible parking near me", coords);
      },
      () => setSearchError("Location access denied. Enable location in your browser and try again."),
      { timeout: 8000 }
    );
  }, [userLocation, handleSearch]);

  const handleSpotSelect = useCallback((spot: ParkingSpot) => {
    setSelectedSpot((prev) => {
      const toggled = prev?.osm_id === spot.osm_id ? null : spot;
      if (toggled) {
        setSpotCommunity(null);
        api.spotDetail(toggled.osm_id)
          .then((d) => setSpotCommunity(d.community))
          .catch(() => {});
      } else {
        setSpotCommunity(null);
      }
      return toggled;
    });
  }, []);

  const handleGetRoute = useCallback((spot: ParkingSpot) => {
    const [lon, lat] = spot.loc.coordinates;
    let url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
    if (userLocation) url += `&origin=${userLocation[0]},${userLocation[1]}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [userLocation]);

  const handleToggleFavorite = useCallback(async (spot: ParkingSpot) => {
    if (sessionId === null) return;
    const isFav = favoriteIds.has(spot.osm_id);
    // Optimistic update
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      isFav ? next.delete(spot.osm_id) : next.add(spot.osm_id);
      return next;
    });
    try {
      if (isFav) {
        await api.removeFavorite(sessionId, spot.osm_id);
        setFavorites((prev) => prev.filter((f) => f.spot_id !== spot.osm_id));
      } else {
        await api.saveFavorite(sessionId, spot);
        // Re-fetch favorites to get enriched snapshot
        const updated = await api.favorites(sessionId);
        setFavorites(updated.favorites);
      }
    } catch {
      // Revert
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        isFav ? next.add(spot.osm_id) : next.delete(spot.osm_id);
        return next;
      });
    }
  }, [sessionId, favoriteIds]);

  const handleShowIsochrone = useCallback(async () => {
    if (!searchResult?.geocoded) return;
    setIsochroneLoading(true);
    try {
      const dest: [number, number] = [searchResult.geocoded.lat, searchResult.geocoded.lon];
      const result = await api.isochrone(dest, 5);
      setIsochrone((prev) => prev ? null : result); // toggle
    } catch { /* silent */ }
    finally { setIsochroneLoading(false); }
  }, [searchResult]);

  const spots = searchResult?.spots ?? [];

  const displaySpots = useMemo(() => {
    if (activeFilters.size === 0) return spots;
    return spots.filter((s) => {
      if (activeFilters.has("free") && s.fee !== false) return false;
      if (activeFilters.has("van") && s.van_accessible !== true) return false;
      if (activeFilters.has("covered") && s.covered !== true) return false;
      if (activeFilters.has("verified") && !s.verified_at && !s.check_date_wheelchair) return false;
      return true;
    });
  }, [spots, activeFilters]);

  const toggleFilter = useCallback((f: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });
  }, []);

  const geocoded = searchResult?.geocoded ?? null;
  const mapCenter: [number, number] = selectedSpot
    ? [selectedSpot.loc.coordinates[1], selectedSpot.loc.coordinates[0]]
    : geocoded
    ? [geocoded.lat, geocoded.lon]
    : [40.7128, -74.006]; // NYC default

  return (
    <section
      id="app"
      className="flex"
      style={{ height: "100vh", background: "var(--bg)" }}
    >
      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{
          width: 380,
          borderRight: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        {/* Panel header */}
        <div
          className="flex-shrink-0 px-5 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs tracking-[0.3em] uppercase" style={{ color: "var(--text-3)" }}>
              AccessMap
            </span>
            <div className="flex gap-1">
              {(["search", "favorites"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: tab === t ? "var(--surface-2)" : "transparent",
                    color: tab === t ? "var(--text)" : "var(--text-3)",
                    border: tab === t ? "1px solid var(--border)" : "1px solid transparent",
                  }}
                >
                  {t === "search" ? "Search" : `Saved (${favorites.length})`}
                </button>
              ))}
            </div>
          </div>
          {tab === "search" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <SearchBar
                  onSearch={handleSearch}
                  loading={searching}
                  history={history}
                />
              </div>
              <button
                onClick={handleNearMe}
                disabled={searching}
                title="Search near my location"
                className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-all"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-2, #2e2e2e)",
                  color: userLocation ? "var(--accent)" : "var(--text-3)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                  <circle cx="12" cy="12" r="8" strokeDasharray="2 3"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Warnings */}
        {searchResult?.fallback_used && (
          <div
            className="flex-shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)", color: "var(--warning)" }}
          >
            ⚠️ No confirmed accessible spots found — showing all nearby parking. Accessibility unverified.
          </div>
        )}
        {searchResult?.geocoded?.confidence !== null &&
          (searchResult?.geocoded?.confidence ?? 1) < 0.5 && (
          <div
            className="flex-shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)", color: "var(--warning)" }}
          >
            📍 Location may be approximate — try a more specific address.
          </div>
        )}
        {searchError && (
          <div
            className="flex-shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--danger)" }}
          >
            {searchError}
          </div>
        )}

        {/* Narration */}
        {searchResult?.narration && !searching && (
          <div className="flex-shrink-0 px-5 pt-3 pb-1">
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
              {searchResult.narration}
            </p>
          </div>
        )}

        {/* Quick filters — shown when there are results */}
        {spots.length > 0 && !searching && (() => {
          const filters = [
            { key: "van", label: "🚐 Van", count: spots.filter(s => s.van_accessible === true).length },
            { key: "free", label: "Free", count: spots.filter(s => s.fee === false).length },
            { key: "covered", label: "Covered", count: spots.filter(s => s.covered === true).length },
            { key: "verified", label: "Verified", count: spots.filter(s => !!s.verified_at || !!s.check_date_wheelchair).length },
          ].filter(f => f.count > 0);
          if (filters.length === 0) return null;
          return (
            <div className="flex-shrink-0 px-4 py-2 flex flex-wrap gap-1.5">
              {filters.map(({ key, label, count }) => {
                const active = activeFilters.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleFilter(key)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all"
                    style={{
                      background: active ? "rgba(74,222,128,0.15)" : "var(--surface)",
                      color: active ? "#4ade80" : "var(--text-3)",
                      border: `1px solid ${active ? "rgba(74,222,128,0.4)" : "var(--border)"}`,
                    }}
                  >
                    {label}
                    <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
              {activeFilters.size > 0 && (
                <button
                  onClick={() => setActiveFilters(new Set())}
                  className="px-2.5 py-1 rounded-lg text-xs transition-all"
                  style={{ color: "var(--text-3)", border: "1px solid var(--border)" }}
                >
                  Clear
                </button>
              )}
            </div>
          );
        })()}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "search" ? (
            <>
              {/* Spot list */}
              {!searching && (
                <SpotList
                  spots={displaySpots}
                  selectedSpot={selectedSpot}
                  favoriteIds={favoriteIds}
                  spotCommunity={spotCommunity}
                  onSelect={handleSpotSelect}
                  onRoute={handleGetRoute}
                  onFavorite={handleToggleFavorite}
                  onReport={(spot) => setReportSpot(spot)}
                />
              )}

              {/* Loading skeletons */}
              {searching && (
                <div className="px-4 py-3 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton rounded-xl h-28" />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!searching && !searchResult && (
                <div className="flex flex-col items-center justify-center h-full px-8 text-center py-16">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    ♿
                  </div>
                  <p className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
                    Find accessible parking
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
                    Try &quot;wheelchair parking near Central Park&quot; or &quot;van accessible spot near UCSF&quot;
                  </p>
                </div>
              )}
            </>
          ) : (
            <FavoritesPanel
              favorites={favorites}
              onRemove={async (spotId) => {
                if (sessionId === null) return;
                await api.removeFavorite(sessionId, spotId);
                setFavorites((prev) => prev.filter((f) => f.spot_id !== spotId));
                setFavoriteIds((prev) => { const n = new Set(prev); n.delete(spotId); return n; });
              }}
            />
          )}
        </div>

        {/* Footer */}
        {spots.length > 0 && tab === "search" && (
          <div
            className="flex-shrink-0 px-5 py-3 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {displaySpots.length !== spots.length
                ? `${displaySpots.length} of ${spots.length} spots`
                : `${spots.length} spot${spots.length !== 1 ? "s" : ""} found`}
            </span>
            <button
              onClick={handleShowIsochrone}
              disabled={isochroneLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all"
              style={{
                background: isochrone ? "rgba(74,222,128,0.15)" : "var(--surface)",
                color: isochrone ? "var(--accent)" : "var(--text-2)",
                border: `1px solid ${isochrone ? "rgba(74,222,128,0.3)" : "var(--border)"}`,
              }}
            >
              {isochroneLoading ? (
                <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
                </svg>
              )}
              {isochrone ? "Hide 5min reach" : "Show 5min reach"}
            </button>
          </div>
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative" style={{ height: "100vh" }}>
        {MapView ? (
          <MapView
            center={mapCenter}
            zoom={selectedSpot ? 17 : geocoded ? 15 : 12}
            spots={displaySpots}
            selectedSpot={selectedSpot}
            route={null}
            isochrone={isochrone}
            userLocation={userLocation}
            onSpotClick={handleSpotSelect}
          />
        ) : (
          <MapLoading />
        )}
      </div>

      {/* ── Report modal ─────────────────────────────────────────────────── */}
      {reportSpot && (
        <ReportModal
          spot={reportSpot}
          sessionId={sessionId}
          onClose={() => setReportSpot(null)}
        />
      )}
    </section>
  );
}
