"use client";
import { useState, useEffect, useCallback, type ComponentType } from "react";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import type {
  ParkingSpot,
  SearchResponse,
  RouteResult,
  IsochroneResult,
  SavedFavorite,
} from "@/types";
import type { Props as MapViewProps } from "./MapView";
import SearchBar from "./SearchBar";
import SpotList from "./SpotList";
import RoutePanel from "./RoutePanel";
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

  // Selection + route
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

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

  const handleSearch = useCallback(async (query: string) => {
    if (sessionId === null || !query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSelectedSpot(null);
    setRoute(null);
    setIsochrone(null);
    setTab("search");
    try {
      const result = await api.search(query, sessionId);
      setSearchResult(result);
      setHistory((prev) => [query, ...prev.filter((q) => q !== query)].slice(0, 10));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [sessionId]);

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
    setRoute(null);
    setRouteError(null);
  }, []);

  const handleGetRoute = useCallback(async (spot: ParkingSpot) => {
    if (sessionId === null) return;
    const origin = userLocation ?? (
      searchResult?.geocoded
        ? [searchResult.geocoded.lat, searchResult.geocoded.lon] as [number, number]
        : null
    );
    if (!origin) { setRouteError("Enable location or search for an address to get directions."); return; }

    setRouting(true);
    setRouteError(null);
    const dest: [number, number] = [spot.loc.coordinates[1], spot.loc.coordinates[0]];
    try {
      const r = await api.route(origin, dest, spot.osm_id);
      setRoute(r);
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : "Routing failed");
    } finally {
      setRouting(false);
    }
  }, [sessionId, userLocation, searchResult]);

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
                  aria-pressed={tab === t}
                  aria-label={t === "search" ? "Search tab" : `Favorites tab, ${favorites.length} saved`}
                >
                  {t === "search" ? "Search" : `Saved (${favorites.length})`}
                </button>
              ))}
            </div>
          </div>
          {tab === "search" && (
            <SearchBar
              onSearch={handleSearch}
              loading={searching}
              history={history}
            />
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

        {/* Parsed intent chips — show what Gemini understood */}
        {searchResult?.query_parsed && !searching && (
          <div className="flex-shrink-0 px-5 py-2 flex flex-wrap gap-1.5">
            {searchResult.query_parsed.van_mode && (
              <span className="px-2 py-0.5 rounded-md text-[10px]" style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}>
                🚐 Van mode
              </span>
            )}
            {searchResult.query_parsed.parking_type && (
              <span className="px-2 py-0.5 rounded-md text-[10px]" style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                {searchResult.query_parsed.parking_type}
              </span>
            )}
            {searchResult.query_parsed.filters.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded-md text-[10px]" style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                {f.replace(/_/g, " ")}
              </span>
            ))}
            {searchResult.query_parsed.radius_m < 500 && (
              <span className="px-2 py-0.5 rounded-md text-[10px]" style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                {searchResult.query_parsed.radius_m}m radius
              </span>
            )}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "search" ? (
            <>
              {/* Route panel when active */}
              {(route || routing || routeError) && selectedSpot && (
                <RoutePanel
                  route={route}
                  loading={routing}
                  error={routeError}
                  spot={selectedSpot}
                  onClose={() => { setRoute(null); setRouteError(null); }}
                />
              )}

              {/* Spot list */}
              {!searching && (
                <SpotList
                  spots={spots}
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
              {spots.length} spot{spots.length !== 1 ? "s" : ""} found
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
              aria-pressed={!!isochrone}
              aria-label={isochrone ? "Hide 5-minute wheelchair reachability polygon" : "Show 5-minute wheelchair reachability polygon"}
            >
              {isochroneLoading ? (
                <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" aria-hidden="true" />
              ) : (
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
            spots={spots}
            selectedSpot={selectedSpot}
            route={route}
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
