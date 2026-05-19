import type {
  SearchResponse,
  RouteResult,
  IsochroneResult,
  SavedFavorite,
  ParkingSpot,
} from "@/types";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    const e = err as { message?: string; error?: string };
    throw new Error(e.message ?? e.error ?? "Request failed");
  }
  return res.json();
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    const e = err as { message?: string; error?: string };
    throw new Error(e.message ?? e.error ?? "Request failed");
  }
  return res.json();
}

export const api = {
  search: (query: string, session_id: string, coords?: { lat: number; lon: number }) =>
    post<SearchResponse>("/api/search", { query, session_id, ...coords }),

  route: (origin: [number, number], destination: [number, number], spot_id: string) =>
    post<RouteResult>("/api/route", { origin, destination, spot_id }),

  isochrone: (destination: [number, number], range_minutes = 5) =>
    post<IsochroneResult>("/api/isochrone", { destination, range_minutes }),

  spotDetail: (id: string) =>
    get<{ spot: ParkingSpot; community: Record<string, number> }>(`/api/spot/${id}`, {}),

  favorites: (session_id: string) =>
    get<{ favorites: SavedFavorite[] }>("/api/favorites", { session_id }),

  saveFavorite: (session_id: string, spot: ParkingSpot) =>
    post("/api/favorite", {
      session_id,
      spot_id: spot.osm_id,
      action: "save",
      spot_name: spot.name,
      spot_loc: spot.loc,
    }),

  removeFavorite: (session_id: string, spot_id: string) =>
    post("/api/favorite", { session_id, spot_id, action: "remove" }),

  report: (session_id: string, spot_id: string, status: string, note?: string) =>
    post("/api/report", { session_id, spot_id, status, note }),

  history: (session_id: string) =>
    get<{ queries: string[] }>("/api/history", { session_id }),

  stats: () => get<Record<string, unknown>>("/api/stats", {}),
};
